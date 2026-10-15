import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRecoveryPlan, restoreIssueBackup } from "./issueRecoveryRestore";
import { validateSnapshot, recoveryNamespace, readIssueSnapshot, type IssueSnapshot, SNAPSHOT_TABLES } from "./issueRecoverySnapshot";
import { pool } from "@workspace/db";
import { readEvidence } from "./evidenceStorage";

vi.mock("@workspace/db", () => ({ pool: { connect: vi.fn(), query: vi.fn() } }));
vi.mock("./evidenceStorage", async original => ({
  ...await original<typeof import("./evidenceStorage")>(), readEvidence: vi.fn(), writeEvidence: vi.fn(),
}));
vi.mock("./issueRecoverySnapshot", async original => ({
  ...await original<typeof import("./issueRecoverySnapshot")>(), readIssueSnapshot: vi.fn(),
}));
const date = "2026-10-14T00:00:00.000Z";
function snapshot(): IssueSnapshot {
  const tables = Object.fromEntries(SNAPSHOT_TABLES.map(table => [table, []])) as IssueSnapshot["tables"];
  tables.users = [{ id: 1, email: "fixture@example.invalid", username: "fixture", full_name: "Fixture" }];
  tables.app_issues = [{ id: 5, issue_key: "AMP-1000", title: "Recovered fixture", reporter_id: 1, created_at: date }];
  return { format: "ampera-issue-recovery-v1", id: "8200000000000-11111111-1111-4111-8111-111111111111",
    datasetId: "11111111-1111-4111-8111-111111111111", namespace: recoveryNamespace(), createdAt: date,
    counts: Object.fromEntries(SNAPSHOT_TABLES.map(table => [table, tables[table]!.length])), tables, files: [] };
}
const emptyState = () => Object.fromEntries([...SNAPSHOT_TABLES, "issue_recovery_mappings"].map(table => [table, [] as any[]]));
beforeEach(() => vi.clearAllMocks());

describe("Issue Management recovery", () => {
  it("validates complete independent snapshots and rejects missing attachment bytes", () => {
    const backup = snapshot();
    expect(validateSnapshot(backup)).toBe(backup);
    backup.tables.app_issue_attachments!.push({ id: 2, issue_id: 5, uploaded_by: 1, size: 1, pending: false });
    backup.counts.app_issue_attachments = 1;
    expect(() => validateSnapshot(backup)).toThrow(/Incomplete attachment/);
  });
  it("rejects foreign namespaces and duplicate issue keys", () => {
    const backup = snapshot();
    backup.namespace += "-foreign";
    expect(() => validateSnapshot(backup)).toThrow(/foreign/);
    backup.namespace = recoveryNamespace();
    backup.tables.app_issues!.push({ ...backup.tables.app_issues![0], id: 6 });
    backup.counts.app_issues = 2;
    expect(() => validateSnapshot(backup)).toThrow(/Duplicate issue key/);
  });
  it("recovers missing issues and disabled authors without relying on old IDs", () => {
    const plan = makeRecoveryPlan(snapshot(), emptyState(), false);
    expect(plan.counts.app_issues).toBe(1);
    expect(plan.counts.users).toBe(1);
    expect(plan.warnings.join(" ")).toMatch(/disabled/);
    expect(plan.conflicts).toEqual([]);
  });
  it("preserves newer issue content and recovers missing comments only", () => {
    const backup = snapshot(), state = emptyState();
    backup.tables.app_issue_comments = [{ id: 2, issue_id: 5, author_id: 1, body: "Missing comment", created_at: date }];
    state.app_issues = [{ id: 77, issue_key: "AMP-1000", title: "Newer title" }];
    state.users = [{ ...backup.tables.users![0], id: 44 }];
    const plan = makeRecoveryPlan(backup, state, false);
    expect(plan.counts.app_issues).toBe(0);
    expect(plan.counts.app_issue_comments).toBe(1);
    expect(plan.maps.app_issues!.get(5)).toBe(77);
    expect(plan.maps.users!.get(1)).toBe(44);
    expect(plan.counts.users).toBe(0);
  });
  it("does not mistake recycled row IDs for a matching issue", () => {
    const state = emptyState();
    state.app_issues = [{ id: 5, issue_key: "AMP-OTHER" }];
    expect(makeRecoveryPlan(snapshot(), state, false).counts.app_issues).toBe(1);
  });
  it("preserves an existing author whose login identity changed in the same database", () => {
    const state = emptyState();
    state.users = [{ id: 1, email: "renamed@example.invalid", username: "renamed" }];
    const plan = makeRecoveryPlan(snapshot(), state, true);
    expect(plan.counts.users).toBe(0);
    expect(plan.maps.users!.get(1)).toBe(1);
  });
  it("does not suppress a missing sibling comment with the same creation timestamp", () => {
    const backup = snapshot(), state = emptyState();
    backup.tables.app_issue_comments = [{ id: 2, issue_id: 5, author_id: 1, body: "Lost sibling", created_at: date }];
    state.app_issues = [{ id: 5, issue_key: "AMP-1000" }];
    state.app_issue_comments = [{ id: 3, issue_id: 5, author_id: 1, body: "Surviving sibling", created_at: date }];
    state.users = backup.tables.users!;
    expect(makeRecoveryPlan(backup, state, true).counts.app_issue_comments).toBe(1);
  });
  it("detects ambiguous user identities rather than assigning the wrong author", () => {
    const state = emptyState();
    state.users = [{ id: 7, email: "fixture@example.invalid", username: "other" }, { id: 8, username: "fixture", email: "other@example.invalid" }];
    expect(makeRecoveryPlan(snapshot(), state, false).conflicts.join(" ")).toMatch(/different live accounts/);
  });
  it("uses persistent mappings to avoid duplicate restored comments", () => {
    const backup = snapshot(), state = emptyState();
    backup.tables.app_issue_comments = [{ id: 2, issue_id: 5, author_id: 1, created_at: date, body: "Older" }];
    state.app_issues = [{ id: 77, issue_key: "AMP-1000" }];
    state.app_issue_comments = [{ id: 90, issue_id: 77, created_at: date, body: "Newer" }];
    state.issue_recovery_mappings = [{ source_table: "app_issue_comments", source_id: 2, target_id: 90,
      identity: `AMP-1000:${date}:app_issue_comments` }];
    const plan = makeRecoveryPlan(backup, state, false);
    expect(plan.counts.app_issue_comments).toBe(0);
    expect(plan.maps.app_issue_comments!.get(2)).toBe(90);
  });
  it("rejects changed data after preview and rolls back before inserting", async () => {
    vi.mocked(readIssueSnapshot).mockResolvedValue({ snapshot: snapshot(), checksum: "digest" });
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT dataset_id") ? [{ dataset_id: "other" }] : [] }));
    const release = vi.fn();
    vi.mocked(pool.connect).mockResolvedValue({ query, release } as never);
    await expect(restoreIssueBackup(snapshot().id, "1", "Recovery drill", "stale-preview")).rejects.toThrow(/changed after the preview/);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => /INSERT INTO app_issues/.test(sql))).toBe(false);
    expect(release).toHaveBeenCalled();
  });
  it("verifies file integrity before opening a mutation transaction", async () => {
    const backup = snapshot();
    backup.files = [{ attachmentId: 1, key: "key", sha256: "wrong", size: 3 }];
    vi.mocked(readIssueSnapshot).mockResolvedValue({ snapshot: backup, checksum: "digest" });
    vi.mocked(readEvidence).mockResolvedValue(Buffer.from("bad"));
    await expect(restoreIssueBackup(backup.id, "1", "Recovery drill", "hash")).rejects.toThrow(/integrity/);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
