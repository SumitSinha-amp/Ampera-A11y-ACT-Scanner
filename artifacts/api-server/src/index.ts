import app from "./app";
import { logger } from "./lib/logger";
import { pool, db, scanSessionsTable, pageResultsTable, usersTable } from "@workspace/db";
import { inArray, eq, and } from "drizzle-orm";
import { startScan } from "./lib/scanQueue";
import bcrypt from "bcryptjs";
import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import path from "path";

async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Create the projects table if it does not exist yet.
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id         SERIAL PRIMARY KEY,
        name       TEXT   NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Add project_id FK column to scan_sessions if it does not exist yet.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'scan_sessions'
            AND column_name = 'project_id'
        ) THEN
          ALTER TABLE scan_sessions
            ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);

    // 3. Add initiator metadata columns to scan_sessions if they do not exist yet.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'scan_sessions'
            AND column_name = 'initiator_name'
        ) THEN
          ALTER TABLE scan_sessions
            ADD COLUMN initiator_name TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'scan_sessions'
            AND column_name = 'initiator_role'
        ) THEN
          ALTER TABLE scan_sessions
            ADD COLUMN initiator_role TEXT;
        END IF;
      END
      $$
    `);

    // 4. Create session table for connect-pg-simple
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid"    VARCHAR NOT NULL COLLATE "default",
        "sess"   JSON    NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      ) WITH (OIDS=FALSE)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
    `);

    // 5. Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                      SERIAL PRIMARY KEY,
        email                   TEXT    NOT NULL UNIQUE,
        username                TEXT    NOT NULL UNIQUE,
        password_hash           TEXT    NOT NULL,
        full_name               TEXT    NOT NULL,
        role                    TEXT    NOT NULL DEFAULT 'user',
        is_active               BOOLEAN NOT NULL DEFAULT TRUE,
        must_reset_password     BOOLEAN NOT NULL DEFAULT TRUE,
        invite_token            TEXT,
        invite_token_expires_at TIMESTAMP,
        created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 6. Create user_groups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_groups (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 7. Create user_group_members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_group_members (
        user_id  INTEGER NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES user_groups(id)  ON DELETE CASCADE,
        PRIMARY KEY (user_id, group_id)
      )
    `);

    // 8. Create support_tickets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject     TEXT    NOT NULL,
        description TEXT    NOT NULL,
        status      TEXT    NOT NULL DEFAULT 'open',
        priority    TEXT    NOT NULL DEFAULT 'medium',
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 9. Create ticket_replies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_replies (
        id         SERIAL PRIMARY KEY,
        ticket_id  INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
        message    TEXT    NOT NULL,
        is_admin   BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 10. Add group_id to scan_sessions
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'scan_sessions'
            AND column_name = 'group_id'
        ) THEN
          ALTER TABLE scan_sessions
            ADD COLUMN group_id INTEGER REFERENCES user_groups(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);

    // 11. Create user_permissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        can_scan            BOOLEAN NOT NULL DEFAULT TRUE,
        can_export          BOOLEAN NOT NULL DEFAULT TRUE,
        can_view_all_scans  BOOLEAN NOT NULL DEFAULT FALSE,
        allowed_rules       JSONB,
        updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_by          INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // 12. Add role_label to user_groups
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_groups' AND column_name = 'role_label'
        ) THEN
          ALTER TABLE user_groups ADD COLUMN role_label TEXT;
        END IF;
      END
      $$
    `);

    // 13. Add new permission columns to user_permissions
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'can_edit_scan') THEN
          ALTER TABLE user_permissions ADD COLUMN can_edit_scan BOOLEAN NOT NULL DEFAULT TRUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'can_delete_scan') THEN
          ALTER TABLE user_permissions ADD COLUMN can_delete_scan BOOLEAN NOT NULL DEFAULT TRUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'can_manage_scan') THEN
          ALTER TABLE user_permissions ADD COLUMN can_manage_scan BOOLEAN NOT NULL DEFAULT TRUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'can_create_project') THEN
          ALTER TABLE user_permissions ADD COLUMN can_create_project BOOLEAN NOT NULL DEFAULT TRUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'can_delete_project') THEN
          ALTER TABLE user_permissions ADD COLUMN can_delete_project BOOLEAN NOT NULL DEFAULT TRUE;
        END IF;
      END
      $$
    `);

    // 14. Assign orphaned scans (NULL user_id) to superadmin
    await client.query(`
      UPDATE scan_sessions
      SET user_id = (SELECT id::text FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1)
      WHERE user_id IS NULL
        AND EXISTS (SELECT 1 FROM users WHERE role = 'super_admin')
    `);

    await client.query("COMMIT");
    logger.info("Startup migrations completed");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Startup migration failed — server will still start");
  } finally {
    client.release();
  }
}

async function seedDefaultAdmin(): Promise<void> {
  try {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (existing) return; // Users already exist, skip seed

    const defaultPassword = "Admin@1234!";
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    await db.insert(usersTable).values({
      email: "admin@localhost",
      username: "admin",
      passwordHash,
      fullName: "Super Administrator",
      role: "super_admin",
      isActive: true,
      mustResetPassword: false,
    });

    logger.info("═══════════════════════════════════════════════");
    logger.info("  Default super admin created:");
    logger.info("  Username: admin");
    logger.info("  Password: Admin@1234!");
    logger.info("  Please change this password after first login!");
    logger.info("═══════════════════════════════════════════════");
  } catch (err) {
    logger.error({ err }, "Failed to seed default admin — continuing startup");
  }
}

async function recoverOrphanedScans(): Promise<void> {
  try {
    const orphaned = await db
      .select()
      .from(scanSessionsTable)
      .where(inArray(scanSessionsTable.status, ["pending", "running"]));

    if (orphaned.length === 0) {
      logger.info("No orphaned scans to recover");
      return;
    }

    logger.info({ count: orphaned.length }, "Recovering orphaned scans on startup");

    for (const session of orphaned) {
      try {
        await db
          .update(pageResultsTable)
          .set({ status: "pending" })
          .where(
            and(
              eq(pageResultsTable.scanId, session.id),
              inArray(pageResultsTable.status, [
                "navigating",
                "scanning",
                "rendering",
                "analyzing",
                "saving",
              ])
            )
          );

        const remaining = await db
          .select({ url: pageResultsTable.url })
          .from(pageResultsTable)
          .where(
            and(
              eq(pageResultsTable.scanId, session.id),
              inArray(pageResultsTable.status, ["pending", "requeued"])
            )
          );

        if (remaining.length === 0) {
          await db
            .update(scanSessionsTable)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(scanSessionsTable.id, session.id));
          logger.info({ scanId: session.id }, "Orphaned scan had no remaining pages — marked completed");
          continue;
        }

        await db
          .update(scanSessionsTable)
          .set({ status: "running" })
          .where(eq(scanSessionsTable.id, session.id));

        const urls = remaining.map((p) => p.url);
        startScan(session.id, urls, {
          ...((session.options as Record<string, unknown>) ?? {}),
          skipCompletedPages: true,
        }).catch((err) => {
          logger.error({ scanId: session.id, err }, "Orphaned scan restart failed");
        });

        logger.info({ scanId: session.id, urlCount: urls.length }, "Restarted orphaned scan");
      } catch (err) {
        logger.error({ scanId: session.id, err }, "Failed to recover orphaned scan — skipping");
      }
    }
  } catch (err) {
    logger.error({ err }, "recoverOrphanedScans failed — scans may stay stuck");
  }
}

/*const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

runStartupMigrations()
  .then(() => seedDefaultAdmin())
  .then(() => recoverOrphanedScans())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup failed");
    process.exit(1);
  });*/
/**
 * On Linux (Azure App Service, Docker, etc.) the Puppeteer-bundled Chrome
 * binary requires several system shared libraries that may not be present in
 * a fresh container.  This function detects missing libraries via `ldd` and
 * installs them automatically so that Chrome works without any manual setup.
 *
 * It is a no-op on non-Linux platforms and safe to call on every startup
 * (apt-get is idempotent — already-installed packages are skipped instantly).
 */
async function ensureChromeDependencies(): Promise<void> {
  if (process.platform !== "linux") return;

  try {
    // Locate the Puppeteer-bundled Chrome binary in the project cache.
    const cacheDir = path.join(process.cwd(), ".cache", "puppeteer", "chrome");
    if (!existsSync(cacheDir)) {
      logger.info("Puppeteer Chrome cache not found — skipping dependency check");
      return;
    }

    const linuxDirs = readdirSync(cacheDir).filter((d) => d.startsWith("linux-"));
    if (linuxDirs.length === 0) {
      logger.info("No linux-* Chrome version dirs found — skipping dependency check");
      return;
    }

    const chromePath = path.join(cacheDir, linuxDirs[0], "chrome-linux64", "chrome");
    if (!existsSync(chromePath)) {
      logger.info({ chromePath }, "Chrome binary not found at expected path — skipping");
      return;
    }

    // ldd exits 1 when any library is missing — we must capture stdout from the thrown error.
    let lddOut = "";
    try {
      lddOut = execSync(`ldd "${chromePath}"`, { encoding: "utf-8", timeout: 10_000 });
    } catch (lddErr: unknown) {
      const e = lddErr as { stdout?: string; stderr?: string };
      lddOut = (e?.stdout ?? "") + (e?.stderr ?? "");
    }

    if (!lddOut.includes("not found")) {
      logger.info("Chrome shared libraries all present — no installation needed");
      return;
    }

    const missingLibs = lddOut
      .split("\n")
      .filter((l) => l.includes("not found"))
      .map((l) => l.trim());

    logger.warn({ chromePath, missingLibs }, "Chrome missing shared libraries — auto-installing via apt-get");

    // Full set of libraries required by headless Chrome on Ubuntu/Debian.
    const CHROME_DEPS = [
      "libglib2.0-0", "libnss3", "libnspr4",
      "libatk1.0-0", "libatk-bridge2.0-0",
      "libcups2", "libdrm2", "libxkbcommon0",
      "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2",
      "libgbm1", "libpango-1.0-0", "libcairo2",
      "libasound2", "libatspi2.0-0",
      "libx11-6", "libxcb1", "libxext6", "libxrender1", "libx11-xcb1",
    ].join(" ");

    try {
      execSync(`apt-get install -y --no-install-recommends ${CHROME_DEPS}`, {
        encoding: "utf-8",
        timeout: 120_000,
        stdio: "pipe",
      });
      logger.info("Chrome shared libraries installed successfully");
    } catch (aptErr: unknown) {
      const e = aptErr as { stderr?: string; message?: string };
      logger.error(
        { err: e?.stderr ?? e?.message ?? String(aptErr) },
        "apt-get install failed — Chrome scans may continue to fail until libs are present",
      );
    }
  } catch (err) {
    logger.error({ err }, "ensureChromeDependencies — unexpected error (non-fatal)");
  }
}

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

runStartupMigrations()
  .then(() => Promise.all([seedDefaultAdmin(), ensureChromeDependencies()]))
  .then(() => recoverOrphanedScans())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup failed");
    process.exit(1);
  });
