import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, userGroupsTable, userGroupMembersTable, userPermissionsTable, appSettingsTable } from "@workspace/db";
import { eq, asc, inArray, and } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../middlewares/authMiddleware";
import { sendInviteEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Users ─────────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      username: usersTable.username,
      fullName: usersTable.fullName,
      role: usersTable.role,
      isActive: usersTable.isActive,
      mustResetPassword: usersTable.mustResetPassword,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(asc(usersTable.fullName));

  // Attach group memberships
  const userIds = users.map((u) => u.id);
  let memberships: { userId: number; groupId: number; groupName: string }[] = [];
  if (userIds.length > 0) {
    const rows = await db
      .select({
        userId: userGroupMembersTable.userId,
        groupId: userGroupMembersTable.groupId,
        groupName: userGroupsTable.name,
      })
      .from(userGroupMembersTable)
      .leftJoin(userGroupsTable, eq(userGroupMembersTable.groupId, userGroupsTable.id))
      .where(inArray(userGroupMembersTable.userId, userIds));
    memberships = rows as typeof memberships;
  }

  const memberMap = memberships.reduce<Record<number, { id: number; name: string }[]>>((acc, m) => {
    if (!acc[m.userId]) acc[m.userId] = [];
    acc[m.userId].push({ id: m.groupId, name: m.groupName });
    return acc;
  }, {});

  res.json(
    users.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      groups: memberMap[u.id] || [],
    }))
  );
});

router.get("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({ ...user, passwordHash: undefined, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() });
});

router.post("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const { email, username, fullName, role, groupIds } = req.body ?? {};
  if (!email || !username || !fullName) {
    res.status(400).json({ error: "email, username, and fullName are required" });
    return;
  }

  // Only super_admin can create admin/super_admin accounts
  const requestingRole = req.session!.user!.role;
  if ((role === "admin" || role === "super_admin") && requestingRole !== "super_admin") {
    res.status(403).json({ error: "Only super admins can create admin accounts" });
    return;
  }

  const finalRole = role && ["super_admin", "admin", "user"].includes(role) ? role : "user";

  // Generate temp password
  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  // Generate invite token (72 hours)
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        username,
        fullName,
        role: finalRole,
        passwordHash,
        isActive: true,
        mustResetPassword: true,
        inviteToken,
        inviteTokenExpiresAt,
      })
      .returning();

    // Add user to selected groups
    if (Array.isArray(groupIds) && groupIds.length > 0) {
      await db.insert(userGroupMembersTable).values(
        groupIds.map((gid: number) => ({ userId: user.id, groupId: gid }))
      ).onConflictDoNothing();
    }

    const proto = String(req.headers["x-forwarded-proto"] ?? "https");
    const host = req.headers.host || "";
    const basePath = process.env.BASE_PATH || "";
    const appUrl = `${proto}://${host}${basePath}`;

    const emailSent = await sendInviteEmail({
      to: email,
      fullName,
      username,
      tempPassword,
      inviteToken,
      appUrl,
    });

    logger.info({ userId: user.id, emailSent }, "User created");

    res.status(201).json({
      ...user,
      passwordHash: undefined,
      tempPassword: emailSent ? undefined : tempPassword,
      inviteLink: emailSent ? undefined : `${appUrl}/reset-password?token=${inviteToken}`,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "A user with that email or username already exists" });
      return;
    }
    throw err;
  }
});

router.put("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const { fullName, email, role, isActive, groupIds } = req.body ?? {};
  const requestingRole = req.session!.user!.role;

  // Only super_admin can change roles
  const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (fullName) updates.fullName = fullName;
  if (email) updates.email = email;
  if (typeof isActive === "boolean") updates.isActive = isActive;
  if (role && requestingRole === "super_admin") {
    if (["super_admin", "admin", "user"].includes(role)) updates.role = role;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }

  // Sync group memberships if provided
  if (Array.isArray(groupIds)) {
    // Remove all current memberships for this user
    await db.delete(userGroupMembersTable).where(eq(userGroupMembersTable.userId, id));
    // Re-add selected groups
    if (groupIds.length > 0) {
      await db.insert(userGroupMembersTable).values(
        groupIds.map((gid: number) => ({ userId: id, groupId: gid }))
      ).onConflictDoNothing();
    }
  }

  res.json({ ...updated, passwordHash: undefined, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
});

router.delete("/admin/users/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  // Prevent deleting yourself
  if (req.session!.user!.id === id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.status(204).send();
});

// POST /admin/users/:id/reset-invite — resend invite / generate new temp password
router.post("/admin/users/:id/reset-invite", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await db.update(usersTable).set({ passwordHash, mustResetPassword: true, inviteToken, inviteTokenExpiresAt, updatedAt: new Date() }).where(eq(usersTable.id, id));

  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  const host = req.headers.host || "";
  const basePath = process.env.BASE_PATH || "";
  const appUrl = `${proto}://${host}${basePath}`;

  const emailSent = await sendInviteEmail({ to: user.email, fullName: user.fullName, username: user.username, tempPassword, inviteToken, appUrl });

  res.json({
    ok: true,
    emailSent,
    tempPassword: emailSent ? undefined : tempPassword,
    inviteLink: emailSent ? undefined : `${appUrl}/reset-password?token=${inviteToken}`,
  });
});

// ── Groups ────────────────────────────────────────────────────────────────────

router.get("/admin/groups", requireAdmin, async (_req, res): Promise<void> => {
  const groups = await db.select().from(userGroupsTable).orderBy(asc(userGroupsTable.name));

  const groupIds = groups.map((g) => g.id);
  let memberships: { groupId: number; userId: number; fullName: string; username: string }[] = [];
  if (groupIds.length > 0) {
    const rows = await db
      .select({
        groupId: userGroupMembersTable.groupId,
        userId: userGroupMembersTable.userId,
        fullName: usersTable.fullName,
        username: usersTable.username,
      })
      .from(userGroupMembersTable)
      .leftJoin(usersTable, eq(userGroupMembersTable.userId, usersTable.id))
      .where(inArray(userGroupMembersTable.groupId, groupIds));
    memberships = rows as typeof memberships;
  }

  const memberMap = memberships.reduce<Record<number, { id: number; fullName: string; username: string }[]>>((acc, m) => {
    if (!acc[m.groupId]) acc[m.groupId] = [];
    acc[m.groupId].push({ id: m.userId, fullName: m.fullName, username: m.username });
    return acc;
  }, {});

  res.json(groups.map((g) => ({ ...g, createdAt: g.createdAt.toISOString(), members: memberMap[g.id] || [] })));
});

router.post("/admin/groups", requireAdmin, async (req, res): Promise<void> => {
  const { name, description, roleLabel } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "Group name is required" }); return; }

  try {
    const [group] = await db.insert(userGroupsTable).values({ name, description: description || null, roleLabel: roleLabel || null }).returning();
    res.status(201).json({ ...group, createdAt: group.createdAt.toISOString(), members: [] });
  } catch (err: any) {
    if (err?.code === "23505") { res.status(409).json({ error: "A group with that name already exists" }); return; }
    throw err;
  }
});

router.put("/admin/groups/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid group ID" }); return; }

  const { name, description, roleLabel } = req.body ?? {};
  const updates: Partial<typeof userGroupsTable.$inferInsert> = {};
  if (name) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (roleLabel !== undefined) updates.roleLabel = roleLabel || null;

  const [updated] = await db.update(userGroupsTable).set(updates).where(eq(userGroupsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Group not found" }); return; }

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/admin/groups/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid group ID" }); return; }

  await db.delete(userGroupsTable).where(eq(userGroupsTable.id, id));
  res.status(204).send();
});

// Group members
router.post("/admin/groups/:id/members", requireAdmin, async (req, res): Promise<void> => {
  const groupId = parseInt(req.params["id"] as string, 10);
  const userId = parseInt(req.body?.userId, 10);
  if (isNaN(groupId) || isNaN(userId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  await db.insert(userGroupMembersTable).values({ groupId, userId }).onConflictDoNothing();
  res.json({ ok: true });
});

router.delete("/admin/groups/:id/members/:userId", requireAdmin, async (req, res): Promise<void> => {
  const groupId = parseInt(req.params["id"] as string, 10);
  const userId = parseInt(req.params["userId"] as string, 10);
  if (isNaN(groupId) || isNaN(userId)) { res.status(400).json({ error: "Invalid IDs" }); return; }

  await db.delete(userGroupMembersTable).where(
    and(eq(userGroupMembersTable.groupId, groupId), eq(userGroupMembersTable.userId, userId))
  );
  res.status(204).send();
});

// ── Permissions ───────────────────────────────────────────────────────────────

// GET /admin/permissions — list permissions for all users (super_admin only)
router.get("/admin/permissions", requireSuperAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      fullName: usersTable.fullName,
      email: usersTable.email,
      role: usersTable.role,
    })
    .from(usersTable)
    .orderBy(asc(usersTable.fullName));

  const perms = await db.select().from(userPermissionsTable);
  const permMap = perms.reduce<Record<number, typeof perms[0]>>((acc, p) => {
    acc[p.userId] = p;
    return acc;
  }, {});

  res.json(users.map((u) => ({
    ...u,
    permissions: permMap[u.id] ?? {
      userId: u.id,
      canScan: true,
      canExport: true,
      canViewAllScans: false,
      canEditScan: true,
      canDeleteScan: true,
      canManageScan: true,
      canCreateProject: true,
      canDeleteProject: true,
      allowedRules: null,
    },
  })));
});

// PUT /admin/permissions/:userId — upsert permissions for a user (super_admin only)
router.put("/admin/permissions/:userId", requireSuperAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params["userId"] as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const { canScan, canExport, canViewAllScans, canEditScan, canDeleteScan, canManageScan, canCreateProject, canDeleteProject, allowedRules } = req.body ?? {};
  const updatedBy = req.session!.user!.id;

  const bool = (v: unknown, def: boolean) => typeof v === "boolean" ? v : def;

  const values = {
    userId,
    canScan: bool(canScan, true),
    canExport: bool(canExport, true),
    canViewAllScans: bool(canViewAllScans, false),
    canEditScan: bool(canEditScan, true),
    canDeleteScan: bool(canDeleteScan, true),
    canManageScan: bool(canManageScan, true),
    canCreateProject: bool(canCreateProject, true),
    canDeleteProject: bool(canDeleteProject, true),
    allowedRules: Array.isArray(allowedRules) ? allowedRules : null,
    updatedAt: new Date(),
    updatedBy,
  };

  await db
    .insert(userPermissionsTable)
    .values(values)
    .onConflictDoUpdate({
      target: userPermissionsTable.userId,
      set: {
        canScan: values.canScan,
        canExport: values.canExport,
        canViewAllScans: values.canViewAllScans,
        canEditScan: values.canEditScan,
        canDeleteScan: values.canDeleteScan,
        canManageScan: values.canManageScan,
        canCreateProject: values.canCreateProject,
        canDeleteProject: values.canDeleteProject,
        allowedRules: values.allowedRules,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    });

  res.json(values);
});

// ── App Settings (SMTP etc.) ───────────────────────────────────────────────────

// ── Logo settings ─────────────────────────────────────────────────────────────

const LOGO_KEYS = ["logo_type", "logo_image_url", "logo_text", "logo_size"] as const;

// GET /api/logo — public, no auth required; returns current logo settings for all users
router.get("/logo", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(appSettingsTable)
      .where(inArray(appSettingsTable.key, [...LOGO_KEYS]));
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (row.value != null) map[row.key] = row.value;
    }
    res.json({
      type: map["logo_type"] ?? "image",
      imageUrl: map["logo_image_url"] ?? "",
      text: map["logo_text"] ?? "",
      size: map["logo_size"] ? parseInt(map["logo_size"], 10) : null,
    });
  } catch {
    res.json({ type: "image", imageUrl: "", text: "", size: null });
  }
});

// PUT /api/admin/logo — admin/super_admin only; upserts logo settings
router.put("/admin/logo", requireAdmin, async (req, res): Promise<void> => {
  const updatedBy = req.session!.user!.id;
  const { type, imageUrl, text, size } = req.body ?? {};
  const now = new Date();

  const rows: { key: string; value: string; updatedAt: Date; updatedBy: number }[] = [];
  if (type === "image" || type === "text") {
    rows.push({ key: "logo_type", value: type, updatedAt: now, updatedBy });
  }
  if (typeof imageUrl === "string") {
    rows.push({ key: "logo_image_url", value: imageUrl, updatedAt: now, updatedBy });
  }
  if (typeof text === "string") {
    rows.push({ key: "logo_text", value: text, updatedAt: now, updatedBy });
  }
  if (typeof size === "number" && Number.isFinite(size)) {
    rows.push({ key: "logo_size", value: String(size), updatedAt: now, updatedBy });
  }

  for (const row of rows) {
    await db.insert(appSettingsTable).values(row).onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value: row.value, updatedAt: row.updatedAt, updatedBy: row.updatedBy },
    });
  }

  res.json({ ok: true });
});

// ── SMTP settings ─────────────────────────────────────────────────────────────

const SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"] as const;

// GET /admin/settings — return current SMTP settings (super_admin only)
router.get("/admin/settings", requireSuperAdmin, async (req, res): Promise<void> => {
  const rows = await db.select().from(appSettingsTable).where(inArray(appSettingsTable.key, [...SMTP_KEYS]));
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.value !== null && row.value !== undefined) map[row.key] = row.value;
  }
  res.json(map);
});

// PUT /admin/settings — upsert SMTP settings (super_admin only)
router.put("/admin/settings", requireSuperAdmin, async (req, res): Promise<void> => {
  const updatedBy = req.session!.user!.id;
  const body = req.body ?? {};
  const now = new Date();

  const rows = SMTP_KEYS
    .filter((k) => typeof body[k] === "string")
    .map((k) => ({ key: k, value: body[k] as string, updatedAt: now, updatedBy }));

  if (rows.length > 0) {
    for (const row of rows) {
      await db
        .insert(appSettingsTable)
        .values(row)
        .onConflictDoUpdate({
          target: appSettingsTable.key,
          set: { value: row.value, updatedAt: row.updatedAt, updatedBy: row.updatedBy },
        });
    }
  }

  res.json({ ok: true });
});

// POST /admin/settings/test-email — send a test email using current SMTP config (super_admin only)
router.post("/admin/settings/test-email", requireSuperAdmin, async (req, res): Promise<void> => {
  const { to } = req.body ?? {};
  if (!to) { res.status(400).json({ error: "Recipient email required" }); return; }

  const { sendTestEmail } = await import("../lib/email");
  const result = await sendTestEmail({ to });
  if (result.ok) {
    res.json({ ok: true });
  } else {
    res.status(502).json({ error: result.error ?? "Failed to send test email. Check SMTP configuration." });
  }
});

export default router;
