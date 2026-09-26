import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

const { selectedRows, deletedRows, cancelScan, canAccessSite, getEffectivePermissions } = vi.hoisted(() => ({
  selectedRows: vi.fn(),
  deletedRows: vi.fn(),
  cancelScan: vi.fn(),
  canAccessSite: vi.fn(),
  getEffectivePermissions: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: selectedRows }) }),
    delete: () => ({ where: () => ({ returning: deletedRows }) }),
  },
  pool: {},
  scanSessionsTable: { id: "id", userId: "userId", siteId: "siteId", status: "status" },
  pageResultsTable: {},
  pageInteractionStatesTable: {},
  accessibilityIssuesTable: {},
  projectsTable: {},
  projectSitesTable: {},
  appSettingsTable: {},
  sitesTable: {},
  aiIssueAssessmentsTable: {},
}));

vi.mock("../../lib/permissions", () => ({
  canAccessSite,
  getEffectivePermissions,
  getEffectiveSites: vi.fn(),
}));
vi.mock("../../lib/scanQueue", () => ({
  startScan: vi.fn(),
  cancelScan,
  pauseScan: vi.fn(),
  resumeScan: vi.fn(),
  isScanActive: vi.fn(),
  queueRetryUrl: vi.fn(),
  addUrlsToRunningScan: vi.fn(),
  removeQueuedUrl: vi.fn(),
  clearQueuedUrlRemoval: vi.fn(),
  wafPageTokens: new Map(),
  wafTokenIndex: new Map(),
}));
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function appFor(role = "user") {
  const { default: scansRouter } = await import("../scans");
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-secret", resave: false, saveUninitialized: true }));
  app.use((req: any, _res, next) => {
    req.session.user = { id: 10, role };
    next();
  });
  app.use("/api", scansRouter);
  return app;
}

describe("DELETE /api/scans/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEffectivePermissions.mockResolvedValue({ canDeleteScan: true, canViewAllScans: false });
    canAccessSite.mockResolvedValue(true);
    selectedRows.mockResolvedValue([
      { id: 1, userId: "10", siteId: 42 },
      { id: 2, userId: "10", siteId: 42 },
    ]);
    deletedRows.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it("deletes scans of any status and cancels active work first", async () => {
    const app = await appFor();
    const response = await request(app).delete("/api/scans/bulk").send({ ids: [1, 2] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: 2 });
    expect(cancelScan).toHaveBeenCalledWith(1);
    expect(cancelScan).toHaveBeenCalledWith(2);
    expect(deletedRows).toHaveBeenCalledOnce();
  });

  it("rejects the whole batch if site access is missing", async () => {
    canAccessSite.mockResolvedValue(false);
    const app = await appFor();
    const response = await request(app).delete("/api/scans/bulk").send({ ids: [1, 2] });
    expect(response.status).toBe(403);
    expect(cancelScan).not.toHaveBeenCalled();
    expect(deletedRows).not.toHaveBeenCalled();
  });

  it("rejects the whole batch if another user's scan is selected", async () => {
    selectedRows.mockResolvedValue([
      { id: 1, userId: "10", siteId: 42 },
      { id: 2, userId: "11", siteId: 42 },
    ]);
    const app = await appFor();
    const response = await request(app).delete("/api/scans/bulk").send({ ids: [1, 2] });
    expect(response.status).toBe(403);
    expect(deletedRows).not.toHaveBeenCalled();
  });

  it("does not delete a partial batch when a scan no longer exists", async () => {
    selectedRows.mockResolvedValue([{ id: 1, userId: "10", siteId: 42 }]);
    const app = await appFor();
    const response = await request(app).delete("/api/scans/bulk").send({ ids: [1, 2] });
    expect(response.status).toBe(404);
    expect(deletedRows).not.toHaveBeenCalled();
  });

  it("requires deletion permission", async () => {
    getEffectivePermissions.mockResolvedValue({ canDeleteScan: false });
    const app = await appFor();
    const response = await request(app).delete("/api/scans/bulk").send({ ids: [1, 2] });
    expect(response.status).toBe(403);
    expect(deletedRows).not.toHaveBeenCalled();
  });
});