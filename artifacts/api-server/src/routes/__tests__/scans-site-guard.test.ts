import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

// ─── Hoisted mock functions (accessible inside vi.mock factories) ─────────────
const {
  mockDbSelectLimit,
  mockDbInsertReturning,
  mockDbInsertValues,
  mockCanAccessSite,
  mockGetEffectivePermissions,
  mockStartScan,
} = vi.hoisted(() => {
  const mockDbSelectLimit = vi.fn();
  const mockDbInsertReturning = vi.fn();
  const mockDbInsertValues = vi.fn(() => ({ returning: mockDbInsertReturning }));
  const mockCanAccessSite = vi.fn();
  const mockGetEffectivePermissions = vi.fn();
  const mockStartScan = vi.fn();
  return {
    mockDbSelectLimit,
    mockDbInsertReturning,
    mockDbInsertValues,
    mockCanAccessSite,
    mockGetEffectivePermissions,
    mockStartScan,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mockDbSelectLimit })),
      })),
    })),
    insert: vi.fn(() => ({ values: mockDbInsertValues })),
  },
  pool: { on: vi.fn(), query: vi.fn(), end: vi.fn(), connect: vi.fn() },
  scanSessionsTable: { id: "scanSessionsTable.id" },
  pageResultsTable: { scanId: "pageResultsTable.scanId" },
  accessibilityIssuesTable: {},
  projectsTable: {},
  projectSitesTable: { projectId: "projectSitesTable.projectId", siteId: "projectSitesTable.siteId" },
  appSettingsTable: {},
  sitesTable: { id: "sitesTable.id" },
}));

vi.mock("../../lib/permissions", () => ({
  canAccessSite: mockCanAccessSite,
  getEffectivePermissions: mockGetEffectivePermissions,
  getEffectiveSites: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../lib/scanQueue", () => ({
  startScan: mockStartScan,
  cancelScan: vi.fn().mockReturnValue(false),
  pauseScan: vi.fn().mockReturnValue(false),
  resumeScan: vi.fn().mockReturnValue(false),
  isScanActive: vi.fn().mockReturnValue(false),
  isScanPaused: vi.fn().mockReturnValue(false),
  queueRetryUrl: vi.fn().mockReturnValue(false),
  addUrlsToRunningScan: vi.fn().mockResolvedValue(undefined),
  wafPageTokens: new Map(),
  wafTokenIndex: new Map(),
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
  const { default: scansRouter } = await import("../scans");
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
  app.use("/api", scansRouter);
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

const MOCK_SCAN_SESSION = {
  id: 999,
  userId: "10",
  siteId: 42,
  status: "pending",
  totalUrls: 1,
  scannedUrls: 0,
  failedUrls: 0,
  totalIssues: 0,
  criticalIssues: 0,
  name: null,
  projectId: null,
  groupId: null,
  initiatorName: null,
  initiatorRole: null,
  options: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  completedAt: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("POST /api/scans — siteId guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartScan.mockResolvedValue(undefined);
    mockDbInsertReturning.mockResolvedValue([MOCK_SCAN_SESSION]);
    mockDbInsertValues.mockReturnValue({ returning: mockDbInsertReturning });
    mockGetEffectivePermissions.mockResolvedValue({
      canScan: true,
      canExport: true,
      canViewAllScans: false,
      canEditScan: true,
      canDeleteScan: true,
      canManageScan: true,
      canCreateProject: true,
      canDeleteProject: true,
      canDisableJs: false,
      canSmartAnalysis: false,
      canSwitchSite: false,
      allowedRules: null,
    });
  });

  it("returns 401 when there is no authenticated session", async () => {
    const app = await createTestApp();
    const res = await request(app)
      .post("/api/scans")
      .send({ urls: ["https://example.com"], siteId: 42 });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 400 when the siteId does not exist in the database", async () => {
    mockDbSelectLimit.mockResolvedValue([]); // no site found

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app)
      .post("/api/scans")
      .send({ urls: ["https://example.com"], siteId: 99999, projectId: 7 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("does not exist"),
    });
  });

  it("returns 403 when the siteId exists but the user has no access to it", async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: 42 }]); // site exists
    mockCanAccessSite.mockResolvedValue(false);          // user cannot access it

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app)
      .post("/api/scans")
      .send({ urls: ["https://example.com"], siteId: 42, projectId: 7 });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("access"),
    });
  });

  it("returns 201 when the siteId exists and the user has access", async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: 42 }]); // site exists
    mockCanAccessSite.mockResolvedValue(true);           // user has access

    const app = await createTestApp(REGULAR_USER);
    const res = await request(app)
      .post("/api/scans")
      .send({ urls: ["https://example.com"], siteId: 42, projectId: 7 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 999, siteId: 42 });
  });

  it("returns 201 for an admin user regardless of canAccessSite", async () => {
    mockDbSelectLimit.mockResolvedValue([{ id: 42 }]); // site exists

    const adminUser: TestSessionUser = { ...REGULAR_USER, role: "admin" };
    const app = await createTestApp(adminUser);
    const res = await request(app)
      .post("/api/scans")
      .send({ urls: ["https://example.com"], siteId: 42, projectId: 7 });

    // Admin bypasses canAccessSite — should never have been called
    expect(mockCanAccessSite).not.toHaveBeenCalled();
    expect(res.status).toBe(201);
  });
});
