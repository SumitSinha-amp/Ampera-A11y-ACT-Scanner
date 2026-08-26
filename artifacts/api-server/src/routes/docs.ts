import { Router, type Request, type Response } from "express";
import puppeteer from "puppeteer";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middlewares/authMiddleware";
import { logger } from "../lib/logger";

const router = Router();

function getChromiumPath(): string | undefined {
  if (process.env["PUPPETEER_EXECUTABLE_PATH"]) {
    const p = process.env["PUPPETEER_EXECUTABLE_PATH"];
    if (existsSync(p)) return p;
  }
  try {
    const p = execSync(
      "which chromium-browser 2>/dev/null || which chromium 2>/dev/null || which google-chrome 2>/dev/null || which google-chrome-stable 2>/dev/null",
      { timeout: 3000 },
    ).toString().trim();
    if (p && existsSync(p)) return p;
  } catch { /* not found */ }
  return undefined;
}

// GET /api/docs/screenshots — list all captured screenshots (admin only)
router.get("/docs/screenshots", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query<{
      key: string;
      captured_at: Date;
      width: number | null;
      height: number | null;
      captured_by: number | null;
    }>(
      "SELECT key, captured_at, width, height, captured_by FROM doc_screenshots ORDER BY captured_at DESC",
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "docs/screenshots: list failed");
    res.status(500).json({ error: "Failed to list screenshots" });
  }
});

// GET /api/docs/screenshots/:key — serve screenshot image (auth required)
router.get("/docs/screenshots/:key", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params as { key: string };
  try {
    const result = await pool.query<{ image_data: Buffer; content_type: string }>(
      "SELECT image_data, content_type FROM doc_screenshots WHERE key = $1",
      [key],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Screenshot not found" });
      return;
    }
    const { image_data, content_type } = result.rows[0];
    res.setHeader("Content-Type", content_type);
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(image_data);
  } catch (err) {
    logger.error({ err, key }, "docs/screenshots: serve failed");
    res.status(500).json({ error: "Failed to load screenshot" });
  }
});

// POST /api/docs/screenshots/capture — launch Puppeteer, capture, store (admin only)
router.post("/docs/screenshots/capture", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const {
    key,
    path: pagePath,
    width = 1440,
    height = 900,
  } = req.body as { key: string; path: string; width?: number; height?: number };

  if (!key || !/^[a-z0-9-]+$/.test(String(key))) {
    res.status(400).json({ error: "key must be lowercase alphanumeric with hyphens only" });
    return;
  }
  if (!pagePath || !String(pagePath).startsWith("/")) {
    res.status(400).json({ error: "path must start with /" });
    return;
  }

  // Build internal URL — in production the API server serves the React frontend.
  // In dev the Vite server is separate; admins should capture from their deployed instance.
  const port = process.env["PORT"] ?? 3000;
  const targetUrl = `http://localhost:${port}${pagePath}`;

  // Extract the session cookie so Puppeteer navigates as the authenticated admin.
  const cookieHeader = (req.headers["cookie"] as string) ?? "";
  const sidMatch = cookieHeader.match(/connect\.sid=([^;]+)/);
  const sidValue = sidMatch ? sidMatch[1] : "";

  let browser: import("puppeteer").Browser | null = null;
  try {
    logger.info({ key, targetUrl, width, height }, "doc screenshot: starting capture");

    browser = await puppeteer.launch({
      headless: true,
      executablePath: getChromiumPath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        `--window-size=${width},${height}`,
        "--hide-scrollbars",
        "--disable-extensions",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: Number(width), height: Number(height) });

    // Inject the admin's session cookie
    if (sidValue) {
      await page.setCookie({
        name: "connect.sid",
        value: sidValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      });
    }

    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 45_000 });

    // Let React data fetches + animations settle
    await new Promise((r) => setTimeout(r, 2500));

    const buf = await page.screenshot({ type: "jpeg", quality: 85, fullPage: false });

    const userId = (req.session as { user?: { id?: number } }).user?.id ?? null;
    await pool.query(
      `INSERT INTO doc_screenshots (key, image_data, content_type, captured_by, width, height)
       VALUES ($1, $2, 'image/jpeg', $3, $4, $5)
       ON CONFLICT (key) DO UPDATE
         SET image_data  = EXCLUDED.image_data,
             captured_at = NOW(),
             captured_by = EXCLUDED.captured_by,
             width       = EXCLUDED.width,
             height      = EXCLUDED.height`,
      [key, Buffer.from(buf as Uint8Array), userId, Number(width), Number(height)],
    );

    logger.info({ key }, "doc screenshot: captured and stored");
    res.json({ ok: true, key });
  } catch (err) {
    logger.error({ err, key, targetUrl }, "doc screenshot: capture failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Capture failed" });
  } finally {
    await browser?.close().catch(() => {});
  }
});

// DELETE /api/docs/screenshots/:key — remove a screenshot (admin only)
router.delete("/docs/screenshots/:key", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params as { key: string };
  try {
    await pool.query("DELETE FROM doc_screenshots WHERE key = $1", [key]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, key }, "docs/screenshots: delete failed");
    res.status(500).json({ error: "Failed to delete screenshot" });
  }
});

export default router;
