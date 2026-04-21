import { pgTable, text, serial, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scanSessionsTable = pgTable("scan_sessions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  name: text("name"),
  status: text("status").notNull().default("pending"),
  totalUrls: integer("total_urls").notNull().default(0),
  scannedUrls: integer("scanned_urls").notNull().default(0),
  failedUrls: integer("failed_urls").notNull().default(0),
  totalIssues: integer("total_issues").notNull().default(0),
  criticalIssues: integer("critical_issues").notNull().default(0),
  options: jsonb("options"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const pageResultsTable = pgTable("page_results", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => scanSessionsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  status: text("status").notNull().default("pending"),
  issueCount: integer("issue_count").notNull().default(0),
  criticalCount: integer("critical_count").notNull().default(0),
  errorMessage: text("error_message"),
  scannedAt: timestamp("scanned_at"),
  screenshot: text("screenshot"),
  pageHtml: text("page_html"),
});

export const accessibilityIssuesTable = pgTable("accessibility_issues", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id").notNull().references(() => pageResultsTable.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  impact: text("impact").notNull(),
  description: text("description").notNull(),
  element: text("element"),
  wcagCriteria: text("wcag_criteria"),
  wcagLevel: text("wcag_level"),
  legalText: text("legal_text"),
  selector: text("selector"),
  remediation: text("remediation"),
  bboxX: real("bbox_x"),
  bboxY: real("bbox_y"),
  bboxWidth: real("bbox_width"),
  bboxHeight: real("bbox_height"),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

export const insertScanSessionSchema = createInsertSchema(scanSessionsTable).omit({ id: true, createdAt: true, completedAt: true });
export type InsertScanSession = z.infer<typeof insertScanSessionSchema>;
export type ScanSession = typeof scanSessionsTable.$inferSelect;

export const insertPageResultSchema = createInsertSchema(pageResultsTable).omit({ id: true, scannedAt: true });
export type InsertPageResult = z.infer<typeof insertPageResultSchema>;
export type PageResult = typeof pageResultsTable.$inferSelect;

export const insertAccessibilityIssueSchema = createInsertSchema(accessibilityIssuesTable).omit({ id: true });
export type InsertAccessibilityIssue = z.infer<typeof insertAccessibilityIssueSchema>;
export type AccessibilityIssue = typeof accessibilityIssuesTable.$inferSelect;
