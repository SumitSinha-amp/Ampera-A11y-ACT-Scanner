import nodemailer from "nodemailer";
import { logger } from "./logger";
import { db, appSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"] as const;

async function getSmtpConfig() {
  try {
    const rows = await db
      .select()
      .from(appSettingsTable)
      .where(inArray(appSettingsTable.key, [...SMTP_KEYS]));

    const map: Record<string, string> = {};
    for (const row of rows) {
      if (row.value) map[row.key] = row.value;
    }

    const host = map["smtp_host"] || process.env.SMTP_HOST;
    const port = parseInt(map["smtp_port"] || process.env.SMTP_PORT || "587", 10);
    const user = map["smtp_user"] || process.env.SMTP_USER;
    const pass = map["smtp_pass"] || process.env.SMTP_PASS;
    const from = map["smtp_from"] || process.env.SMTP_FROM || "noreply@amperatech.ai";

    return { host, port, user, pass, from };
  } catch {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || "noreply@amperatech.ai";
    return { host, port, user, pass, from };
  }
}

async function createTransport() {
  const { host, port, user, pass } = await getSmtpConfig();
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export async function sendInviteEmail(opts: {
  to: string;
  fullName: string;
  username: string;
  tempPassword: string;
  inviteToken: string;
  appUrl: string;
}): Promise<boolean> {
  const { from } = await getSmtpConfig();
  const transport = await createTransport();
  const resetLink = `${opts.appUrl}/reset-password?token=${opts.inviteToken}`;

  const text = `Hi ${opts.fullName},\n\nYou have been invited to the A11y ACT Tool.\n\nUsername: ${opts.username}\nTemporary password: ${opts.tempPassword}\n\nPlease click the link below to set your own password:\n${resetLink}\n\nThis link expires in 72 hours.`;

  if (!transport) {
    logger.warn({ to: opts.to }, "SMTP not configured — invite email not sent. Temp password logged below (dev only).");
    logger.info({ username: opts.username, tempPassword: opts.tempPassword, resetLink }, "DEV: invite details");
    return false;
  }

  try {
    await transport.sendMail({ from, to: opts.to, subject: "You're invited to A11y ACT Tool", text });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send invite email");
    return false;
  }
}

export async function sendTestEmail(opts: { to: string }): Promise<boolean> {
  const { from } = await getSmtpConfig();
  const transport = await createTransport();
  if (!transport) return false;
  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject: "A11y ACT Tool — SMTP Test",
      text: "This is a test email from the A11y ACT Tool. Your SMTP configuration is working correctly.",
    });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send test email");
    return false;
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  fullName: string;
  resetToken: string;
  appUrl: string;
}): Promise<boolean> {
  const { from } = await getSmtpConfig();
  const transport = await createTransport();
  const resetLink = `${opts.appUrl}/reset-password?token=${opts.resetToken}`;

  if (!transport) {
    logger.warn({ to: opts.to }, "SMTP not configured — password reset email not sent");
    return false;
  }

  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject: "Reset your A11y ACT Tool password",
      text: `Hi ${opts.fullName},\n\nClick below to reset your password:\n${resetLink}\n\nThis link expires in 1 hour.`,
    });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send password reset email");
    return false;
  }
}
