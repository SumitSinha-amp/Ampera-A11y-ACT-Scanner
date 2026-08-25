import { AnyPgColumn, pgTable, serial, integer, text, timestamp, date, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { projectsTable, scanSessionsTable, pageResultsTable } from "./scans";
import { sitesTable } from "./crawler";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appIssuesTable = pgTable("app_issues", {
  id: serial("id").primaryKey(),
  issueKey: text("issue_key").notNull(),
  type: text("type").notNull().default("task"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  severity: text("severity"),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  siteId: integer("site_id").references(() => sitesTable.id, { onDelete: "set null" }),
  scanId: integer("scan_id").references(() => scanSessionsTable.id, { onDelete: "set null" }),
  pageId: integer("page_id").references(() => pageResultsTable.id, { onDelete: "set null" }),
  ruleId: text("rule_id"),
  selector: text("selector"),
  sourceDescription: text("source_description"),
  assigneeId: integer("assignee_id").references(() => usersTable.id, { onDelete: "set null" }),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  labels: jsonb("labels").$type<string[]>().notNull().default([]),
  checklist: jsonb("checklist").$type<{ text: string; done: boolean }[]>().notNull().default([]),
  acceptanceCriteria: text("acceptance_criteria"),
  environment: text("environment"),
  stepsToReproduce: text("steps_to_reproduce"),
  expectedResult: text("expected_result"),
  actualResult: text("actual_result"),
  dueDate: date("due_date"),
  sprint: text("sprint"),
  relatedIssueIds: jsonb("related_issue_ids").$type<number[]>().notNull().default([]),
  epicId: integer("epic_id").references((): AnyPgColumn => appIssuesTable.id, { onDelete: "set null" }),
  customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("app_issues_key_unique").on(t.issueKey),
  index("app_issues_site_idx").on(t.siteId),
  index("app_issues_project_idx").on(t.projectId),
  index("app_issues_status_idx").on(t.status),
  index("app_issues_assignee_idx").on(t.assigneeId),
  index("app_issues_epic_idx").on(t.epicId),
]);

export const appIssueLinksTable = pgTable("app_issue_links", {
  id: serial("id").primaryKey(),
  sourceIssueId: integer("source_issue_id").notNull().references(() => appIssuesTable.id, { onDelete: "cascade" }),
  targetIssueId: integer("target_issue_id").notNull().references(() => appIssuesTable.id, { onDelete: "cascade" }),
  linkType: text("link_type").notNull(),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("app_issue_links_unique").on(t.sourceIssueId, t.targetIssueId, t.linkType),
  index("app_issue_links_source_idx").on(t.sourceIssueId),
  index("app_issue_links_target_idx").on(t.targetIssueId),
]);

export const appIssueCommentsTable = pgTable("app_issue_comments", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull().references(() => appIssuesTable.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  mentions: jsonb("mentions").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("app_issue_comments_issue_idx").on(t.issueId)]);

export const appIssueActivityTable = pgTable("app_issue_activity", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull().references(() => appIssuesTable.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("app_issue_activity_issue_idx").on(t.issueId)]);

export const appIssueAttachmentsTable = pgTable("app_issue_attachments", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull().references(() => appIssuesTable.id, { onDelete: "cascade" }),
  commentId: integer("comment_id").references(() => appIssueCommentsTable.id, { onDelete: "cascade" }),
  uploadedBy: integer("uploaded_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  pending: boolean("pending").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("app_issue_attachments_issue_idx").on(t.issueId),
  index("app_issue_attachments_comment_idx").on(t.commentId),
  index("app_issue_attachments_pending_idx").on(t.pending, t.expiresAt),
]);

export const insertAppIssueSchema = createInsertSchema(appIssuesTable).omit({
  id: true, issueKey: true, reporterId: true, createdAt: true, updatedAt: true,
});
export type AppIssue = typeof appIssuesTable.$inferSelect;
export type InsertAppIssue = z.infer<typeof insertAppIssueSchema>;
export type AppIssueComment = typeof appIssueCommentsTable.$inferSelect;
export type AppIssueActivity = typeof appIssueActivityTable.$inferSelect;
export type AppIssueAttachment = typeof appIssueAttachmentsTable.$inferSelect;
export type AppIssueLink = typeof appIssueLinksTable.$inferSelect;