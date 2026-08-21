import { db, notificationsTable } from "@workspace/db";

export type NotificationType = "ticket" | "feature_request" | "scan" | "false_positive";

export async function createNotification(data: {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  actorId?: number | null;
  actorName?: string | null;
}) {
  try {
    await db.insert(notificationsTable).values({
      type:      data.type,
      title:     data.title,
      body:      data.body   ?? null,
      link:      data.link   ?? null,
      actorId:   data.actorId   ?? null,
      actorName: data.actorName ?? null,
    });
  } catch {
    // Notifications are best-effort — never let a failure block the main response
  }
}
