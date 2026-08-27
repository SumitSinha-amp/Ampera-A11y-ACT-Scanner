import { db, notificationsTable, notificationRecipientsTable } from "@workspace/db";
import { logger } from "./logger";

export type NotificationType = "ticket" | "feature_request" | "scan" | "false_positive" | "issue";

export async function createNotification(data: {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  actorId?: number | null;
  actorName?: string | null;
  recipientIds?: number[];
}): Promise<number | null> {
  const recipientIds = data.recipientIds === undefined
    ? undefined
    : [...new Set(data.recipientIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (recipientIds !== undefined && recipientIds.length === 0) return null;

  try {
    return await db.transaction(async (tx) => {
      const [notification] = await tx.insert(notificationsTable).values({
        type:      data.type,
        title:     data.title,
        body:      data.body   ?? null,
        link:      data.link   ?? null,
        actorId:   data.actorId   ?? null,
        actorName: data.actorName ?? null,
      }).returning({ id: notificationsTable.id });
      if (!notification) return null;
      if (recipientIds !== undefined) {
        await tx.insert(notificationRecipientsTable).values(
          recipientIds.map((userId) => ({ notificationId: notification.id, userId })),
        ).onConflictDoNothing();
      }
      return notification.id;
    });
  } catch (error) {
    // Notifications are best-effort — never let a failure block the main response
    logger.error({ err: error, type: data.type }, "Failed to create notification");
    return null;
  }
}
