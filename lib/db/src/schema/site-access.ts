import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sitesTable } from "./crawler";
import { usersTable, userGroupsTable } from "./users";

export const siteUserAccessTable = pgTable("site_user_access", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => sitesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // "owner" | "member"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("site_user_access_unique_idx").on(t.siteId, t.userId),
  index("site_user_access_site_idx").on(t.siteId),
  index("site_user_access_user_idx").on(t.userId),
]);

export const siteGroupAccessTable = pgTable("site_group_access", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => sitesTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull().references(() => userGroupsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("site_group_access_unique_idx").on(t.siteId, t.groupId),
  index("site_group_access_site_idx").on(t.siteId),
  index("site_group_access_group_idx").on(t.groupId),
]);

export type SiteUserAccess = typeof siteUserAccessTable.$inferSelect;
export type SiteGroupAccess = typeof siteGroupAccessTable.$inferSelect;
