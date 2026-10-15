import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { readEvidence, sha256 } from "./evidenceStorage";
import { ISSUE_TABLES, MAX_METADATA, readIssueSnapshot, SNAPSHOT_TABLES, type IssueSnapshot, type RecoveryRow } from "./issueRecoverySnapshot";

type Client = { query: typeof pool.query };
type Maps = Record<string, Map<number, number>>;
export class IssueRecoveryError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
const iso = (value: unknown) => value == null ? "" : new Date(value as string).toISOString();
const identity = (table: string, row: RecoveryRow, snapshot: IssueSnapshot) => {
  if (table === "app_issues") return row.issue_key;
  if (!ISSUE_TABLES.includes(table as any)) return `${table}:${row.id}`;
  const parent = snapshot.tables.app_issues!.find(issue => issue.id === (row.issue_id ?? row.source_issue_id));
  return `${parent?.issue_key}:${iso(row.created_at)}:${table === "app_issue_links" ? `${row.target_issue_id}:${row.link_type}` : table}`;
};

/** No passwords, permissions, or arbitrary tables are read into recovery plans. */
async function currentState(client: Client, datasetId: string) {
  const state: Record<string, RecoveryRow[]> = {};
  let size = 0;
  for (const table of [...SNAPSHOT_TABLES, "issue_recovery_mappings"]) {
    const select = table === "users" ? "id,email,username,full_name" : table === "sites" ? "id,name,base_url,user_id,archived" : table === "projects" ? "id,name,archived" : "*";
    state[table] = [];
    let cursor = 0;
    for (;;) {
      const result = table === "issue_recovery_mappings"
        ? await client.query("SELECT * FROM issue_recovery_mappings WHERE dataset_id=$1 ORDER BY source_table,source_id", [datasetId])
        : await client.query(`SELECT ${select} FROM ${table} WHERE id>$1 ORDER BY id LIMIT 100`, [cursor]);
      size += Buffer.byteLength(JSON.stringify(result.rows));
      if (size > MAX_METADATA * 2) throw new IssueRecoveryError("Current Issue Management data exceeds the supported recovery preview size; use an operator-reviewed database recovery.");
      state[table]!.push(...result.rows);
      if (table === "issue_recovery_mappings" || !result.rows.length) break;
      cursor = result.rows[result.rows.length - 1].id;
    }
  }
  const dataset = (await client.query("SELECT dataset_id FROM issue_recovery_state WHERE id=1")).rows[0]?.dataset_id;
  return { state, sameDataset: dataset === datasetId, digest: sha256(Buffer.from(JSON.stringify(state))) };
}

export function makeRecoveryPlan(snapshot: IssueSnapshot, state: Record<string, RecoveryRow[]>, sameDataset: boolean) {
  const maps: Maps = Object.fromEntries(SNAPSHOT_TABLES.map(table => [table, new Map()]));
  const creates: Record<string, RecoveryRow[]> = Object.fromEntries(SNAPSHOT_TABLES.map(table => [table, []]));
  const warnings = new Set<string>();
  const conflicts: string[] = [];
  const repairs: { sourceId: number; targetId: number }[] = [];
  const mappings = state.issue_recovery_mappings ?? [];
  const matchMapping = (table: string, source: RecoveryRow) => {
    const saved = mappings.find(row => row.source_table === table && row.source_id === source.id);
    if (!saved) return undefined;
    if (saved.identity !== identity(table, source, snapshot)) {
      conflicts.push(`${table} #${source.id}: stored recovery identity does not match this backup.`);
      return undefined;
    }
    return state[table]!.find(row => row.id === saved.target_id);
  };
  const setMatch = (table: string, source: RecoveryRow, target?: RecoveryRow) => {
    if (target) maps[table]!.set(source.id, target.id);
    else { maps[table]!.set(source.id, -source.id); creates[table]!.push(source); }
  };
  // Stable issue keys, not recycled numeric IDs, identify an existing issue.
  for (const source of snapshot.tables.app_issues!) {
    const mapped = matchMapping("app_issues", source);
    const target = state.app_issues!.find(row => row.issue_key === source.issue_key);
    if (mapped && mapped.issue_key !== source.issue_key) conflicts.push(`Issue ${source.issue_key}: recovery mapping conflicts with a different live issue.`);
    setMatch("app_issues", source, target);
  }
  for (const table of ISSUE_TABLES.filter(table => table !== "app_issues")) {
    for (const source of snapshot.tables[table]!) {
      const parent = maps.app_issues!.get(source.issue_id ?? source.source_issue_id)!;
      let target = matchMapping(table, source);
      if (!target && parent > 0) {
        const candidates = state[table]!.filter(row => {
          if (table === "app_issue_links") return row.source_issue_id === parent
            && row.target_issue_id === maps.app_issues!.get(source.target_issue_id) && row.link_type === source.link_type;
          return row.issue_id === parent && iso(row.created_at) === iso(source.created_at);
        });
        if (sameDataset) target = candidates.find(row => row.id === source.id);
        const allowNaturalMatch = table === "app_issue_links" || !sameDataset || parent !== source.issue_id;
        if (!target && allowNaturalMatch && candidates.length === 1) target = candidates[0];
        if (!target && allowNaturalMatch && candidates.length > 1) conflicts.push(`${table} #${source.id}: multiple live records match; manual review is required.`);
      }
      if (target && (table === "app_issue_links" ? target.source_issue_id !== parent
        || target.target_issue_id !== maps.app_issues!.get(source.target_issue_id) : target.issue_id !== parent)) {
        conflicts.push(`${table} #${source.id}: live parent does not match the recovery mapping.`);
        target = undefined;
      }
      setMatch(table, source, target);
      if (table === "app_issue_attachments" && target) {
        const file = snapshot.files.find(file => file.attachmentId === source.id)!;
        if (target.filename !== source.filename || target.size !== source.size || target.content_type !== source.content_type) {
          warnings.add(`Attachment #${source.id} has newer metadata and will be left unchanged.`);
        } else if (target.object_path !== `/evidence-objects/${file.key}`) {
          repairs.push({ sourceId: source.id, targetId: target.id });
        }
      }
    }
  }
  const requiredUsers = new Set<number>();
  const requiredSites = new Set<number>();
  const requiredProjects = new Set<number>();
  const needUser = (id: number | null | undefined) => { if (id != null) requiredUsers.add(id); };
  for (const row of creates.app_issues!) {
    needUser(row.reporter_id); needUser(row.assignee_id);
    if (row.site_id != null) requiredSites.add(row.site_id);
    if (row.project_id != null) requiredProjects.add(row.project_id);
  }
  for (const row of creates.app_issue_comments!) {
    needUser(row.author_id);
    for (const id of row.mentions ?? []) needUser(id);
  }
  for (const row of creates.app_issue_activity!) needUser(row.actor_id);
  for (const row of creates.app_issue_attachments!) needUser(row.uploaded_by);
  for (const row of creates.app_issue_links!) needUser(row.created_by);
  for (const source of snapshot.tables.sites!.filter(row => requiredSites.has(row.id))) {
    if (source.user_id != null && /^\d+$/.test(source.user_id)) needUser(Number(source.user_id));
  }
  for (const source of snapshot.tables.users!.filter(row => requiredUsers.has(row.id))) {
    const mapped = matchMapping("users", source) ?? (sameDataset ? state.users!.find(row => row.id === source.id) : undefined);
    const candidates = state.users!.filter(row => row.email === source.email || row.username === source.username);
    if (!mapped && candidates.length > 1) conflicts.push(`User #${source.id}: email and username identify different live accounts.`);
    setMatch("users", source, mapped ?? (candidates.length === 1 ? candidates[0] : undefined));
  }
  for (const table of ["projects", "sites"]) {
    const required = table === "projects" ? requiredProjects : requiredSites;
    for (const source of snapshot.tables[table]!.filter(row => required.has(row.id))) {
      let target = matchMapping(table, source);
      if (!target && sameDataset) target = state[table]!.find(row => row.id === source.id);
      if (!target) {
        const candidates = state[table]!.filter(row => table === "projects" ? row.name === source.name
          : row.base_url === source.base_url && row.user_id === (source.user_id != null && /^\d+$/.test(source.user_id)
            ? String(maps.users!.get(Number(source.user_id))) : source.user_id));
        if (candidates.length > 1) conflicts.push(`${table} #${source.id}: multiple live records match; manual review is required.`);
        if (candidates.length === 1) target = candidates[0];
      }
      setMatch(table, source, target);
    }
    for (const id of required) if (!maps[table]!.has(id)) conflicts.push(`Missing ${table} dependency #${id}.`);
  }
  for (const id of requiredUsers) if (!maps.users!.has(id)) conflicts.push(`Missing author dependency #${id}.`);
  if (creates.users!.length) warnings.add("Missing authors will be recreated as disabled, archived reference accounts with no restored login, role or permissions.");
  if (creates.sites!.length) warnings.add("Recovered sites have crawling schedules disabled. Site-access grants are not recreated.");
  if (creates.app_issues!.some(row => row.scan_id != null || row.page_id != null)) warnings.add("Scan/page links are retained only when their original database and referenced records still exist; findings are not restored.");
  if (repairs.length) warnings.add("Existing matching attachment links will point to this backup's independently stored file bytes. Original storage objects are not overwritten or deleted.");
  const counts = Object.fromEntries(SNAPSHOT_TABLES.map(table => [table, creates[table]!.length]));
  return { maps, creates, repairs, counts, conflicts, warnings: [...warnings],
    existingIssues: snapshot.tables.app_issues!.length - creates.app_issues!.length };
}

async function planInTransaction(client: Client, snapshot: IssueSnapshot, checksum: string) {
  const current = await currentState(client, snapshot.datasetId);
  const plan = makeRecoveryPlan(snapshot, current.state, current.sameDataset);
  const previewHash = sha256(Buffer.from(JSON.stringify({ checksum, state: current.digest, counts: plan.counts, repairs: plan.repairs })));
  return { plan, previewHash, sameDataset: current.sameDataset };
}
export async function previewIssueRecovery(id: string) {
  const { snapshot, checksum } = await readIssueSnapshot(id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { plan, previewHash } = await planInTransaction(client, snapshot, checksum);
    await client.query("COMMIT");
    return { backupId: id, createdAt: snapshot.createdAt, previewHash, counts: plan.counts, backupCounts: snapshot.counts,
      existingIssues: plan.existingIssues, attachmentsToRelink: plan.repairs.length, warnings: plan.warnings,
      conflicts: plan.conflicts, canRestore: plan.conflicts.length === 0 };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

const ISSUE_COLUMNS = ["issue_key", "type", "title", "description", "status", "priority", "severity", "project_id", "site_id", "scan_id", "page_id",
  "rule_id", "selector", "source_description", "assignee_id", "reporter_id", "labels", "checklist", "acceptance_criteria", "environment",
  "steps_to_reproduce", "expected_result", "actual_result", "due_date", "sprint", "related_issue_ids", "epic_id", "custom_fields", "archived", "created_at", "updated_at"];
const COLUMNS: Record<string, string[]> = {
  app_issues: ISSUE_COLUMNS,
  app_issue_comments: ["issue_id", "author_id", "body", "mentions", "created_at", "updated_at"],
  app_issue_activity: ["issue_id", "actor_id", "action", "details", "created_at"],
  app_issue_attachments: ["issue_id", "comment_id", "uploaded_by", "object_path", "filename", "content_type", "size", "pending", "expires_at", "created_at"],
  app_issue_links: ["source_issue_id", "target_issue_id", "link_type", "created_by", "created_at"],
};
const JSON_COLUMNS = new Set(["labels", "checklist", "related_issue_ids", "custom_fields", "mentions", "details"]);
async function insertRow(client: Client, table: string, row: RecoveryRow, columns: string[]) {
  const values = columns.map(column => JSON_COLUMNS.has(column) ? JSON.stringify(row[column] ?? (["custom_fields", "details"].includes(column) ? {} : [])) : row[column] ?? null);
  return (await client.query(`INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`, values)).rows[0].id as number;
}

export async function restoreIssueBackup(id: string, actorId: string, reason: string, expectedHash: string) {
  const { snapshot, checksum } = await readIssueSnapshot(id);
  // Verify all backed-up bytes before acquiring business-table write locks.
  for (const file of snapshot.files) {
    const bytes = await readEvidence(file.key, true);
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new IssueRecoveryError("Attachment backup integrity verification failed; no records were changed.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='60s'");
    await client.query(`LOCK TABLE users,projects,sites,project_sites,${ISSUE_TABLES.join(",")},issue_recovery_mappings IN SHARE ROW EXCLUSIVE MODE`);
    const { plan, previewHash, sameDataset } = await planInTransaction(client, snapshot, checksum);
    if (previewHash !== expectedHash) throw new IssueRecoveryError("Issue data changed after the preview. Preview the backup again before restoring.");
    if (plan.conflicts.length) throw new IssueRecoveryError("Recovery conflicts require manual review; no records were changed.");
    await client.query("SELECT set_config('ampera.reason',$1,true)", [reason]);
    const mapped = (table: string, value: number | null | undefined) => {
      if (value == null) return null;
      const result = plan.maps[table]!.get(value);
      if (!result || result < 1) throw new IssueRecoveryError(`Unresolved ${table} relationship; no records were changed.`);
      return result;
    };
    const saveMapping = async (table: string, source: RecoveryRow, targetId: number) => {
      plan.maps[table]!.set(source.id, targetId);
      await client.query(`INSERT INTO issue_recovery_mappings(dataset_id,source_table,source_id,target_id,identity)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(dataset_id,source_table,source_id) DO UPDATE SET target_id=EXCLUDED.target_id,identity=EXCLUDED.identity`,
      [snapshot.datasetId, table, source.id, targetId, identity(table, source, snapshot)]);
    };
    for (const table of ["users", "projects", "sites"]) {
      for (const row of plan.creates[table]!) {
        let target: number;
        if (table === "users") {
          target = await insertRow(client, table, { ...row, role: "user", password_hash: "!recovered-disabled", is_active: false, archived: true },
            ["email", "username", "full_name", "role", "password_hash", "is_active", "archived"]);
        } else if (table === "projects") target = await insertRow(client, table, row, ["name", "archived", "created_at"]);
        else target = await insertRow(client, table, { ...row, user_id: row.user_id != null && /^\d+$/.test(row.user_id)
          ? String(mapped("users", Number(row.user_id))) : row.user_id, schedule_enabled: false },
          ["name", "base_url", "user_id", "archived", "created_at", "schedule_enabled"]);
        await saveMapping(table, row, target);
      }
    }
    for (const row of plan.creates.app_issues!) {
      const value = { ...row, project_id: mapped("projects", row.project_id), site_id: mapped("sites", row.site_id),
        reporter_id: mapped("users", row.reporter_id), assignee_id: mapped("users", row.assignee_id),
        epic_id: null, related_issue_ids: [], scan_id: null, page_id: null };
      if (sameDataset && row.scan_id != null) value.scan_id = (await client.query("SELECT id FROM scan_sessions WHERE id=$1", [row.scan_id])).rows[0]?.id ?? null;
      if (sameDataset && row.page_id != null) value.page_id = (await client.query("SELECT id FROM page_results WHERE id=$1", [row.page_id])).rows[0]?.id ?? null;
      await saveMapping("app_issues", row, await insertRow(client, "app_issues", value, ISSUE_COLUMNS));
      if (value.project_id && value.site_id) await client.query("INSERT INTO project_sites(project_id,site_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [value.project_id, value.site_id]);
    }
    for (const row of plan.creates.app_issues!) {
      await client.query("UPDATE app_issues SET epic_id=$1,related_issue_ids=$2::jsonb WHERE id=$3",
        [mapped("app_issues", row.epic_id), JSON.stringify((row.related_issue_ids ?? []).map((id: number) => mapped("app_issues", id))), mapped("app_issues", row.id)]);
    }
    for (const table of ISSUE_TABLES.filter(table => table !== "app_issues")) {
      for (const row of plan.creates[table]!) {
        const value = { ...row };
        if (table === "app_issue_links") {
          value.source_issue_id = mapped("app_issues", row.source_issue_id);
          value.target_issue_id = mapped("app_issues", row.target_issue_id);
          // An existing link can become identifiable after new parent IDs are allocated.
          const live = (await client.query("SELECT id FROM app_issue_links WHERE source_issue_id=$1 AND target_issue_id=$2 AND link_type=$3",
            [value.source_issue_id, value.target_issue_id, row.link_type])).rows[0];
          if (live) { await saveMapping(table, row, live.id); continue; }
          value.created_by = mapped("users", row.created_by);
        } else {
          value.issue_id = mapped("app_issues", row.issue_id);
          if (table === "app_issue_comments") {
            value.author_id = mapped("users", row.author_id);
            // Mentions are optional notifications, not reasons to recreate unused accounts.
            value.mentions = (row.mentions ?? []).flatMap((id: number) => { const target = plan.maps.users!.get(id); return target && target > 0 ? [target] : []; });
          } else if (table === "app_issue_activity") value.actor_id = mapped("users", row.actor_id);
          else {
            value.uploaded_by = mapped("users", row.uploaded_by);
            value.comment_id = mapped("app_issue_comments", row.comment_id);
            value.object_path = `/evidence-objects/${snapshot.files.find(file => file.attachmentId === row.id)!.key}`;
            value.pending = false;
            value.expires_at = null;
          }
        }
        await saveMapping(table, row, await insertRow(client, table, value, COLUMNS[table]!));
      }
    }
    for (const repair of plan.repairs) {
      const file = snapshot.files.find(file => file.attachmentId === repair.sourceId)!;
      await client.query("UPDATE app_issue_attachments SET object_path=$1 WHERE id=$2", [`/evidence-objects/${file.key}`, repair.targetId]);
    }
    // Persist matches too, so subsequent restores remain idempotent after ID remapping.
    for (const table of SNAPSHOT_TABLES) for (const row of snapshot.tables[table]!) {
      const targetId = plan.maps[table]!.get(row.id);
      if (targetId && targetId > 0) await saveMapping(table, row, targetId);
    }
    const auditId = randomUUID();
    const summary = { backupId: id, datasetId: snapshot.datasetId, reason, restored: plan.counts, attachmentsRelinked: plan.repairs.length };
    await client.query(`INSERT INTO data_audit_events(id,entity_type,entity_id,action,actor_id,source,details)
      VALUES($1::uuid,'data_protection',$1::text,'issues_recovered',$2,'admin',$3)`, [auditId, actorId, JSON.stringify(summary)]);
    await client.query("INSERT INTO data_evidence_outbox(event_id) VALUES($1)", [auditId]);
    await client.query("COMMIT");
    return { restored: true, counts: plan.counts, attachmentsRelinked: plan.repairs.length, warnings: plan.warnings,
      note: "Missing Issue Management records recovered. Existing issue and comment content was not overwritten." };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
