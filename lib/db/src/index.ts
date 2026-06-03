import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  // TCP keepalives prevent Azure PostgreSQL from silently terminating idle
  // connections after its ~5-minute server-side timeout.
  keepAlive: true,
  keepAliveInitialDelayMillis: 60_000,
});

// Without this handler an ETIMEDOUT (or any other error) on an idle pool
// connection emits an unhandled 'error' event, which Node.js turns into an
// uncaught exception that crashes the entire process.
pool.on("error", (err) => {
  console.error(
    "[db-pool] idle client error — connection will be discarded:",
    err.message,
  );
});

export const db = drizzle(pool, { schema });

export {
  projectsTable,
  scanSessionsTable,
  pageResultsTable,
  accessibilityIssuesTable,
  insertProjectSchema,
  insertScanSessionSchema,
  insertPageResultSchema,
  insertAccessibilityIssueSchema,
  type InsertProject,
  type Project,
  type InsertScanSession,
  type ScanSession,
  type InsertPageResult,
  type PageResult,
  type InsertAccessibilityIssue,
  type AccessibilityIssue,
} from "./schema/scans";
export * from "./schema";
export { appSettingsTable } from "./schema/users";
