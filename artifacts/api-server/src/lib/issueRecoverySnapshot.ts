import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { pool } from "@workspace/db";
import { evidenceStorageConfig, listEvidence, readEvidence, sha256, writeEvidence } from "./evidenceStorage";
import { IssueAttachmentStorageService } from "./issueAttachmentStorage";
import { logger } from "./logger";

export const ISSUE_TABLES = ["app_issues", "app_issue_comments", "app_issue_activity", "app_issue_attachments", "app_issue_links"] as const;
export const SNAPSHOT_TABLES = ["users", "projects", "sites", ...ISSUE_TABLES] as const;
export type RecoveryRow = Record<string, any>;
export interface IssueSnapshot {
  format: "ampera-issue-recovery-v1";
  id: string;
  datasetId: string;
  namespace: string;
  createdAt: string;
  counts: Record<string, number>;
  tables: Record<string, RecoveryRow[]>;
  files: { attachmentId: number; key: string; sha256: string; size: number }[];
}
export const MAX_METADATA = 32 * 1024 * 1024;
export const MAX_FILE = 64 * 1024 * 1024;
export const backupIdPattern = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function recoveryNamespace() {
  const namespace = process.env.ISSUE_RECOVERY_NAMESPACE?.trim() || (process.env.NODE_ENV === "production" ? "production" : "development");
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(namespace)) throw new Error("Invalid Issue Recovery namespace");
  return namespace;
}
export const recoveryPrefix = () => `recovery/issues/${recoveryNamespace()}/`;
export function manifestKey(id: string) {
  if (!backupIdPattern.test(id)) throw new Error("Invalid issue backup ID");
  return `${recoveryPrefix()}manifests/${id}.json.gz`;
}
export function fileKey(digest: string) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid recovery file checksum");
  return `${recoveryPrefix()}files/${digest}`;
}

export function validateSnapshot(value: unknown): IssueSnapshot {
  const data = value as IssueSnapshot;
  if (!data || data.format !== "ampera-issue-recovery-v1" || !backupIdPattern.test(data.id)
    || !/^[0-9a-f-]{36}$/.test(data.datasetId) || data.namespace !== recoveryNamespace()
    || !Number.isFinite(Date.parse(data.createdAt)) || !data.tables || !data.counts || !Array.isArray(data.files)) {
    throw new Error("Invalid or foreign issue backup");
  }
  for (const table of SNAPSHOT_TABLES) {
    const rows = data.tables[table];
    if (!Array.isArray(rows) || rows.length !== data.counts[table]) throw new Error("Issue backup counts do not match");
    const ids = new Set<number>();
    for (const row of rows) {
      if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id)) throw new Error("Invalid duplicate recovery record");
      ids.add(row.id);
    }
  }
  const issueIds = new Set(data.tables.app_issues!.map(row => row.id));
  const userIds = new Set(data.tables.users!.map(row => row.id));
  const commentIds = new Map(data.tables.app_issue_comments!.map(row => [row.id, row.issue_id]));
  for (const row of data.tables.app_issues!) {
    if (typeof row.issue_key !== "string" || !row.issue_key || typeof row.title !== "string" || !userIds.has(row.reporter_id)) throw new Error("Invalid recovered issue");
  }
  if (new Set(data.tables.app_issues!.map(row => row.issue_key)).size !== issueIds.size) throw new Error("Duplicate issue key");
  for (const table of ["app_issue_comments", "app_issue_activity", "app_issue_attachments"]) {
    for (const row of data.tables[table]!) {
      const actor = row.author_id ?? row.actor_id ?? row.uploaded_by;
      if (!issueIds.has(row.issue_id) || !userIds.has(actor)) throw new Error("Invalid issue child relationship");
      if (table === "app_issue_attachments" && (row.pending || (row.comment_id != null && commentIds.get(row.comment_id) !== row.issue_id))) throw new Error("Invalid attachment relationship");
    }
  }
  for (const row of data.tables.app_issue_links!) {
    if (!issueIds.has(row.source_issue_id) || !issueIds.has(row.target_issue_id)) throw new Error("Invalid issue link");
  }
  const attachments = new Map(data.tables.app_issue_attachments!.map(row => [row.id, row]));
  const files = new Set<number>();
  for (const file of data.files) {
    const attachment = attachments.get(file.attachmentId);
    if (!attachment || files.has(file.attachmentId) || file.key !== fileKey(file.sha256)
      || file.size !== attachment.size || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE) throw new Error("Invalid attachment backup");
    files.add(file.attachmentId);
  }
  if (files.size !== attachments.size) throw new Error("Incomplete attachment backup");
  return data;
}

export async function readIssueSnapshot(id: string) {
  const bytes = await readEvidence(manifestKey(id), true);
  const snapshot = validateSnapshot(JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_METADATA }).toString("utf8")));
  if (snapshot.id !== id) throw new Error("Issue backup identity mismatch");
  return { snapshot, checksum: sha256(bytes) };
}
export async function listIssueBackups(cursor?: string) {
  const prefix = `${recoveryPrefix()}manifests/`;
  const catalogue = await listEvidence(prefix, cursor);
  const state = (await pool.query("SELECT *, lease_until>NOW() AS running FROM issue_recovery_state WHERE id=1")).rows[0];
  return { namespace: recoveryNamespace(), intervalMinutes: 30, state,
    backups: catalogue.objects.filter(object => backupIdPattern.test(object.key.slice(prefix.length).replace(/\.json\.gz$/, "")))
      .map(object => ({ id: object.key.slice(prefix.length).replace(/\.json\.gz$/, ""), createdAt: object.createdAt, sizeBytes: object.sizeBytes })),
    nextCursor: catalogue.nextCursor };
}

async function boundedFile(response: Response) {
  if (!response.ok || !response.body) throw new Error("Attachment download failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_FILE) throw new Error("An attachment exceeds the 64 MB backup limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => undefined); }
}

export async function createIssueSnapshot(datasetId: string): Promise<IssueSnapshot> {
  evidenceStorageConfig();
  const capturedAt = new Date().toISOString();
  const tables: IssueSnapshot["tables"] = {};
  const counts: Record<string, number> = {};
  const client = await pool.connect();
  let size = 0;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    const queries: Record<string, string> = {
      users: "SELECT id,email,username,full_name FROM users WHERE id IN (SELECT reporter_id FROM app_issues UNION SELECT assignee_id FROM app_issues UNION SELECT author_id FROM app_issue_comments UNION SELECT jsonb_array_elements_text(mentions)::integer FROM app_issue_comments UNION SELECT actor_id FROM app_issue_activity UNION SELECT uploaded_by FROM app_issue_attachments UNION SELECT created_by FROM app_issue_links) OR id::text IN (SELECT user_id FROM sites WHERE id IN (SELECT site_id FROM app_issues))",
      projects: "SELECT id,name,archived,created_at FROM projects WHERE id IN (SELECT project_id FROM app_issues)",
      sites: "SELECT id,name,base_url,user_id,archived,created_at FROM sites WHERE id IN (SELECT site_id FROM app_issues)",
    };
    for (const table of SNAPSHOT_TABLES) {
      tables[table] = [];
      let cursor = 0;
      const source = queries[table] || `SELECT * FROM ${table}${table === "app_issue_attachments" ? " WHERE pending=FALSE" : ""}`;
      for (;;) {
        const rows = (await client.query(`SELECT * FROM (${source}) snapshot WHERE id>$1 ORDER BY id LIMIT 100`, [cursor])).rows;
        if (!rows.length) break;
        for (const row of rows) {
          size += Buffer.byteLength(JSON.stringify(row));
          if (size > MAX_METADATA - 1024 * 1024) throw new Error("Issue metadata exceeds the 32 MB backup limit");
          tables[table]!.push(row);
          cursor = row.id;
        }
      }
      counts[table] = tables[table]!.length;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  const files: IssueSnapshot["files"] = [];
  const attachments = new IssueAttachmentStorageService();
  for (const row of tables.app_issue_attachments!) {
    // Renew the shared lease while copying files. A crashed instance is recoverable.
    await pool.query("UPDATE issue_recovery_state SET lease_until=NOW()+INTERVAL '30 minutes' WHERE id=1");
    const bytes = await boundedFile(await attachments.downloadObject(row.object_path, row.content_type));
    if (bytes.length !== row.size) throw new Error("Attachment size changed during backup");
    const digest = sha256(bytes), key = fileKey(digest);
    await writeEvidence(key, bytes, row.content_type);
    files.push({ attachmentId: row.id, key, sha256: digest, size: row.size });
  }
  const snapshot = validateSnapshot({
    format: "ampera-issue-recovery-v1", datasetId, namespace: recoveryNamespace(),
    id: `${String(9999999999999 - Date.now()).padStart(13, "0")}-${randomUUID()}`,
    createdAt: capturedAt, counts, tables, files,
  });
  const bytes = Buffer.from(JSON.stringify(snapshot));
  if (bytes.length > MAX_METADATA) throw new Error("Issue metadata exceeds the 32 MB backup limit");
  // Publish the manifest last: catalogue entries always have all attachment bytes.
  await writeEvidence(manifestKey(snapshot.id), gzipSync(bytes), "application/gzip");
  return snapshot;
}

let work: Promise<void> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let stopping = false;
export async function requestIssueBackup(force = false) {
  if (stopping || work) return false;
  const claimed = (await pool.query(`UPDATE issue_recovery_state SET lease_until=NOW()+INTERVAL '30 minutes',
    last_started_at=NOW(),last_error=NULL WHERE id=1 AND (lease_until IS NULL OR lease_until<NOW())
    AND ($1::boolean OR next_attempt_at<=NOW()) RETURNING dataset_id`, [force])).rows[0];
  if (!claimed) return false;
  work = (async () => {
    try {
      const snapshot = await createIssueSnapshot(claimed.dataset_id);
      await pool.query(`UPDATE issue_recovery_state SET lease_until=NULL,next_attempt_at=NOW()+INTERVAL '30 minutes',
        last_backup_at=NOW(),last_backup_id=$1,counts=$2,last_error=NULL WHERE id=1`,
      [snapshot.id, JSON.stringify(snapshot.counts)]);
    } catch (error) {
      logger.warn({ errorName: (error as Error)?.name }, "Issue recovery backup failed; previous backups retained");
      await pool.query(`UPDATE issue_recovery_state SET lease_until=NULL,next_attempt_at=NOW()+INTERVAL '5 minutes',
        last_error=$1 WHERE id=1`, ["Issue backup failed. Check private R2 access, attachment availability and the documented size limits. Previous completed backups remain available."]);
    }
  })().catch(() => logger.warn("Issue backup state could not be saved; the expired lease will retry"))
    .finally(() => { work = undefined; });
  return true;
}
export function startIssueRecovery() {
  stopping = false;
  const tick = () => { void requestIssueBackup().catch(() => logger.warn("Issue backup scheduler will retry")); };
  timer = setInterval(tick, 60_000);
  timer.unref();
  tick();
}
export async function stopIssueRecovery() {
  stopping = true;
  if (timer) clearInterval(timer);
  await work;
}
