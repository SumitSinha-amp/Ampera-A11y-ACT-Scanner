import { Router } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";
import { requireSuperAdmin } from "../middlewares/authMiddleware";
import { copyPendingEvidence, protectionStatus, PROTECTED_ENTITIES, recordAdministrativeAudit,
  recordProtectionCheckpoint, verifyEvidenceStorage } from "../lib/dataProtection";
import { createRecoveryExport, verifyRecoveryExport } from "../lib/recoveryExport";
import { readEvidence, sha256 } from "../lib/evidenceStorage";
import { backupIdPattern, listIssueBackups, requestIssueBackup } from "../lib/issueRecoverySnapshot";
import { IssueRecoveryError, previewIssueRecovery, restoreIssueBackup } from "../lib/issueRecoveryRestore";
import { CreateSqlBackupBody } from "@workspace/api-zod";
import { pipeline } from "node:stream/promises";
import { getSqlBackupCatalog } from "../lib/sql-backup/catalog";
import { sqlBackupIdPattern, openSqlDownload, checkSqlDownload } from "../lib/sql-backup/storage";
import { downloadableSqlJob, listSqlJobs, SqlBackupError, startSqlBackup } from "../lib/sql-backup/service";

const router = Router();
router.use("/admin/data-protection", requireSuperAdmin);
const root = "/admin/data-protection";
router.use(`${root}/sql-backups`, (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
router.get(`${root}/sql-backups/catalog`, async (_req, res) => {
  try { res.json(await getSqlBackupCatalog()); }
  catch { res.status(503).json({ error: "The database table catalogue could not be read." }); }
});
router.get(`${root}/sql-backups`, async (_req, res) => {
  try { res.json(await listSqlJobs()); }
  catch { res.status(503).json({ error: "SQL backup storage could not be read. Check independent R2 configuration and access." }); }
});
router.post(`${root}/sql-backups`, async (req, res) => {
  const parsed = CreateSqlBackupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a backup scope and content, select tables if needed, and type EXPORT DATABASE." });
    return;
  }
  try { res.status(202).json(await startSqlBackup(parsed.data, String(req.session!.user!.id))); }
  catch (error) {
    res.status(error instanceof SqlBackupError ? error.status : 400).json({
      error: error instanceof SqlBackupError ? error.message :
        "SQL backup could not start. Refresh the table list and check database and private storage access.",
    });
  }
});
router.head(`${root}/sql-backups/:id/download`, async (req, res) => {
  const id = String(req.params.id);
  if (!sqlBackupIdPattern.test(id)) { res.status(400).end(); return; }
  try {
    const job = await downloadableSqlJob(id);
    await checkSqlDownload(job);
    res.setHeader("Content-Length", String(job.sizeBytes));
    res.setHeader("X-Backup-SHA256", job.sha256);
    res.status(200).end();
  } catch (error) { res.status(error instanceof SqlBackupError ? error.status : 503).end(); }
});
router.get(`${root}/sql-backups/:id/download`, async (req, res) => {
  const id = String(req.params.id);
  if (!sqlBackupIdPattern.test(id)) { res.status(400).json({ error: "Invalid SQL backup ID." }); return; }
  let download: Awaited<ReturnType<typeof openSqlDownload>> | undefined;
  try {
    const job = await downloadableSqlJob(id);
    await recordAdministrativeAudit("sql_backup_download_requested", String(req.session!.user!.id), { id: job.id });
    download = await openSqlDownload(job);
    res.setHeader("Content-Type", "application/sql");
    const filename = /^ampera-[a-zA-Z0-9_.-]+\.sql$/.test(job.filename) ? job.filename : `ampera-${id}.sql`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(job.sizeBytes));
    res.setHeader("X-Backup-SHA256", job.sha256);
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    await pipeline(download.stream, res);
    await recordAdministrativeAudit("sql_backup_download_completed", String(req.session!.user!.id), { id: job.id });
  } catch (error) {
    if (!res.headersSent) {
      res.status(error instanceof SqlBackupError ? error.status : 503).json({
        error: error instanceof SqlBackupError ? error.message : "SQL backup download failed or was not found. Retry or create a fresh backup.",
      });
    } else if (!res.writableEnded) res.destroy();
  } finally { download?.close(); }
});
const entitySchema = z.enum(["projects", "sites", "users", "app_issues"]);
const restorationSchema = z.object({ entity: entitySchema, id: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500) });
const passphraseSchema = z.object({ passphrase: z.string().min(16).max(512) });
const idSchema = z.string().uuid();
let exportRunning = false;
let issueRestoreRunning = false;
const issueBackupId = z.string().regex(backupIdPattern);
const issueRestoreInput = z.object({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(5).max(500),
  confirmation: z.literal("RESTORE ISSUES"),
});

router.get(`${root}/issue-backups`, async (req, res) => {
  const cursor = typeof req.query.cursor === "string" && req.query.cursor.length <= 2048 ? req.query.cursor : undefined;
  try { res.json(await listIssueBackups(cursor)); }
  catch { res.status(503).json({ error: "Issue recovery storage could not be read. Check independent R2 credentials and namespace configuration." }); }
});
router.post(`${root}/issue-backups`, async (req, res) => {
  await recordAdministrativeAudit("issue_backup_requested", String(req.session!.user!.id), {});
  if (!(await requestIssueBackup(true))) { res.status(409).json({ error: "An issue backup is already running; wait for it to finish." }); return; }
  res.status(202).json({ started: true });
});
router.post(`${root}/issue-backups/:id/preview`, async (req, res) => {
  const id = issueBackupId.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid issue backup ID" }); return; }
  try { res.json(await previewIssueRecovery(id.data)); }
  catch (error) {
    res.status(error instanceof IssueRecoveryError ? error.status : 503).json({
      error: error instanceof IssueRecoveryError ? error.message : "Issue backup could not be verified. No records were changed.",
    });
  }
});
router.post(`${root}/issue-backups/:id/restore`, async (req, res) => {
  const id = issueBackupId.safeParse(req.params.id), body = issueRestoreInput.safeParse(req.body);
  if (!id.success || !body.success) { res.status(400).json({ error: "Preview this backup, provide a 5–500 character reason and type RESTORE ISSUES." }); return; }
  if (issueRestoreRunning) { res.status(409).json({ error: "Another issue recovery is running." }); return; }
  issueRestoreRunning = true;
  try { res.json(await restoreIssueBackup(id.data, String(req.session!.user!.id), body.data.reason, body.data.previewHash)); }
  catch (error) {
    res.status(error instanceof IssueRecoveryError ? error.status : 503).json({
      error: error instanceof IssueRecoveryError ? error.message : "Issue recovery failed; its database transaction was rolled back. No existing issue content was overwritten.",
    });
  } finally { issueRestoreRunning = false; }
});

router.get(root, async (_req, res) => { res.json(await protectionStatus()); });
router.get(`${root}/events`, async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const entity = typeof req.query.entity === "string" && req.query.entity.length <= 80 ? req.query.entity : null;
  const result = await pool.query(`SELECT e.*, o.uploaded_at, o.object_key, o.sha256, o.attempts, o.last_error
    FROM data_audit_events e LEFT JOIN data_evidence_outbox o ON o.event_id=e.id
    WHERE ($1::text IS NULL OR e.entity_type=$1) ORDER BY e.created_at DESC,e.id DESC LIMIT 50 OFFSET $2`,
  [entity, (Math.floor(page) - 1) * 50]);
  res.json({ events: result.rows, page: Math.floor(page), hasMore: result.rows.length === 50 });
});
router.get(`${root}/archived`, async (req, res) => {
  const parsed = entitySchema.safeParse(req.query.entity ?? "app_issues");
  if (!parsed.success) { res.status(400).json({ error: "Invalid protected entity" }); return; }
  const entity = parsed.data;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(req.query.page) || 1)));
  const records = await pool.query(`SELECT id, ${PROTECTED_ENTITIES[entity].label} AS label, created_at
    FROM public.${entity} WHERE archived=TRUE ORDER BY id DESC LIMIT 50 OFFSET $1`, [(page - 1) * 50]);
  res.json({ entity, records: records.rows, page, hasMore: records.rows.length === 50 });
});
router.post(`${root}/restore`, async (req, res) => {
  const parsed = restorationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Select a record and give a restoration reason of 5–500 characters" }); return; }
  const { entity, id, reason } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('ampera.reason',$1,true)", [reason]);
    const previous = (await client.query(`SELECT details->'before' AS original FROM data_audit_events
      WHERE entity_type=$1 AND entity_id=$2 AND action='archived' ORDER BY created_at DESC LIMIT 1`,
    [entity, String(id)])).rows[0]?.original;
    const extra = entity === "users" ? ", is_active=$2" : entity === "sites" ? ", schedule_enabled=$2" : "";
    const values = extra ? [id, entity === "users" ? previous?.is_active === true : previous?.schedule_enabled === true] : [id];
    const result = await client.query(`UPDATE public.${entity} SET archived=FALSE${extra}
      WHERE id=$1 AND archived=TRUE RETURNING id`, values);
    if (!result.rowCount) { await client.query("ROLLBACK"); res.status(404).json({ error: "Archived record not found" }); return; }
    if (entity === "app_issues") {
      await client.query(`INSERT INTO app_issue_activity(issue_id,actor_id,action,details)
        VALUES($1,$2,'restored',$3)`, [id, Number(req.session!.user!.id), JSON.stringify({ reason })]);
    }
    await client.query("COMMIT");
    res.json({ restored: true, entity, id });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
router.post(`${root}/checkpoint`, async (_req, res) => { res.json(await recordProtectionCheckpoint()); });
router.post(`${root}/storage-check`, async (_req, res) => {
  try { res.json(await verifyEvidenceStorage()); }
  catch { res.status(503).json({ error: "R2 evidence verification failed. Check bucket-scoped credentials and storage status." }); }
});
router.post(`${root}/retry`, async (_req, res) => {
  await pool.query("UPDATE data_evidence_outbox SET next_attempt_at=NOW() WHERE uploaded_at IS NULL AND (lease_until IS NULL OR lease_until<NOW())");
  await copyPendingEvidence();
  res.json(await protectionStatus());
});
router.get(`${root}/events/:id/evidence`, async (req, res) => {
  const parsed = idSchema.safeParse(req.params.id);
  if (!parsed.success) { res.status(400).json({ error: "Invalid event ID" }); return; }
  const row = (await pool.query("SELECT object_key,sha256 FROM data_evidence_outbox WHERE event_id=$1 AND uploaded_at IS NOT NULL", [parsed.data])).rows[0];
  if (!row) { res.status(404).json({ error: "Independent evidence has not been uploaded yet" }); return; }
  const bytes = await readEvidence(row.object_key);
  if (sha256(bytes) !== row.sha256) { res.status(409).json({ error: "Evidence checksum mismatch" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="audit-${parsed.data}.json"`);
  res.type("application/json").send(bytes);
});
router.post(`${root}/exports`, async (req, res) => {
  const parsed = passphraseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Use a recovery passphrase of 16–512 characters" }); return; }
  if (exportRunning) { res.status(409).json({ error: "A recovery export is already running; retry after it completes" }); return; }
  exportRunning = true;
  try { res.status(201).json(await createRecoveryExport(String(req.session!.user!.id), parsed.data.passphrase)); }
  catch (error) {
    const safe = error instanceof Error && /32 MB|passphrase/.test(error.message) ? error.message : "Recovery export failed; no existing records were changed";
    res.status(503).json({ error: safe });
  } finally { exportRunning = false; }
});
router.get(`${root}/exports/:id/download`, async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid export ID" }); return; }
  const row = (await pool.query("SELECT * FROM data_recovery_exports WHERE id=$1", [id.data])).rows[0];
  if (!row) { res.status(404).json({ error: "Recovery export not found" }); return; }
  const bytes = await readEvidence(row.object_key);
  if (sha256(bytes) !== row.sha256) { res.status(409).json({ error: "Recovery export checksum mismatch" }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="ampera-recovery-${id.data}.amperaenc"`);
  res.type("application/octet-stream").send(bytes);
});
router.post(`${root}/exports/:id/verify`, async (req, res) => {
  const id = idSchema.safeParse(req.params.id), body = passphraseSchema.safeParse(req.body);
  if (!id.success || !body.success) { res.status(400).json({ error: "Provide a valid export ID and recovery passphrase" }); return; }
  let result: Awaited<ReturnType<typeof verifyRecoveryExport>>;
  try { result = await verifyRecoveryExport(id.data, body.data.passphrase); }
  catch {
    res.status(400).json({ error: "Recovery verification failed. Check the passphrase and export integrity; no records were changed." });
    return;
  }
  try {
    await recordAdministrativeAudit("recovery_verified", String(req.session!.user!.id), { exportId: id.data, counts: result.counts });
  } catch {
    res.status(503).json({ error: "Export integrity was verified, but its audit record could not be saved. Retry verification; no business records were changed." });
    return;
  }
  res.json(result);
});
export default router;
