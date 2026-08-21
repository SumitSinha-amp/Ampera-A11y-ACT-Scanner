import { Router } from "express";
import { db, pool } from "@workspace/db";
import { notificationsTable, notificationReadsTable } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

function isAdmin(role?: string) {
  return role === "super_admin" || role === "admin";
}

// GET /api/notifications
// Admins: all system notifications with per-user read state
// Regular users: not authorised (404)
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const user = req.session?.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(user.role)) { res.status(403).json({ error: "Admins only" }); return; }

  try {
    const rows = await pool.query<{
      id: number;
      type: string;
      title: string;
      body: string | null;
      link: string | null;
      actor_id: number | null;
      actor_name: string | null;
      created_at: Date;
      is_read: boolean;
    }>(
      `SELECT n.id, n.type, n.title, n.body, n.link, n.actor_id, n.actor_name, n.created_at,
              (nr.user_id IS NOT NULL) AS is_read
       FROM notifications n
       LEFT JOIN notification_reads nr
         ON nr.notification_id = n.id AND nr.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 60`,
      [user.id],
    );

    res.json(
      rows.rows.map((r) => ({
        id:        r.id,
        type:      r.type,
        title:     r.title,
        body:      r.body,
        link:      r.link,
        actorId:   r.actor_id,
        actorName: r.actor_name,
        createdAt: r.created_at.toISOString(),
        isRead:    Boolean(r.is_read),
      })),
    );
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// PUT /api/notifications/read-all — mark every notification as read for current user
router.put("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const user = req.session?.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(user.role)) { res.status(403).json({ error: "Admins only" }); return; }

  try {
    // Insert read records for all notifications not yet read by this user
    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $1
       FROM notifications n
       WHERE NOT EXISTS (
         SELECT 1 FROM notification_reads nr
         WHERE nr.notification_id = n.id AND nr.user_id = $1
       )
       ON CONFLICT DO NOTHING`,
      [user.id],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

// PUT /api/notifications/:id/read — mark one notification as read
router.put("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const user = req.session?.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(user.role)) { res.status(403).json({ error: "Admins only" }); return; }

  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid notification ID" }); return; }

  try {
    await db
      .insert(notificationReadsTable)
      .values({ notificationId: id, userId: user.id })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// DELETE /api/notifications/:id — super_admin only
router.delete("/notifications/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.session?.user;
  if (!user || user.role !== "super_admin") { res.status(403).json({ error: "Super admins only" }); return; }

  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

export default router;
