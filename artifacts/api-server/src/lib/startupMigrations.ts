import type { DatabasePoolClient } from "@workspace/db";
import { logger } from "./logger";

export interface HistoricalMigration {
  id: string;
  sql: string;
}

export const HISTORICAL_MIGRATIONS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS app_startup_data_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

/**
 * Each existing, idempotent schema step commits independently. PostgreSQL
 * retains DDL locks until transaction end, even for ADD COLUMN IF NOT EXISTS.
 * Never hold those locks through the rest of startup or historical backfills.
 * A multi-statement step remains atomic, preserving its internal dependencies.
 */
export function startupMigrationClient(connection: DatabasePoolClient, deferred: HistoricalMigration[]) {
  return {
    async query(sql: string) {
      await connection.query("BEGIN");
      try {
        await connection.query("SET LOCAL lock_timeout = '3s'");
        await connection.query("SET LOCAL statement_timeout = '60s'");
        await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('ampera:startup-schema-step', 0))");
        const result = await connection.query(sql);
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    },
    deferHistorical(id: string, sql: string) {
      if (deferred.some(migration => migration.id === id)) throw new Error(`Duplicate historical migration: ${id}`);
      deferred.push({ id, sql });
    },
  };
}

/**
 * Historical corrections are optional post-listen work, not schema readiness.
 * They run once, in order, and never share a transaction with schema changes.
 * A session advisory lock serializes the complete sequence across replicas.
 * Completion is recorded atomically with the correction, so rollback/shutdown
 * leaves it retryable on the next startup rather than silently skipping data.
 */
export async function runHistoricalMigrations(
  migrations: HistoricalMigration[],
  connect: () => Promise<DatabasePoolClient>,
  stopping: () => boolean,
): Promise<void> {
  if (!migrations.length || stopping()) return;
  const connection = await connect();
  let locked = false, destroy = false, activeTransaction = false;
  try {
    const lock = await connection.query(
      "SELECT pg_try_advisory_lock(hashtextextended('ampera:historical-startup-backfills', 0)) AS locked",
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) {
      logger.info("Historical startup corrections are running in another instance");
      return;
    }
    for (const migration of migrations) {
      if (stopping()) return;
      await connection.query("BEGIN");
      activeTransaction = true;
      await connection.query("SET LOCAL lock_timeout = '3s'");
      await connection.query("SET LOCAL statement_timeout = '10min'");
      await connection.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
      const completed = await connection.query("SELECT 1 FROM app_startup_data_migrations WHERE id = $1", [migration.id]);
      if (!completed.rows.length) {
        logger.info({ migrationId: migration.id }, "Historical startup correction started");
        await connection.query(migration.sql);
        await connection.query("INSERT INTO app_startup_data_migrations (id) VALUES ($1)", [migration.id]);
      }
      await connection.query("COMMIT");
      activeTransaction = false;
      if (!completed.rows.length) logger.info({ migrationId: migration.id }, "Historical startup correction completed");
    }
  } catch (error) {
    if (activeTransaction) {
      try { await connection.query("ROLLBACK"); }
      catch { destroy = true; }
    }
    // Do not advance to dependent corrections or fail the serving API. The
    // incomplete correction will be attempted again on a later startup.
    logger.error({ err: error }, "Historical startup correction deferred until next startup; application remains available");
  } finally {
    if (locked && !destroy) {
      try {
        const unlocked = await connection.query(
          "SELECT pg_advisory_unlock(hashtextextended('ampera:historical-startup-backfills', 0)) AS unlocked",
        );
        destroy = unlocked.rows[0]?.unlocked !== true;
      } catch { destroy = true; }
    }
    connection.release(destroy);
  }
}
