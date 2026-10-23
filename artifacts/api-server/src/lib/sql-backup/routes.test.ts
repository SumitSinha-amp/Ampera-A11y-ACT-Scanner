import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Readable } from "node:stream";
import type { SqlBackupJob } from "@workspace/api-zod";
import router from "../../routes/data-protection";
import { getSqlBackupCatalog } from "./catalog";
import { downloadableSqlJob, SqlBackupError, startSqlBackup } from "./service";
import { checkSqlDownload, openSqlDownload } from "./storage";
import { recordAdministrativeAudit } from "../dataProtection";

vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() } }));
vi.mock("../dataProtection", () => ({
  copyPendingEvidence: vi.fn(), protectionStatus: vi.fn(), PROTECTED_ENTITIES: [],
  recordAdministrativeAudit: vi.fn(), recordProtectionCheckpoint: vi.fn(), verifyEvidenceStorage: vi.fn(),
}));
vi.mock("../recoveryExport", () => ({ createRecoveryExport: vi.fn(), verifyRecoveryExport: vi.fn() }));
vi.mock("../evidenceStorage", () => ({ readEvidence: vi.fn(), sha256: vi.fn() }));
vi.mock("../issueRecoverySnapshot", () => ({
  backupIdPattern: /^\d{13}-.+$/, listIssueBackups: vi.fn(), requestIssueBackup: vi.fn(),
}));
vi.mock("../issueRecoveryRestore", () => ({
  IssueRecoveryError: class extends Error {}, previewIssueRecovery: vi.fn(), restoreIssueBackup: vi.fn(),
}));
vi.mock("./catalog", () => ({ getSqlBackupCatalog: vi.fn() }));
vi.mock("./service", () => ({
  SqlBackupError: class extends Error { constructor(message: string, public status = 400) { super(message); } },
  downloadableSqlJob: vi.fn(), listSqlJobs: vi.fn(), startSqlBackup: vi.fn(),
}));
vi.mock("./storage", () => ({
  sqlBackupIdPattern: /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  openSqlDownload: vi.fn(), checkSqlDownload: vi.fn(),
}));

const root = "/api/admin/data-protection/sql-backups";
const id = "8200000000000-11111111-1111-4111-8111-111111111111";
const job: SqlBackupJob = {
  id, status: "ready", stage: "Ready", createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(), scope: "all", content: "schema-and-data",
  tableIds: ['"public"."fixture"'], addedDependencies: [], database: "fixture",
  serverVersion: "16", filename: "ampera-fixture.sql", sizeBytes: 10, sha256: "a".repeat(64), error: "",
};
function app(role?: string) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    if (role) req.session = { user: { id: "7", role } } as never;
    next();
  });
  server.use("/api", router);
  return server;
}
beforeEach(() => vi.resetAllMocks());

describe("SQL backup API boundaries", () => {
  it("rejects unauthenticated and non-Super-Admin requests on every endpoint", async () => {
    for (const role of [undefined, "admin", "user"]) {
      for (const path of [root, `${root}/catalog`, `${root}/${id}/download`]) {
        expect((await request(app(role)).get(path)).status).toBe(role ? 403 : 401);
      }
      expect((await request(app(role)).post(root).send({})).status).toBe(role ? 403 : 401);
      expect((await request(app(role)).head(`${root}/${id}/download`)).status).toBe(role ? 403 : 401);
    }
    expect(getSqlBackupCatalog).not.toHaveBeenCalled();
    expect(openSqlDownload).not.toHaveBeenCalled();
  });
  it("validates explicit acknowledgement before starting any export", async () => {
    const response = await request(app("super_admin")).post(root).send({
      scope: "all", content: "schema-and-data", tableIds: [], includeDependencies: true,
    });
    expect(response.status).toBe(400);
    expect(startSqlBackup).not.toHaveBeenCalled();
  });
  it("accepts a valid request as background work and binds actor to the server session", async () => {
    vi.mocked(startSqlBackup).mockResolvedValue({ ...job, status: "running" });
    const data = { scope: "all", content: "schema-and-data", tableIds: [], includeDependencies: true, confirmation: "EXPORT DATABASE" };
    const response = await request(app("super_admin")).post(root).send(data);
    expect(response.status).toBe(202);
    expect(startSqlBackup).toHaveBeenCalledWith(data, "7");
    expect(response.headers["cache-control"]).toContain("no-store");
  });
  it("surfaces concurrency conflicts instead of launching a duplicate", async () => {
    vi.mocked(startSqlBackup).mockRejectedValue(new SqlBackupError("Already running", 409));
    const response = await request(app("super_admin")).post(root).send({
      scope: "all", content: "data-only", tableIds: [], includeDependencies: true, confirmation: "EXPORT DATABASE",
    });
    expect(response.status).toBe(409);
  });
  it("HEAD checks auth, expiry, and stored metadata without fetching the SQL body", async () => {
    vi.mocked(downloadableSqlJob).mockResolvedValue(job);
    const response = await request(app("super_admin")).head(`${root}/${id}/download`);
    expect(response.status).toBe(200);
    expect(checkSqlDownload).toHaveBeenCalledWith(job);
    expect(openSqlDownload).not.toHaveBeenCalled();
    expect(response.headers["content-length"]).toBe("10");
  });
  it("does not download expired backups", async () => {
    vi.mocked(downloadableSqlJob).mockRejectedValue(new SqlBackupError("Download expired", 410));
    expect((await request(app("super_admin")).get(`${root}/${id}/download`)).status).toBe(410);
    expect(openSqlDownload).not.toHaveBeenCalled();
  });
  it("streams SQL with private headers, checksum, download auditing, and client cleanup", async () => {
    vi.mocked(downloadableSqlJob).mockResolvedValue(job);
    const close = vi.fn();
    vi.mocked(openSqlDownload).mockResolvedValue({ stream: Readable.from(["SELECT 1;\n"]), close });
    const response = await request(app("super_admin")).get(`${root}/${id}/download`);
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("ampera-fixture.sql");
    expect(response.headers["x-backup-sha256"]).toBe(job.sha256);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(recordAdministrativeAudit).toHaveBeenCalledWith("sql_backup_download_requested", "7", { id });
    expect(close).toHaveBeenCalledOnce();
  });
  it("fails closed if the download audit cannot be saved", async () => {
    vi.mocked(downloadableSqlJob).mockResolvedValue(job);
    vi.mocked(recordAdministrativeAudit).mockRejectedValue(new Error("fixture audit unavailable"));
    expect((await request(app("super_admin")).get(`${root}/${id}/download`)).status).toBe(503);
    expect(openSqlDownload).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs and never exposes native/storage error details", async () => {
    expect((await request(app("super_admin")).get(`${root}/not-an-id/download`)).status).toBe(400);
    vi.mocked(downloadableSqlJob).mockRejectedValue(new Error("private fixture backend detail"));
    const response = await request(app("super_admin")).get(`${root}/${id}/download`);
    expect(response.status).toBe(503);
    expect(response.text).not.toContain("private fixture");
  });
});
