import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/authMiddleware";
import { fingerprintSite } from "../lib/siteFingerprinter";
import { discoverUrls } from "../lib/urlDiscovery";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /api/advanced/probe — fingerprint a site and upsert its domain profile
router.post("/advanced/probe", requireAuth, async (req, res): Promise<void> => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  try {
    const result = await fingerprintSite(url);

    // Upsert domain profile into scan_domain_profiles
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO scan_domain_profiles
           (domain, strategy, has_cloudflare, requires_js, has_rate_limit, fingerprint_signals, last_scan_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
         ON CONFLICT (domain) DO UPDATE SET
           strategy            = EXCLUDED.strategy,
           has_cloudflare      = EXCLUDED.has_cloudflare,
           requires_js         = EXCLUDED.requires_js,
           has_rate_limit      = EXCLUDED.has_rate_limit,
           fingerprint_signals = EXCLUDED.fingerprint_signals,
           last_scan_at        = NOW(),
           updated_at          = NOW()`,
        [
          result.domain,
          result.strategy,
          result.signals.hasCloudflare,
          result.signals.requiresJs,
          result.signals.hasRateLimit,
          JSON.stringify(result.signals),
        ],
      );
    } finally {
      client.release();
    }

    res.json(result);
  } catch (err) {
    logger.error({ url, err }, "Fingerprint probe failed");
    res.status(500).json({ error: "Probe failed. Check server logs for details." });
  }
});

// GET /api/advanced/discover?url=...&max=...&dedup=1 — SSE URL discovery
router.get("/advanced/discover", requireAuth, async (req, res): Promise<void> => {
  const url = req.query["url"] as string | undefined;
  const maxRaw = req.query["max"] as string | undefined;
  const dedupRaw = req.query["dedup"] as string | undefined;

  if (!url) {
    res.status(400).json({ error: "url query param is required" });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const maxUrls = Math.min(5000, Math.max(1, parseInt(maxRaw ?? "500", 10) || 500));
  const applyDedup = dedupRaw !== "0";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client disconnected
    }
  };

  // Heartbeat: Azure Application Gateway / reverse proxies drop idle TCP
  // connections after ~4 minutes with no data.  Send an SSE comment every
  // 25 s so the connection stays alive even when discovery is crawling slowly.
  const heartbeatTimer = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { /* client gone */ }
  }, 25_000);

  try {
    const urls = await discoverUrls(url, {
      maxUrls,
      applyDedup,
      onProgress: (progress) => sendEvent("progress", progress),
    });

    sendEvent("complete", { urls, count: urls.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Discovery failed";
    logger.error({ url, err }, "URL discovery SSE failed");
    sendEvent("error", { message: msg });
  } finally {
    clearInterval(heartbeatTimer);
  }

  res.end();
});

// GET /api/advanced/profile/:domain — get saved domain profile
router.get("/advanced/profile/:domain", requireAuth, async (req, res): Promise<void> => {
  const domain = req.params["domain"] as string;

  if (!domain) {
    res.status(400).json({ error: "domain is required" });
    return;
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM scan_domain_profiles WHERE domain = $1",
      [domain],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "No profile found for this domain" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ domain, err }, "Get domain profile failed");
    res.status(500).json({ error: "Failed to retrieve domain profile" });
  } finally {
    client.release();
  }
});

export default router;
