import { pgTable, uuid, text, timestamp, jsonb, integer, bigserial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const dataAuditEventsTable = pgTable("data_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actorId: text("actor_id"),
  databaseActor: text("database_actor").notNull().default(sql`session_user`),
  requestId: text("request_id"),
  source: text("source").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [index("data_audit_events_created_idx").on(table.createdAt, table.id),
  index("data_audit_events_entity_idx").on(table.entityType, table.entityId, table.createdAt)]);
export const insertDataAuditEventSchema = createInsertSchema(dataAuditEventsTable).omit({ id: true, createdAt: true });
export type DataAuditEvent = typeof dataAuditEventsTable.$inferSelect;

export const dataEvidenceOutboxTable = pgTable("data_evidence_outbox", {
  eventId: uuid("event_id").primaryKey().references(() => dataAuditEventsTable.id, { onDelete: "restrict" }),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  objectKey: text("object_key"),
  sha256: text("sha256"),
  lastError: text("last_error"),
});
export const insertDataEvidenceOutboxSchema = createInsertSchema(dataEvidenceOutboxTable);
export type DataEvidenceOutbox = typeof dataEvidenceOutboxTable.$inferSelect;

export const dataProtectionChecksTable = pgTable("data_protection_checks", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
});
export const insertDataProtectionCheckSchema = createInsertSchema(dataProtectionChecksTable).omit({ id: true, checkedAt: true });
export type DataProtectionCheck = typeof dataProtectionChecksTable.$inferSelect;

export const dataRecoveryExportsTable = pgTable("data_recovery_exports", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  actorId: text("actor_id").notNull(),
  objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
});
export const insertDataRecoveryExportSchema = createInsertSchema(dataRecoveryExportsTable).omit({ createdAt: true });
export type DataRecoveryExport = typeof dataRecoveryExportsTable.$inferSelect;
