import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockPoolQuery, mockGetEffectivePermissions } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockGetEffectivePermissions: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  pool: { query: mockPoolQuery },
  db: {
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  },
  notificationsTable: { id: "id" },
}));

vi.mock("../../lib/permissions", () => ({
  getEffectivePermissions: mockGetEffectivePermissions,
}));

import notificationsRouter from "../notifications";

function buildApp(role = "user") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = { user: { id: 7, role } };
    next();
  });
  app.use("/api", notificationsRouter);
  return app;
}

describe("notification recipient access", () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockGetEffectivePermissions.mockReset();
    mockGetEffectivePermissions.mockResolvedValue({ canViewIssues: true });
  });

  it("allows a regular user to load only their targeted notification query", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ role: "user", is_active: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await request(buildApp()).get("/api/notifications");
    expect(response.status).toBe(200);
    expect(mockPoolQuery).toHaveBeenNthCalledWith(2, expect.stringContaining("notification_recipients"), [7, false, true]);
  });

  it("lets a regular user mark a visible notification as read", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ role: "user", is_active: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ notification_id: 12 }], rowCount: 1 });
    const response = await request(buildApp()).put("/api/notifications/12/read");
    expect(response.status).toBe(200);
    expect(mockPoolQuery).toHaveBeenNthCalledWith(2, expect.stringContaining("target.user_id = $1"), [7, 12, false, true]);
  });

  it("does not mark another user's notification as read", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ role: "user", is_active: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await request(buildApp()).put("/api/notifications/99/read");
    expect(response.status).toBe(404);
  });

  it("keeps recipient-less system notifications available to admins", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ role: "admin", is_active: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await request(buildApp("admin")).get("/api/notifications");
    expect(response.status).toBe(200);
    expect(mockPoolQuery).toHaveBeenNthCalledWith(2, expect.stringContaining("NOT EXISTS"), [7, true, true]);
  });

  it("rejects a deactivated recipient even if the session still exists", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ role: "user", is_active: false }], rowCount: 1 });
    const response = await request(buildApp()).get("/api/notifications");
    expect(response.status).toBe(403);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  it("hides issue notifications after issue viewing permission is revoked", async () => {
    mockGetEffectivePermissions.mockResolvedValueOnce({ canViewIssues: false });
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ role: "user", is_active: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await request(buildApp()).get("/api/notifications");
    expect(response.status).toBe(200);
    expect(mockPoolQuery).toHaveBeenNthCalledWith(2, expect.any(String), [7, false, false]);
  });
});