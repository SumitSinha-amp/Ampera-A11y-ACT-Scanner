import { pgTable, serial, text, integer, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id:        serial("id").primaryKey(),
  type:      text("type").notNull(), // 'ticket' | 'feature_request' | 'scan' | 'false_positive' | 'issue'
  title:     text("title").notNull(),
  body:      text("body"),
  link:      text("link"),
  actorId:   integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorName: text("actor_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationReadsTable = pgTable(
  "notification_reads",
  {
    notificationId: integer("notification_id")
      .notNull()
      .references(() => notificationsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export const notificationRecipientsTable = pgTable(
  "notification_recipients",
  {
    notificationId: integer("notification_id")
      .notNull()
      .references(() => notificationsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.notificationId, t.userId] }),
    index("notification_recipients_user_idx").on(t.userId, t.notificationId),
  ],
);

export type Notification     = typeof notificationsTable.$inferSelect;
export type NotificationRead = typeof notificationReadsTable.$inferSelect;
export type NotificationRecipient = typeof notificationRecipientsTable.$inferSelect;
