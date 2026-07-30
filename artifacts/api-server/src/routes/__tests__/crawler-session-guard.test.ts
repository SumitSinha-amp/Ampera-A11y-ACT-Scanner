import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

// ─── Hoisted mock functions (accessible inside vi.mock factories) ─────────────
const {
  mockDbQuery,
  mockCanAccessSite,
  mockPauseCrawlerJob,
  mockCancelCrawlerJob,
} = vi.hoisted(() => {
  const mockDbQuery = vi.fn();
  const mockCanAccessSite = vi.fn();
  const mockPauseCrawlerJob = vi.fn();
  const mockCancelCrawlerJob = vi.fn();
  return { mockDbQuery, mockCanAccessSite, mockPauseCrawlerJob, mockCancelCrawlerJob };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

/**
 * DB mock — makes every select chain thenable AND supports .limit() and
 * .orderBy().limit().offset(), consuming one mockDbQuery() call per .where().
 */
vi.mock("@workspace/db", () => {
  function makeWhere() {
    // Each where() call consumes one mockDbQuery() invocation.
    const resultPromise: Promise<any[]> = Promise.resolve().then(() => mockDbQuery());
    return {
      // Thenable — for count queries awaited directly after .where()
      then: (resolve: any, reject: any) => resultPromise.then(resolve, reject),
      catch: (reject: any) => resultPromise.catch(reject),
      // For session-lookup queries: .where().limit(n)
      limit: vi.fn(() => resultPromise),
      // For paginated list queries: .where().orderBy().limit().offset()
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          offset: vi.fn(() => resultPromise),
        })),
      })),
    };
  }

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(makeWhere),
        })),
      })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    },
    pool: {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
    },
    crawlerSessionsTable: {},
    crawlerPagesTable: {},
    brokenLinksTable: {},
    sitesTable: {},
  };
});

vi.mock("../../lib/permissions", () => ({
  canAccessSite: mockCanAccessSite,
  getEffectivePermissions: vi.fn(),
  getEffectiveSites: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../lib/crawler", () => ({
  startCrawlerJob: vi.fn().mockResolvedValue(undefined),
  pauseCrawlerJob: mockPauseCrawlerJob,
  cancelCrawlerJob: mockCancelCrawlerJob,
  resumeCrawlerJob: vi.fn().mockResolvedValue(undefined),
  startScanPhase: vi.fn().mockResolvedValue(undefined),
  isCrawlerActive: vi.fn().mockReturnValue(false),
  classifyPageType: vi.fn().mockReturnValue("General"),
  getDiscoveryCache: vi.fn().mockResolvedValue(null),
  clearDiscoveryCache: vi.fn().mockResolvedValue(undefined),
  normalizeUrl: vi.fn((u: string) => u),
  computeUrlHash: vi.fn().mockReturnValue("hash"),
}));

vi.mock("../../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  },
}));

vi.mock("../../lib/sitemap", () => ({
  parseUrlsFromCsv: vi.fn().mockReturnValue([]),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────
interface TestSessionUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  mustResetPassword: boolean;
}

async function createTestApp(sessionUser?: TestSessionUser) {
  const { default: crawlerRouter } = await import("../crawler");
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: "test-secret", resave: false, saveUninitialized: true }),
  );
  if (sessionUser) {
    app.use((req: any, _res, next) => {
      req.session.user = sessionUser;
      next();
    });
  }
  app.use("/api", crawlerRouter);
  return app;
}

const REGULAR_USER: TestSessionUser = {
  id: 10,
  username: "testuser",
  email: "test@example.com",
  fullName: "Test User",
  role: "user",
  mustResetPassword: false,
};

const ADMIN_USER: TestSessionUser = {
  id: 1,
  username: "admin",
  email: "admin@example.com",
  fullName: "Admin User",
  role: "admin",
  mustResetPassword: false,
};

/** A session owned by a different user, attached to site 42. */
const MOCK_SESSION_SITE = {
  id: 999,
  userId: "99",        // NOT the regular user (id=10)
  siteId: 42,
  seedUrl: "https://example.com",
  name: "Test Crawl",
  status: "completed", // use "completed" so SSE progress ends immediately
  config: { siteId: 42, autoScan: false },
  totalPages: 0,
  processedPages: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  completedAt: new Date("2026-01-01T01:00:00Z"),
};

/** A session owned by the regular user, no siteId. */
const MOCK_SESSION_OWN = {
  ...MOCK_SESSION_SITE,
  userId: "10",
  siteId: null,
  config: { autoScan: false },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Crawler session IDOR guard — GET /api/crawler/sessions/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPauseCrawlerJob.mockResolvedValue(undefined);
    mockCancelCrawlerJob.mockResolvedValue(undefined);
  });

  it("returns 401 when there is no authenticated session", async () => {
    const app = await createTestApp();
    const res = await request(app).get("/api/crawler/sessions/999");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user has no site access to the session", async () => {
    mockDbQuery.mockResolvedValueOnce([MOCK_SESSION_SITE]); // resolveSession lookup
    mockCanAccessSite.mockResolvedValue(null);              // no access

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app).get("/api/crawler/sessions/999");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
    expect(mockCanAccessSite).toHaveBeenCalledWith(10, "10", "user", 42);
  });

  it("returns 403 when the session has no siteId and the user is not the creator", async () => {
    const sessionOwnedByOther = { ...MOCK_SESSION_SITE, siteId: null, config: {}, userId: "99" };
    mockDbQuery.mockResolvedValueOnce([sessionOwnedByOther]);

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app).get("/api/crawler/sessions/999");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
    expect(mockCanAccessSite).not.toHaveBeenCalled();
  });

  it("returns 200 for an admin user without calling canAccessSite", async () => {
    mockDbQuery.mockResolvedValueOnce([MOCK_SESSION_SITE]);

    const app = await createTestApp(ADMIN_USER);
    const res = await request(app).get("/api/crawler/sessions/999");

    expect(mockCanAccessSite).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 999 });
  });
});

describe("Crawler session IDOR guard — POST /api/crawler/sessions/:id/pause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPauseCrawlerJob.mockResolvedValue(undefined);
    mockCancelCrawlerJob.mockResolvedValue(undefined);
  });

  it("returns 401 when there is no authenticated session", async () => {
    const app = await createTestApp();
    const res = await request(app).post("/api/crawler/sessions/999/pause");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user has no site access to the session", async () => {
    mockDbQuery.mockResolvedValueOnce([MOCK_SESSION_SITE]);
    mockCanAccessSite.mockResolvedValue(null);

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app).post("/api/crawler/sessions/999/pause");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
  });

  it("returns 200 for an admin user without calling canAccessSite", async () => {
    mockDbQuery.mockResolvedValueOnce([MOCK_SESSION_SITE]);

    const app = await createTestApp(ADMIN_USER);
    const res = await request(app).post("/api/crawler/sessions/999/pause");

    expect(mockCanAccessSite).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

describe("Crawler session IDOR guard — POST /api/crawler/sessions/:id/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPauseCrawlerJob.mockResolvedValue(undefined);
    mockCancelCrawlerJob.mockResolvedValue(undefined);
  });

  it("returns 401 when there is no authenticated session", async () => {
    const app = await createTestApp();
    const res = await request(app).post("/api/crawler/sessions/999/cancel");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user has no site access to the session", async () => {
    mockDbQuery.mockResolvedValueOnce([MOCK_SESSION_SITE]);
    mockCanAccessSite.mockResolvedValue(null);

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app).post("/api/crawler/sessions/999/cancel");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
  });

  it("returns 200 for an admin user without calling canAccessSite", async () => {
    mockDbQuery.mockResolvedValueOnce([MOCK_SESSION_SITE]);

    const app = await createTestApp(ADMIN_USER);
    const res = await request(app).post("/api/crawler/sessions/999/cancel");

    expect(mockCanAccessSite).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});

describe("Crawler session IDOR guard — GET /api/crawler/sessions/:id/pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPauseCrawlerJob.mockResolvedValue(undefined);
    mockCancelCrawlerJob.mockResolvedValue(undefined);
  });

  it("returns 401 when there is no authenticated session", async () => {
    const app = await createTestApp();
    const res = await request(app).get("/api/crawler/sessions/999/pages");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user has no site access to the session", async () => {
    mockDbQuery.mockResolvedValueOnce([MOCK_SESSION_SITE]);
    mockCanAccessSite.mockResolvedValue(null);

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app).get("/api/crawler/sessions/999/pages");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
  });

  it("returns 200 for an admin user without calling canAccessSite", async () => {
    // resolveSession lookup, then pages list, then total count
    mockDbQuery
      .mockResolvedValueOnce([MOCK_SESSION_SITE])  // resolveSession
      .mockResolvedValueOnce([])                   // pages list
      .mockResolvedValueOnce([{ total: 0 }]);      // count query

    const app = await createTestApp(ADMIN_USER);
    const res = await request(app).get("/api/crawler/sessions/999/pages");

    expect(mockCanAccessSite).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pages: [], total: 0 });
  });
});

describe("Crawler session IDOR guard — GET /api/crawler/sessions/:id/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPauseCrawlerJob.mockResolvedValue(undefined);
    mockCancelCrawlerJob.mockResolvedValue(undefined);
  });

  it("returns 401 when there is no authenticated session", async () => {
    const app = await createTestApp();
    const res = await request(app).get("/api/crawler/sessions/999/progress");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user has no site access to the session", async () => {
    mockDbQuery.mockResolvedValueOnce([MOCK_SESSION_SITE]);
    mockCanAccessSite.mockResolvedValue(null);

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app).get("/api/crawler/sessions/999/progress");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
    expect(mockCanAccessSite).toHaveBeenCalledWith(10, "10", "user", 42);
  });

  it("starts the SSE stream for an admin user (status 200, text/event-stream)", async () => {
    // resolveSession, then poll(): session lookup + 3 count queries
    mockDbQuery
      .mockResolvedValueOnce([MOCK_SESSION_SITE])          // resolveSession
      .mockResolvedValueOnce([MOCK_SESSION_SITE])          // poll() — session re-fetch
      .mockResolvedValueOnce([{ cnt: 0 }])                 // poll() — pending count
      .mockResolvedValueOnce([{ cnt: 0 }])                 // poll() — in-progress count
      .mockResolvedValueOnce([{ cnt: 0 }]);                // poll() — discovered count

    const app = await createTestApp(ADMIN_USER);
    const res = await request(app).get("/api/crawler/sessions/999/progress");

    expect(mockCanAccessSite).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
  });
});

describe("POST /api/crawler/sessions — siteId ownership guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPauseCrawlerJob.mockResolvedValue(undefined);
    mockCancelCrawlerJob.mockResolvedValue(undefined);
  });

  it("returns 401 when there is no authenticated session", async () => {
    const app = await createTestApp();
    const res = await request(app)
      .post("/api/crawler/sessions")
      .send({ seedUrl: "https://example.com", siteId: 42 });

    expect(res.status).toBe(401);
  });

  it("returns 400 when the siteId does not exist in the database", async () => {
    mockDbQuery.mockResolvedValueOnce([]); // site lookup returns nothing

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app)
      .post("/api/crawler/sessions")
      .send({ seedUrl: "https://example.com", siteId: 99999 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining("does not exist") });
    expect(mockCanAccessSite).not.toHaveBeenCalled();
  });

  it("returns 403 when the siteId exists but the user has no access to it", async () => {
    mockDbQuery.mockResolvedValueOnce([{ id: 42, name: "Test Site" }]); // site exists
    mockCanAccessSite.mockResolvedValue(null);                           // no access

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app)
      .post("/api/crawler/sessions")
      .send({ seedUrl: "https://example.com", siteId: 42 });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining("access") });
    expect(mockCanAccessSite).toHaveBeenCalledWith(10, "10", "user", 42);
  });

  it("bypasses the siteId check for admin users (canAccessSite never called)", async () => {
    mockDbQuery.mockResolvedValueOnce([{ id: 42, name: "Test Site" }]); // site exists

    const app = await createTestApp(ADMIN_USER);
    await request(app)
      .post("/api/crawler/sessions")
      .send({ seedUrl: "https://example.com", siteId: 42 });

    // The guard must have been skipped — canAccessSite should never be reached
    expect(mockCanAccessSite).not.toHaveBeenCalled();
  });
});
