import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline, finished } from "node:stream/promises";
import { Transform } from "node:stream";
import type { Writable } from "node:stream";
import type { SqlBackupJob } from "@workspace/api-zod";
import { dumpBinary } from "./catalog";

export const MAX_SQL_BYTES = Number.MAX_SAFE_INTEGER;
const activeDumps = new Set<ChildProcess>();
export function cancelSqlDumps() {
  for (const child of activeDumps) child.kill("SIGKILL");
}

export function nativePgEnvironment(connectionString: string | undefined): NodeJS.ProcessEnv {
  if (!connectionString) throw new Error("PostgreSQL connection configuration is missing.");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("PostgreSQL connection URL is required.");
  // PGDATABASE does not expand a URI like --dbname does. Decode the URI into
  // libpq environment variables instead, keeping credentials out of argv.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C.UTF-8",
    PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "15",
  };
  const parameters: Record<string, string> = {
    host: "PGHOST", port: "PGPORT", dbname: "PGDATABASE", user: "PGUSER", password: "PGPASSWORD",
    sslmode: "PGSSLMODE", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY", sslrootcert: "PGSSLROOTCERT",
    sslcrl: "PGSSLCRL", sslpassword: "PGSSLPASSWORD", channel_binding: "PGCHANNELBINDING",
    options: "PGOPTIONS", application_name: "PGAPPNAME", gssencmode: "PGGSSENCMODE",
    target_session_attrs: "PGTARGETSESSIONATTRS",
  };
  for (const [name, variable] of Object.entries(parameters)) {
    if (url.searchParams.has(name)) env[variable] = url.searchParams.get(name)!;
  }
  // node-postgres accepts ssl=true as a TLS shorthand.
  if (url.searchParams.get("ssl") === "true" && !env.PGSSLMODE) env.PGSSLMODE = "require";
  return env;
}

/** Native libpq connection settings use the child environment, never argv. */
export async function dumpSqlSection(
  filename: string, args: string[], maxBytes = MAX_SQL_BYTES,
  connectionString = process.env.DATABASE_URL,
): Promise<number> {
  const output = createWriteStream(filename, { flags: "a", mode: 0o600 });
  try { return await dumpSqlToStream(output, args, maxBytes, connectionString); }
  finally { output.end(); await finished(output).catch(() => undefined); }
}

export async function dumpSqlToStream(
  output: Writable, args: string[], maxBytes = MAX_SQL_BYTES,
  connectionString = process.env.DATABASE_URL,
): Promise<number> {
  const child = spawn(dumpBinary(), args, {
    shell: false, stdio: ["ignore", "pipe", "pipe"],
    env: nativePgEnvironment(connectionString),
  });
  activeDumps.add(child);
  let stderr = "", bytes = 0, timedOut = false;
  child.stderr.on("data", chunk => { if (stderr.length < 65536) stderr += String(chunk).slice(0, 65536 - stderr.length); });
  const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 2 * 60 * 60_000);
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  // Register immediately: spawn failure must not become an unhandled rejection.
  const counted = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) callback(new Error("SQL backup exceeds the configured streaming size limit."));
      else callback(null, chunk);
    },
  });
  const streamed = pipeline(child.stdout, counted, output, { end: false })
    .catch(error => { child.kill("SIGKILL"); throw error; });
  try {
    const [, code] = await Promise.all([streamed, closed]);
    if (code !== 0) {
      if (timedOut) throw new Error("SQL export exceeded its time limit. Try fewer tables.");
      if (/permission denied|row security|row-level security/i.test(stderr)) {
        throw new Error("PostgreSQL refused a complete export. Check table, sequence, and row-security privileges.");
      }
      if (/server version mismatch|aborting because of server version/i.test(stderr)) {
        throw new Error("pg_dump is older than the database server. Install a matching or newer client.");
      }
      // Raw native output can include connection details and is never exposed.
      throw new Error("PostgreSQL export failed. Check connectivity, client compatibility, permissions, and the upload connection.");
    }
    return bytes;
  } finally { clearTimeout(timeout); activeDumps.delete(child); }
}

export function dumpSections(job: Pick<SqlBackupJob, "scope" | "content" | "tableIds">, snapshot: string) {
  const common = ["--format=plain", "--no-owner", "--no-privileges", "--no-tablespaces",
    "--lock-wait-timeout=15000", `--snapshot=${snapshot}`];
  const selected = job.scope === "selected" ? job.tableIds.map(id => `--table=${id}`) : [];
  if (job.content === "data-only") return [[...common, "--data-only", ...selected]];
  if (job.scope === "all") return [common];
  // Include the COMPLETE schema so types, functions, views, and cross-table
  // constraints have their dependencies. Only data is selection-filtered.
  return [
    [...common, "--schema-only", "--section=pre-data"],
    [...common, "--data-only", ...selected],
    [...common, "--schema-only", "--section=post-data"],
  ];
}

export function restoreInstructions(job: Pick<SqlBackupJob, "content" | "scope" | "filename">) {
  return [
    "-- Ampera PostgreSQL SQL backup. SENSITIVE: unencrypted database contents.",
    "-- No database connection credentials are included in this header.",
    "-- External object-storage files and PostgreSQL server roles are NOT included.",
    "-- Use matching server/client versions where possible; install required extension binaries.",
    job.content === "data-only"
      ? "-- DATA ONLY: requires compatible existing schema and empty target tables. Review FK cycles and write/audit triggers before restoring."
      : "-- SCHEMA + DATA: restore into a NEW EMPTY database; existing objects cause errors.",
    ...(job.scope === "selected" && job.content === "schema-and-data"
      ? ["-- ALL schema definitions are included; only selected/required tables contain data."] : []),
    "-- No DROP, TRUNCATE, overwrite, or silent conflict-skipping mode is added by Ampera.",
    `-- psql -X --set ON_ERROR_STOP=on --single-transaction --dbname=restore_database --file=${job.filename}`,
    "",
  ].join("\n");
}
