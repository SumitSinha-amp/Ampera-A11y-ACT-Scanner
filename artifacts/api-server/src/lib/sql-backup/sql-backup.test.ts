import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "@workspace/db";
import type { SqlBackupInput, SqlBackupTable } from "@workspace/api-zod";
import { dumpUnavailableReason, getSqlBackupCatalog, quoteIdentifier, resolveTables } from "./catalog";
import { dumpSections, dumpSqlSection, nativePgEnvironment, restoreInstructions } from "./dump";

// This suite never connects to the application's database.
vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() } }));
vi.mock("../evidenceStorage", () => ({ evidenceStorageConfig: vi.fn() }));

const table = (id: string, dependencies: string[] = []): SqlBackupTable =>
  ({ id, schema: "app", name: id, estimatedRows: 1, sizeBytes: 1, dependencies });
const input = (tableIds: string[], includeDependencies = true): SqlBackupInput =>
  ({ scope: "selected", content: "data-only", tableIds, includeDependencies, confirmation: "EXPORT DATABASE" });

describe("SQL backup selection and safety", () => {
  it.each([
    [{ code: "ENOENT" }, "Install the PostgreSQL client"],
    [{ code: "EACCES" }, "executable permissions"],
    [{ code: "ETIMEDOUT" }, "timed out"],
    [{ killed: true }, "timed out"],
    [new Error("private connection details"), "pg_dump --version failed"],
  ])("explains the pg_dump failure without exposing raw errors", (error, expected) => {
    const reason = dumpUnavailableReason(error);
    expect(reason).toContain(expected);
    expect(reason).not.toContain("private connection details");
    expect(reason).toContain("PG_DUMP_PATH");
  });
  it("includes transitive foreign-key and partition dependencies, including cycles", () => {
    expect(resolveTables([table("child", ["parent"]), table("parent", ["child", "root"]), table("root")],
      input(["child"]))).toEqual({ tableIds: ["child", "parent", "root"], addedDependencies: ["parent", "root"] });
  });
  it("lets the operator opt out without silently adding tables", () => {
    expect(resolveTables([table("child", ["parent"]), table("parent")], input(["child"], false)).tableIds).toEqual(["child"]);
  });
  it("rejects stale or empty table selections", () => {
    expect(() => resolveTables([table("known")], input(["unknown"]))).toThrow("no longer exists");
    expect(() => resolveTables([table("known")], input([]))).toThrow("at least one");
  });
  it("quotes literal PostgreSQL identifiers rather than interpolating untrusted SQL", () => {
    expect(quoteIdentifier('a".*; DROP TABLE x;--')).toBe('"a"".*; DROP TABLE x;--"');
  });
  it("passes connection settings through libpq environment variables, not command arguments", () => {
    const env = nativePgEnvironment("postgresql://fixture:p%40ss@localhost:6543/db%20name?sslmode=require");
    expect(env.PGDATABASE).toBe("db name");
    expect(env.PGUSER).toBe("fixture");
    expect(env.PGPASSWORD).toBe("p@ss");
    expect(env.PGSSLMODE).toBe("require");
    expect(env.DATABASE_URL).toBeUndefined();
  });
  it("uses full schema definitions but restricts selected table data", () => {
    const sections = dumpSections({ scope: "selected", content: "schema-and-data", tableIds: ['"app"."child"'] }, "snapshot-id");
    expect(sections).toHaveLength(3);
    expect(sections[0]).toContain("--section=pre-data");
    expect(sections[0]?.some(arg => arg.startsWith("--table="))).toBe(false);
    expect(sections[1]).toContain('--table="app"."child"');
    expect(sections[2]).toContain("--section=post-data");
    expect(sections.flat().join(" ")).not.toMatch(/--clean|--disable-triggers|--if-exists|--create/);
  });
  it("selects every live table for a full export", () => {
    expect(resolveTables([table("a"), table("b")], { ...input([]), scope: "all" }).tableIds).toEqual(["a", "b"]);
    expect(dumpSections({ scope: "all", content: "schema-and-data", tableIds: ["a"] }, "snapshot")).toHaveLength(1);
  });
  it("documents the empty-target and external-file boundary inside SQL", () => {
    const instructions = restoreInstructions({ scope: "selected", content: "data-only", filename: "backup.sql" });
    expect(instructions).toContain("empty target tables");
    expect(instructions).toContain("NOT included");
    expect(instructions).toContain("ON_ERROR_STOP=on --single-transaction");
  });
  it("discovers tables dynamically and marks restricted full exports unavailable", async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ database: "fixture", version: "16.10", version_num: 160010 }] } as never)
      .mockResolvedValueOnce({ rows: [
        { oid: "1", schema: "app", name: "child", estimated_rows: 2, size_bytes: 100, readable: false },
        { oid: "2", schema: "app", name: "parent", estimated_rows: 1, size_bytes: 100, readable: true },
      ] } as never)
      .mockResolvedValueOnce({ rows: [{ source: "1", target: "2" }] } as never);
    const catalog = await getSqlBackupCatalog();
    expect(catalog.tables[0]?.dependencies).toEqual(['"app"."parent"']);
    expect(catalog.available).toBe(false);
    expect(catalog.unavailableReason).toContain("SELECT");
  });
});

const exec = promisify(execFile);
let directory: string;
let connection: (database: string) => string;
const sql = async (database: string, statement: string) =>
  (await exec("psql", ["-X", "-A", "-t", "--set", "ON_ERROR_STOP=on", "--dbname", connection(database), "--command", statement])).stdout.trim();

describe("native SQL round-trip in an isolated temporary PostgreSQL cluster", () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "ampera-pg-test-"));
    const data = join(directory, "data"), socket = join(directory, "socket");
    await mkdir(socket);
    await exec("initdb", ["-D", data, "-A", "trust", "-U", "ampera_fixture", "--no-locale"]);
    await exec("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"),
      "-o", `-F -k ${socket} -h '' -p 6543`, "-w", "start"]);
    connection = database => `postgresql:///${database}?host=${encodeURIComponent(socket)}&port=6543&user=ampera_fixture`;
    // Independently establish the target before any fixture writes.
    expect(await sql("postgres", "SHOW data_directory")).toBe(data);
    for (const database of ["source", "full_restore", "selected_restore", "data_restore", "snapshot_restore"]) {
      await sql("postgres", `CREATE DATABASE ${database}`);
    }
    await sql("source", `CREATE SCHEMA app;
      CREATE TYPE app.mood AS ENUM ('good','bad');
      CREATE TABLE app.parent (id serial PRIMARY KEY, label text, mood app.mood, payload jsonb, bytes bytea);
      CREATE TABLE app.child (id serial PRIMARY KEY, parent_id int REFERENCES app.parent, enabled boolean);
      CREATE TABLE app.unrelated (id serial PRIMARY KEY, label text);
      CREATE TABLE app."literal.*" (id int PRIMARY KEY);
      INSERT INTO app.parent(label,mood,payload,bytes) VALUES ('quote '' and Unicode नमस्ते','good','{"a":[1,true]}',decode('000aff','hex'));
      INSERT INTO app.child(parent_id,enabled) VALUES (1,true);
      INSERT INTO app.unrelated(label) VALUES ('not selected');
      INSERT INTO app."literal.*" VALUES (42);`);
  }, 30_000);
  afterAll(async () => {
    if (!directory) return;
    await exec("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"]).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  });

  async function roundTrip(database: string, scope: "all" | "selected", content: "schema-and-data" | "data-only", ids: string[], snapshot?: string) {
    const filename = join(directory, `${database}.sql`);
    await writeFile(filename, restoreInstructions({ scope, content, filename: `${database}.sql` }));
    for (const args of dumpSections({ scope, content, tableIds: ids }, snapshot ?? "")) {
      await dumpSqlSection(filename, snapshot ? args : args.filter(arg => !arg.startsWith("--snapshot=")), undefined, connection("source"));
    }
    await exec("psql", ["-X", "--set", "ON_ERROR_STOP=on", "--single-transaction",
      "--dbname", connection(database), "--file", filename], { maxBuffer: 1024 * 1024 });
    return filename;
  }
  it("restores a full dump with types, relationships, Unicode, JSON, bytea, and sequence values", async () => {
    await roundTrip("full_restore", "all", "schema-and-data", []);
    expect(await sql("full_restore", "SELECT row_to_json(p) FROM app.parent p")).toBe(await sql("source", "SELECT row_to_json(p) FROM app.parent p"));
    expect(await sql("full_restore", "SELECT count(*) FROM app.child")).toBe("1");
    expect(await sql("full_restore", "SELECT nextval('app.parent_id_seq')")).toBe("2");
  }, 30_000);
  it("restores selected data with complete schema dependencies but no unrelated rows", async () => {
    await roundTrip("selected_restore", "selected", "schema-and-data", ['"app"."parent"', '"app"."child"']);
    expect(await sql("selected_restore", "SELECT count(*) FROM app.child")).toBe("1");
    expect(await sql("selected_restore", "SELECT count(*) FROM app.unrelated")).toBe("0");
  }, 30_000);
  it("restores data-only into a compatible empty schema and handles literal wildcard table names", async () => {
    const schema = join(directory, "schema.sql");
    await dumpSqlSection(schema, ["--schema-only", "--no-owner", "--no-privileges"], undefined, connection("source"));
    await exec("psql", ["-X", "--set", "ON_ERROR_STOP=on", "--dbname", connection("data_restore"), "--file", schema]);
    const filename = await roundTrip("data_restore", "selected", "data-only", ['"app"."literal.*"']);
    expect(await sql("data_restore", 'SELECT id FROM app."literal.*"')).toBe("42");
    expect(await sql("data_restore", "SELECT count(*) FROM app.parent")).toBe("0");
    expect(await readFile(filename, "utf8")).toContain('COPY app."literal.*"');
  }, 30_000);
  it("fails closed when the file-size limit is exceeded", async () => {
    await expect(dumpSqlSection(join(directory, "oversize.sql"), ["--schema-only"], 8, connection("source")))
      .rejects.toThrow("size limit");
  }, 30_000);
  it("imports one exported snapshot across schema/data sections while new rows arrive", async () => {
    const keeper = spawn("psql", ["-X", "-q", "-A", "-t", "--set", "ON_ERROR_STOP=on", "--dbname", connection("source")]);
    try {
      const snapshot = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Fixture snapshot timeout")), 5000);
        keeper.once("error", reject);
        keeper.stdout.on("data", chunk => {
          const match = String(chunk).match(/[0-9A-F]+-[0-9A-F]+-\d+/);
          if (match) { clearTimeout(timer); resolve(match[0]); }
        });
        keeper.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();\n");
      });
      await sql("source", 'INSERT INTO app."literal.*" VALUES (43)');
      await roundTrip("snapshot_restore", "selected", "schema-and-data", ['"app"."literal.*"'], snapshot);
      expect(await sql("source", 'SELECT count(*) FROM app."literal.*"')).toBe("2");
      expect(await sql("snapshot_restore", 'SELECT count(*) FROM app."literal.*"')).toBe("1");
    } finally {
      keeper.stdin.end("ROLLBACK;\n");
      keeper.kill("SIGTERM");
    }
  }, 30_000);
});
