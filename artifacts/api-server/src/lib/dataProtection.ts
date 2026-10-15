import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { auditObjectKey, checkEvidenceStorage, evidenceStorageConfig, writeEvidence } from "./evidenceStorage";
import { logger } from "./logger";

export const PROTECTED_ENTITIES = {
  projects: { label: "name" },
  sites: { label: "name" },
  users: { label: "full_name" },
  app_issues: { label: "title" },
} as const;
export type ProtectedEntity = keyof typeof PROTECTED_ENTITIES;

/** Runtime-only deployments must never accept unprotected writes before migrations. */
export async function assertDataProtectionReady(): Promise<void> {
  const result = await pool.query(`SELECT (
    to_regclass('public.data_audit_events') IS NOT NULL
    AND to_regclass('public.data_evidence_outbox') IS NOT NULL
    AND to_regclass('public.data_protection_checks') IS NOT NULL
    AND to_regclass('public.data_recovery_exports') IS NOT NULL
    AND to_regclass('public.issue_recovery_state') IS NOT NULL
    AND to_regclass('public.issue_recovery_mappings') IS NOT NULL
    AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.data_audit_events')
      AND tgname='ampera_audit_immutable' AND tgenabled IN ('O','A'))
    AND NOT EXISTS(
      SELECT 1 FROM unnest($1::text[]) AS entity(name)
      CROSS JOIN (VALUES('ampera_audit'),('ampera_no_delete'),('ampera_no_truncate')) AS required(name)
      LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass('public.' || entity.name)
        AND t.tgname=required.name AND t.tgenabled IN ('O','A')
      WHERE t.oid IS NULL)
    ) AS ready`, [Object.keys(PROTECTED_ENTITIES)]);
  if (!result.rows[0]?.ready) {
    throw new Error("Data protection schema or enabled audit triggers are missing; apply explicit migrations before starting the restricted runtime");
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
let running: Promise<void> | undefined;
let lastCheckpoint = 0;
let storageVerifiedAt: string | null = null;
let storageError: string | null = null;

function safeStorageError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return `Evidence storage unavailable (${name ?? "Error"}${status ? `, HTTP ${status}` : ""}); queued records will retry`;
}

export async function verifyEvidenceStorage() {
  try {
    const result = await checkEvidenceStorage();
    storageVerifiedAt = new Date().toISOString();
    storageError = null;
    return { ...result, verifiedAt: storageVerifiedAt };
  } catch (error) {
    storageError = safeStorageError(error);
    throw new Error(storageError);
  }
}

export async function copyPendingEvidence(): Promise<void> {
  // Leasing is atomic across processes and survives crashes without losing events.
  for (let index = 0; index < 25; index++) {
    const claimed = await pool.query(`
      UPDATE data_evidence_outbox SET lease_until=NOW()+INTERVAL '5 minutes', attempts=attempts+1
      WHERE event_id=(SELECT event_id FROM data_evidence_outbox
        WHERE uploaded_at IS NULL AND next_attempt_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW())
        ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING event_id, attempts
    `);
    const item = claimed.rows[0];
    if (!item) break;
    try {
      const event = (await pool.query("SELECT * FROM data_audit_events WHERE id=$1", [item.event_id])).rows[0];
      if (!event) throw new Error("Audit event missing");
      const key = auditObjectKey(event.id, event.created_at);
      const digest = await writeEvidence(key, Buffer.from(JSON.stringify(event)));
      await pool.query(`UPDATE data_evidence_outbox SET uploaded_at=NOW(), object_key=$2,
        sha256=$3, last_error=NULL, lease_until=NULL WHERE event_id=$1`, [event.id, key, digest]);
      storageVerifiedAt = new Date().toISOString();
      storageError = null;
    } catch (error) {
      const delay = Math.min(900, 15 * 2 ** Math.min(Number(item.attempts), 6));
      storageError = safeStorageError(error);
      await pool.query(`UPDATE data_evidence_outbox SET lease_until=NULL, last_error=$2,
        next_attempt_at=NOW()+($3::int*INTERVAL '1 second') WHERE event_id=$1`,
      [item.event_id, storageError, delay]);
      logger.warn({ eventId: item.event_id, attempt: item.attempts }, storageError);
      break;
    }
  }
}

export async function recordProtectionCheckpoint() {
  const counts: Record<string, number> = {};
  for (const table of ["users", "projects", "sites", "app_issues", "scan_sessions", "page_results"]) {
    const result = await pool.query(`SELECT COUNT(*)::text AS count FROM public.${table}`);
    counts[table] = Number(result.rows[0].count);
  }
  const previous = (await pool.query("SELECT * FROM data_protection_checks ORDER BY id DESC LIMIT 1")).rows[0];
  const warnings: string[] = [];
  if (previous) {
    for (const [table, count] of Object.entries(counts)) {
      if (count < Number(previous.counts[table] ?? 0)) {
        const audit = await pool.query(`SELECT COUNT(*)::int AS count FROM data_audit_events
          WHERE entity_type=$1 AND action='delete' AND created_at>$2`, [table, previous.checked_at]);
        const drop = Number(previous.counts[table]) - count;
        if (Number(audit.rows[0].count) < drop) {
          warnings.push(`${table}: ${drop} fewer rows since the previous checkpoint; review cleanup and deletion activity.`);
        }
      }
    }
  }
  const row = (await pool.query(`INSERT INTO data_protection_checks(counts,warnings) VALUES($1,$2) RETURNING *`,
    [JSON.stringify(counts), JSON.stringify(warnings)])).rows[0];
  if (warnings.length) logger.warn({ warnings }, "Data protection count change requires review");
  lastCheckpoint = Date.now();
  return row;
}

export async function protectionStatus() {
  let storage: { configured: boolean; bucket: string | null; verifiedAt: string | null; error: string | null };
  try {
    const config = evidenceStorageConfig();
    storage = { configured: true, bucket: config.bucket, verifiedAt: storageVerifiedAt, error: storageError };
  } catch {
    storage = { configured: false, bucket: null, verifiedAt: storageVerifiedAt, error: "Independent evidence storage is not configured" };
  }
  const [audit, role, checkpoint, exports] = await Promise.all([
    pool.query(`SELECT (SELECT COUNT(*)::text FROM data_audit_events) AS total,
      COUNT(*) FILTER (WHERE uploaded_at IS NULL)::text AS pending,
      COUNT(*) FILTER (WHERE uploaded_at IS NULL AND last_error IS NOT NULL)::text AS failed,
      MIN(e.created_at) FILTER (WHERE uploaded_at IS NULL) AS oldest_pending_at,
      MAX(uploaded_at) AS last_uploaded_at FROM data_evidence_outbox o JOIN data_audit_events e ON e.id=o.event_id`),
    pool.query(`SELECT current_user AS role, r.rolsuper AS superuser,
      (EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')
        AND pg_has_role(current_user,c.relowner,'MEMBER'))
        OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='public'
          AND pg_has_role(current_user,n.nspowner,'MEMBER'))
        OR EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database()
          AND pg_has_role(current_user,d.datdba,'MEMBER'))) AS owner,
      (has_schema_privilege(current_user,'public','CREATE') OR r.rolcreaterole OR r.rolcreatedb) AS can_create
      FROM pg_roles r WHERE r.rolname=current_user`),
    pool.query("SELECT * FROM data_protection_checks ORDER BY id DESC LIMIT 1"),
    pool.query("SELECT * FROM data_recovery_exports ORDER BY created_at DESC LIMIT 20"),
  ]);
  const privileges = role.rows[0];
  return {
    storage,
    audit: { ...audit.rows[0], total: Number(audit.rows[0].total), pending: Number(audit.rows[0].pending), failed: Number(audit.rows[0].failed) },
    database: { ...privileges, restrictedRuntime: !privileges.owner && !privileges.superuser && !privileges.can_create,
      startupMigrationsEnabled: process.env.RUN_STARTUP_MIGRATIONS !== "false" },
    checkpoint: checkpoint.rows[0] ?? null, exports: exports.rows,
  };
}

export async function recordAdministrativeAudit(action: string, actorId: string, details: object) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = randomUUID();
    await client.query(`INSERT INTO data_audit_events(id,entity_type,entity_id,action,actor_id,source,details,request_id)
      VALUES($1::uuid,'data_protection',$1::text,$2,$3,'admin',$4,nullif(current_setting('ampera.request_id',true),''))`,
    [id, action, actorId, JSON.stringify(details)]);
    await client.query("INSERT INTO data_evidence_outbox(event_id) VALUES($1)", [id]);
    await client.query("COMMIT");
    return id;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export function startDataProtection() {
  const tick = () => {
    if (running) return;
    running = (async () => {
      await copyPendingEvidence();
      if (Date.now() - lastCheckpoint > 30 * 60_000) await recordProtectionCheckpoint();
    })().catch((error) => logger.warn({ errorName: error?.name }, "Data protection worker will retry"))
      .finally(() => { running = undefined; });
  };
  timer = setInterval(tick, 15_000);
  timer.unref();
  tick();
}
export async function stopDataProtection() {
  if (timer) clearInterval(timer);
  await running;
}
