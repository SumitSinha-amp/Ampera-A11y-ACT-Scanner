import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

const { mockGetEffectivePermissions } = vi.hoisted(() => ({
  mockGetEffectivePermissions: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  appIssuesTable: { id: "appIssues.id", reporterId: "appIssues.reporterId", siteId: "appIssues.siteId", archived: "appIssues.archived", epicId: "appIssues.epicId", updatedAt: "appIssues.updatedAt" },
  appIssueCommentsTable: {},
  appIssueActivityTable: {},
  appIssueAttachmentsTable: {},
  appIssueLinksTable: { id: "appIssueLinks.id", sourceIssueId: "appIssueLinks.sourceIssueId", targetIssueId: "appIssueLinks.targetIssueId" },
  usersTable: {},
  sitesTable: {},
  projectsTable: {},
}));

vi.mock("../../lib/permissions", () => ({
  canAccessSite: vi.fn(),
  getEffectivePermissions: mockGetEffectivePermissions,
  getEffectiveSites: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../lib/objectStorage", () => ({
  ObjectStorageService: class ObjectStorageService {},
}));

interface TestSessionUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  mustResetPassword: boolean;
}

const USER: TestSessionUser = {
  id: 10,
  username: "testuser",
  email: "test@example.com",
  fullName: "Test User",
  role: "user",
  mustResetPassword: false,
};

async function createTestApp(sessionUser?: TestSessionUser) {
  const { default: issuesRouter } = await import("../issues");
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-secret", resave: false, saveUninitialized: true }));
  if (sessionUser) {
    app.use((req: any, _res, next) => {
      req.session.user = sessionUser;
      next();
    });
  }
  app.use("/api", issuesRouter);
  return app;
}

describe("issue relationship permission guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers issue creation and requires authentication", async () => {
    const app = await createTestApp();
    const response = await request(app).post("/api/issues").send({ title: "Route registration check" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Unauthorized");
  });

  it("requires authentication before a relationship can be created", async () => {
    const app = await createTestApp();
    const response = await request(app).post("/api/issues/1/links").send({ targetIssueId: 2, linkType: "blocks" });

    expect(response.status).toBe(401);
  });

  it("does not allow issue viewers to create relationships", async () => {
    mockGetEffectivePermissions.mockResolvedValue({
      canViewIssues: true,
      canCreateIssue: false,
      canEditIssue: false,
      canCommentIssue: false,
      canManageIssues: false,
    });
    const app = await createTestApp(USER);
    const response = await request(app).post("/api/issues/1/links").send({ targetIssueId: 2, linkType: "blocks" });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("permission");
  });
});