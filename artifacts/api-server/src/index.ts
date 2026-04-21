import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import path from "path";


const __dirname = new URL('.', import.meta.url).pathname;

// Serve frontend static files
app.use(
  (await import("express")).default.static(
    path.join(__dirname, "../../accessibility-scanner/dist/public")
  )
);

// Fallback route (VERY IMPORTANT)
app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../../accessibility-scanner/dist/public/index.html")
  );
});
/**
 * Idempotent startup migration.
 * Creates any tables/columns introduced after the initial deployment so that
 * production databases catch up automatically on the next deploy without
 * requiring a manual drizzle-kit push.
 */
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

    await client.query("COMMIT");
    logger.info("Startup migrations completed");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Startup migration failed — server will still start");
  } finally {
    client.release();
  }
}

const rawPort = process.env.PORT || 8080;

app.listen(rawPort, () => {
  console.log(`Server running on port ${rawPort}`);
});

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(process.env.PORT || 8080);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run migrations before accepting traffic
runStartupMigrations()
  .then(() => {
    app.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to run startup migrations");
    process.exit(1);
});
