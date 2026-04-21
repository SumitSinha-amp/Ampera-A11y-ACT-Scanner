import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
