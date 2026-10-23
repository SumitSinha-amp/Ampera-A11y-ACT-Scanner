import { randomUUID } from "node:crypto";
import { pool, type DatabasePoolClient } from "@workspace/db";
import type { SqlBackupInput, SqlBackupJob } from "@workspace/api-zod";
import { recordAdministrativeAudit } from "../dataProtection";
import { logger } from "../logger";
import { getSqlBackupCatalog, resolveTables } from "./catalog";
import { cancelSqlDumps, dumpSections, dumpSqlToStream, restoreInstructions } from "./dump";
import { cancelSqlUploads, listStoredSqlJobs, readSqlJob, saveSqlJob, startSqlUpload } from "./storage";

const running = new Map<string, SqlBackupJob>();
const work = new Set<Promise<void>>();
let closing = false;
const LOCK = "SELECT pg_try_advisory_lock(hashtextextended('ampera:sql-backup',0)) AS locked";
const UNLOCK = "SELECT pg_advisory_unlock(hashtextextended('ampera:sql-backup',0))";
export class SqlBackupError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function listSqlJobs() {
  const stored = await listStoredSqlJobs();
  // Process-local jobs are for live status; terminal manifests live independently in R2.
  return [...running.values(), ...stored.filter(job => !running.has(job.id))]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
}

async function run(job: SqlBackupJob, client: DatabasePoolClient, actorId: string, estimatedBytes: number) {
  let upload: ReturnType<typeof startSqlUpload> | undefined;
  let heartbeatWork: Promise<void> | undefined;
  const heartbeat = setInterval(() => {
    if (heartbeatWork) return;
    heartbeatWork = saveSqlJob({ ...job }).catch(() => {
      logger.warn({ backupId: job.id }, "SQL backup heartbeat could not be stored");
    }).finally(() => { heartbeatWork = undefined; });
  }, 15_000);
  heartbeat.unref();
  const stopHeartbeat = async () => { clearInterval(heartbeat); await heartbeatWork; };
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '6h'");
    await client.query("SET LOCAL lock_timeout = '15s'");
    // Hold ACCESS SHARE locks so concurrent DDL cannot remove selected tables
    // between the catalogue and native dump's snapshot import.
    await client.query(`LOCK TABLE ${job.tableIds.join(", ")} IN ACCESS SHARE MODE`);
    const snapshot = (await client.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
    upload = startSqlUpload(job, estimatedBytes);
    upload.body.write(restoreInstructions(job));
    const sections = dumpSections(job, snapshot);
    for (let index = 0; index < sections.length; index++) {
      job.stage = sections.length > 1 ? `Exporting SQL section ${index + 1} of ${sections.length}` : "Exporting consistent PostgreSQL snapshot";
      await dumpSqlToStream(upload.body, sections[index]!);
    }
    await client.query("COMMIT");
    job.stage = "Finishing multipart upload and verification";
    upload.body.end();
    await upload.promise;
    // Never report ready if the audit record or manifest could not be saved.
    await recordAdministrativeAudit("sql_backup_completed", actorId, {
      id: job.id, scope: job.scope, content: job.content, tableCount: job.tableIds.length,
      sizeBytes: job.sizeBytes, sha256: job.sha256,
    });
    job.status = "ready"; job.stage = "Ready to download";
    await stopHeartbeat();
    await saveSqlJob(job);
  } catch (error) {
    if (upload) {
      await upload.abort().catch(() => undefined);
      await upload.promise.catch(() => undefined);
    }
    await client.query("ROLLBACK").catch(() => undefined);
    const safe = error instanceof SqlBackupError ||
      (error instanceof Error && /^(SQL |PostgreSQL |pg_dump |Independent SQL)/.test(error.message));
    job.status = "failed"; job.stage = "Export failed";
    job.error = safe ? (error as Error).message :
      "SQL backup failed. Check private R2 access, database permissions, PostgreSQL tools, and multipart upload limits. No restore was attempted.";
    // Do not log native error objects, connection details, or table content.
    logger.warn({ backupId: job.id }, "SQL backup failed");
    await stopHeartbeat();
    await saveSqlJob(job).catch(() => logger.warn({ backupId: job.id }, "SQL failure manifest could not be stored"));
    await recordAdministrativeAudit("sql_backup_failed", actorId, { id: job.id }).catch(() => undefined);
  } finally {
    await stopHeartbeat();
    await client.query(UNLOCK).catch(() => undefined);
    client.release();
    // Keep terminal status briefly even when R2 failed, but bound process memory.
    const timer = setTimeout(() => running.delete(job.id), 10 * 60_000);
    timer.unref();
  }
}

export async function startSqlBackup(input: SqlBackupInput, actorId: string) {
  if (closing) throw new SqlBackupError("The server is shutting down. Retry after it restarts.", 503);
  const catalog = await getSqlBackupCatalog();
  if (!catalog.available) throw new SqlBackupError(catalog.unavailableReason, 503);
  const selection = resolveTables(catalog.tables, input);
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query(LOCK)).rows[0].locked;
    if (!locked) throw new SqlBackupError("Another SQL backup is already running. Wait for it to finish.", 409);
    if (closing) throw new SqlBackupError("The server is shutting down. Retry after it restarts.", 503);
    await recordAdministrativeAudit("sql_backup_requested", actorId, {
      scope: input.scope, content: input.content, tableIds: selection.tableIds,
      includeDependencies: input.includeDependencies,
    });
    const now = new Date();
    const job: SqlBackupJob = {
      id: `${String(9999999999999 - now.getTime()).padStart(13, "0")}-${randomUUID()}`,
      status: "running", stage: "Preparing read-only snapshot",
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      scope: input.scope, content: input.content, ...selection,
      database: catalog.database, serverVersion: catalog.serverVersion,
      filename: `ampera-${input.scope}-${input.content}-${now.toISOString().replace(/[:.]/g, "-")}.sql`,
      sizeBytes: 0, sha256: "", error: "",
    };
    running.set(job.id, job);
    try { await saveSqlJob(job); }
    catch (error) { running.delete(job.id); throw error; }
    const estimatedBytes = catalog.tables.filter(table => selection.tableIds.includes(table.id))
      .reduce((sum, table) => sum + table.sizeBytes, 0);
    const promise = run(job, client, actorId, estimatedBytes);
    work.add(promise);
    void promise.finally(() => work.delete(promise)).catch(() => undefined);
    return { ...job };
  } catch (error) {
    if (locked) await client.query(UNLOCK).catch(() => undefined);
    client.release();
    throw error;
  }
}

export async function downloadableSqlJob(id: string) {
  const job = running.get(id) ?? await readSqlJob(id);
  if (job.status !== "ready") throw new SqlBackupError("This SQL backup is not ready.", 409);
  if (Date.parse(job.expiresAt) <= Date.now()) throw new SqlBackupError("The download has expired. Create a fresh backup.", 410);
  return job;
}

export async function drainSqlBackups() {
  closing = true;
  cancelSqlDumps();
  cancelSqlUploads();
  await Promise.allSettled(work);
}
