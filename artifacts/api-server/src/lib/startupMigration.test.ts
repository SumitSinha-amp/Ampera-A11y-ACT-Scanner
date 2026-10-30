import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DatabasePoolClient } from "@workspace/db";
import { HISTORICAL_MIGRATIONS_SCHEMA_SQL, runHistoricalMigrations, startupMigrationClient } from "./startupMigrations";

vi.mock("./logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

function database(completed = new Set<string>()) {
  const calls: string[] = [];
  const committed = new Set(completed);
  let pending: string | undefined;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push(sql);
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
    if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
    if (sql.startsWith("SELECT 1 FROM app_startup_data_migrations")) return { rows: committed.has(values![0] as string) ? [{}] : [] };
    if (sql.startsWith("INSERT INTO app_startup_data_migrations")) pending = values![0] as string;
    if (sql === "COMMIT" && pending) { committed.add(pending); pending = undefined; }
    if (sql === "ROLLBACK") pending = undefined;
    return { rows: [] };
  });
  const release = vi.fn();
  return { calls, query, release, committed, client: { query, release } as unknown as DatabasePoolClient };
}

describe("startup schema lock boundaries", () => {
  it("commits each schema step before the next step starts", async () => {
    const db = database();
    const client = startupMigrationClient(db.client, []);
    await client.query("ALTER TABLE example ADD COLUMN IF NOT EXISTS extra TEXT");
    await client.query("CREATE INDEX IF NOT EXISTS example_extra ON example(extra)");
    expect(db.calls.filter(s => !s.startsWith("SET ") && !s.startsWith("SELECT "))).toEqual([
      "BEGIN", "ALTER TABLE example ADD COLUMN IF NOT EXISTS extra TEXT", "COMMIT",
      "BEGIN", "CREATE INDEX IF NOT EXISTS example_extra ON example(extra)", "COMMIT",
    ]);
    expect(db.calls.filter(s => s === "SET LOCAL lock_timeout = '3s'")).toHaveLength(2);
    expect(db.calls.filter(s => s.includes("pg_advisory_xact_lock"))).toHaveLength(2);
  });
  it("rolls back the failing step without undoing earlier committed steps", async () => {
    const db = database();
    const client = startupMigrationClient(db.client, []);
    await client.query("CREATE TABLE example (id INT)");
    const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql, values) => {
      if (sql === "ALTER TABLE example ADD extra TEXT") throw new Error("lock timeout");
      return original(sql, values);
    });
    await expect(client.query("ALTER TABLE example ADD extra TEXT")).rejects.toThrow("lock timeout");
    expect(db.calls).toContain("COMMIT");
    expect(db.calls.at(-1)).toBe("ROLLBACK");
  });
  it("defers historical SQL without executing it or opening a transaction", () => {
    const db = database(), deferred: { id: string; sql: string }[] = [];
    const client = startupMigrationClient(db.client, deferred);
    client.deferHistorical("r35", "UPDATE accessibility_issues SET wcag_criteria = '1.3.1'");
    expect(db.query).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
    expect(() => client.deferHistorical("r35", "SELECT 1")).toThrow("Duplicate");
  });
});

describe("post-listen historical corrections", () => {
  const migrations = [{ id: "first", sql: "UPDATE first_table SET value = 1" }, { id: "second", sql: "UPDATE second_table SET value = 2" }];
  it("records successful corrections atomically and skips them on subsequent startups", async () => {
    const db = database();
    await runHistoricalMigrations(migrations, async () => db.client, () => false);
    expect([...db.committed]).toEqual(["first", "second"]);
    expect(db.calls.indexOf("COMMIT")).toBeGreaterThan(db.calls.indexOf(migrations[0].sql));
    db.calls.length = 0;
    await runHistoricalMigrations(migrations, async () => db.client, () => false);
    expect(db.calls).not.toContain(migrations[0].sql);
    expect(db.calls).not.toContain(migrations[1].sql);
    expect(db.calls).not.toContain(HISTORICAL_MIGRATIONS_SCHEMA_SQL);
    expect(db.release).toHaveBeenLastCalledWith(false);
  });
  it("rolls back a failed correction and leaves dependent corrections for a later startup", async () => {
    const db = database(), original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql, values) => {
      if (sql === migrations[0].sql) throw new Error("lock timeout");
      return original(sql, values);
    });
    await runHistoricalMigrations(migrations, async () => db.client, () => false);
    expect(db.calls).toContain("ROLLBACK");
    expect(db.committed.size).toBe(0);
    expect(db.calls).not.toContain(migrations[1].sql);
    expect(db.calls.at(-1)).toContain("pg_advisory_unlock");
    expect(db.release).toHaveBeenCalledWith(false);
  });
  it("does not run later corrections in a competing replica", async () => {
    const db = database();
    db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
    await runHistoricalMigrations(migrations, async () => db.client, () => false);
    expect(db.calls).not.toContain("BEGIN");
    expect(db.release).toHaveBeenCalledWith(false);
  });
  it("does not acquire a connection when shutdown has started", async () => {
    const connect = vi.fn();
    await runHistoricalMigrations(migrations, connect, () => true);
    expect(connect).not.toHaveBeenCalled();
  });
  it("destroys the pooled connection if its session advisory lock cannot be released", async () => {
    const db = database(), original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql, values) => {
      if (sql.includes("pg_advisory_unlock")) throw new Error("connection lost");
      return original(sql, values);
    });
    await runHistoricalMigrations(migrations, async () => db.client, () => false);
    expect(db.release).toHaveBeenCalledWith(true);
  });
});

it("keeps historical rule fixes out of schema transactions and runs them after listening", () => {
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const schemaStartup = source.slice(source.indexOf("async function runStartupMigrations"), source.indexOf("async function seedDefaultAdmin"));
  expect(schemaStartup).not.toMatch(/await client\.query\("BEGIN"\)/);
  expect(schemaStartup).not.toMatch(/await client\.query\(`\s*UPDATE accessibility_issues/);
  expect(source).toContain('deferHistorical("historical-r35-wcag-mapping"');
  expect(source.indexOf("await runHistoricalMigrations(")).toBeGreaterThan(source.indexOf("async function runPostListenRecovery"));
  expect(source).toContain("postListenRecoveryPromise = runPostListenRecovery()");
  expect(source).toContain('if (process.argv.includes("--migrate-only"))');
});
