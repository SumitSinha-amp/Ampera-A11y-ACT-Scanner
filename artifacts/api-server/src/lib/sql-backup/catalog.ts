import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pool } from "@workspace/db";
import type { SqlBackupCatalog, SqlBackupInput, SqlBackupTable } from "@workspace/api-zod";
import { evidenceStorageConfig } from "../evidenceStorage";

const exec = promisify(execFile);
export const dumpBinary = () => process.env.PG_DUMP_PATH || "pg_dump";
export const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function resolveTables(tables: SqlBackupTable[], input: SqlBackupInput) {
  const known = new Map(tables.map(table => [table.id, table]));
  const initial = input.scope === "all" ? tables.map(table => table.id) : input.tableIds;
  if (!initial.length) throw new Error("Select at least one table.");
  if (initial.some(id => !known.has(id))) throw new Error("A selected table no longer exists. Refresh the table list.");
  const selected = new Set(initial);
  if (input.includeDependencies || input.scope === "all") {
    for (const id of selected) {
      for (const dependency of known.get(id)!.dependencies) {
        if (!known.has(dependency)) throw new Error("A required related table is unavailable.");
        selected.add(dependency);
      }
    }
  }
  return {
    tableIds: [...selected].sort(),
    addedDependencies: [...selected].filter(id => !initial.includes(id)).sort(),
  };
}

export async function getSqlBackupCatalog(): Promise<SqlBackupCatalog> {
  const identity = (await pool.query(`SELECT current_database() AS database,
    current_setting('server_version') AS version, current_setting('server_version_num')::int AS version_num`)).rows[0];
  const rows = (await pool.query(`SELECT c.oid::text, n.nspname AS schema, c.relname AS name,
    greatest(c.reltuples,0)::float8 AS estimated_rows,
    pg_total_relation_size(c.oid)::float8 AS size_bytes,
    has_table_privilege(c.oid,'SELECT') AS readable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg\\_%'
      AND n.nspname <> 'information_schema' ORDER BY n.nspname,c.relname`)).rows;
  const ids = new Map<string, string>(rows.map(row => [row.oid, `${quoteIdentifier(row.schema)}.${quoteIdentifier(row.name)}`]));
  const dependencies = (await pool.query(`SELECT conrelid::text AS source, confrelid::text AS target
      FROM pg_constraint WHERE contype='f'
    UNION SELECT inhparent::text, inhrelid::text FROM pg_inherits`)).rows;
  const tables: SqlBackupTable[] = rows.map(row => ({
    id: ids.get(row.oid)!, schema: row.schema, name: row.name,
    estimatedRows: row.estimated_rows, sizeBytes: row.size_bytes,
    dependencies: [...new Set<string>(dependencies.filter(dependency => dependency.source === row.oid)
      .map(dependency => ids.get(dependency.target)).filter((id): id is string => !!id))],
  }));
  let dumpVersion = "", unavailableReason = "";
  try {
    const output = await exec(dumpBinary(), ["--version"], { timeout: 5000, maxBuffer: 4096 });
    dumpVersion = output.stdout.trim();
    const major = Number(dumpVersion.match(/PostgreSQL\)?\s+(\d+)/)?.[1]);
    if (!major || major < Math.floor(identity.version_num / 10000)) {
      unavailableReason = "Install a pg_dump client matching or newer than the PostgreSQL server (PG_DUMP_PATH can select it).";
    }
  } catch {
    unavailableReason = "pg_dump is not installed. Install the PostgreSQL client on the API server.";
  }
  try { evidenceStorageConfig(); }
  catch { unavailableReason ||= "Private independent R2 storage must be configured before exporting SQL."; }
  if (rows.some(row => !row.readable)) unavailableReason ||= "The database connection needs SELECT permission on every table for a full backup.";
  return {
    database: identity.database, serverVersion: identity.version,
    environment: process.env.NODE_ENV === "production" ? "Production runtime" : "Development runtime",
    available: !unavailableReason, unavailableReason, dumpVersion, tables,
  };
}
