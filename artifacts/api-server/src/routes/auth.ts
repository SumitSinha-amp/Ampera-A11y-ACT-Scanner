import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, userGroupMembersTable, userGroupsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendInviteEmail, sendPasswordResetEmail } from "../lib/email";
import { requireAuth } from "../middlewares/authMiddleware";
import { getEffectivePermissions } from "../lib/permissions";

const router: IRouter = Router();

// POST /api/auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.username, username), eq(usersTable.email, username)));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    mustResetPassword: user.mustResetPassword,
  };

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    mustResetPassword: user.mustResetPassword,
  });
});

// POST /api/auth/logout
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get("/auth/me", (req, res): void => {
  if (!req.session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(req.session.user);
});

// GET /api/auth/my-permissions — returns effective permissions for the logged-in user
router.get("/auth/my-permissions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session!.user!.id;
  const role = req.session!.user!.role;
  const perms = await getEffectivePermissions(userId, role);
  res.json(perms);
});

// GET /api/auth/my-groups — returns groups the current user belongs to (includes roleLabel)
router.get("/auth/my-groups", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session!.user!.id;

  const rows = await db
    .select({
      id: userGroupsTable.id,
      name: userGroupsTable.name,
      roleLabel: userGroupsTable.roleLabel,
    })
    .from(userGroupMembersTable)
    .leftJoin(userGroupsTable, eq(userGroupMembersTable.groupId, userGroupsTable.id))
    .where(eq(userGroupMembersTable.userId, userId));

  res.json(rows.filter(r => r.id !== null));
});

// POST /api/auth/reset-password  — with invite/reset token
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body ?? {};
  if (!token || !password) {
    res.status(400).json({ error: "Token and password are required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.inviteToken, token));

  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
    res.status(400).json({ error: "Reset token has expired" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .update(usersTable)
    .set({
      passwordHash,
      mustResetPassword: false,
      inviteToken: null,
      inviteTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  res.json({ ok: true });
});

// POST /api/auth/change-password — when already logged in
router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Both current and new password are required" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const userId = req.session!.user!.id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(usersTable)
    .set({ passwordHash, mustResetPassword: false, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  req.session!.user!.mustResetPassword = false;
  res.json({ ok: true });
});

// POST /api/auth/forgot-password  — request password reset via email
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  // Always return success to avoid user enumeration
  if (!user) {
    res.json({ ok: true });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.update(usersTable).set({ inviteToken: token, inviteTokenExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  const host = req.headers.host || "";
  const basePath = process.env.BASE_PATH || "";
  const appUrl = `${proto}://${host}${basePath}`;

  await sendPasswordResetEmail({ to: user.email, fullName: user.fullName, resetToken: token, appUrl });
  res.json({ ok: true });
});

export default router;
