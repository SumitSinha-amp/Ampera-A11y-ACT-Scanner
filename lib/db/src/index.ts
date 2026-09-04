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
  keepAlive: true,
  keepAliveInitialDelayMillis: 60_000,
});

pool.on("error", (err) => {
  console.error(
    "[db-pool] idle client error — connection will be discarded:",
    err.message,
  );
});

export const db = drizzle(pool, { schema });

export {
  projectsTable,
  projectSitesTable,
  scanSessionsTable,
  pageResultsTable,
  pageInteractionStatesTable,
  accessibilityIssuesTable,
  aiIssueAssessmentsTable,
  qaPagesTable,
  qaLinksTable,
  qaImagesTable,
  qaWordInventoryTable,
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

export {
  sitesTable,
  siteContentRulesTable,
  crawlerSessionsTable,
  crawlerPagesTable,
  crawlerUrlEventsTable,
  brokenLinksTable,
  crawlerDiscoveryCacheTable,
  insertSiteSchema,
  insertCrawlerSessionSchema,
  insertCrawlerPageSchema,
  insertBrokenLinkSchema,
  type InsertSite,
  type Site,
  type SiteContentRule,
  type CrawlerUrlEvent,
  type InsertCrawlerSession,
  type CrawlerSession,
  type InsertCrawlerPage,
  type CrawlerPage,
  type InsertBrokenLink,
  type BrokenLink,
} from "./schema/crawler";

export * from "./schema";
export { appSettingsTable } from "./schema/users";
export { issueDecisionsTable, type IssueDecision, type InsertIssueDecision } from "./schema/scans";
export { siteUserAccessTable, siteGroupAccessTable, type SiteUserAccess, type SiteGroupAccess } from "./schema/site-access";
export { notificationsTable, notificationReadsTable, type Notification, type NotificationRead } from "./schema/notifications";
export {
  appIssuesTable,
  appIssueCommentsTable,
  appIssueActivityTable,
  appIssueAttachmentsTable,
  insertAppIssueSchema,
  type AppIssue,
  type InsertAppIssue,
  type AppIssueComment,
  type AppIssueActivity,
  type AppIssueAttachment,
} from "./schema/issues";
