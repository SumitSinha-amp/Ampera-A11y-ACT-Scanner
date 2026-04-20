import { Router, type IRouter } from "express";
import multer from "multer";
import { db, scanSessionsTable, pageResultsTable, accessibilityIssuesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  CreateScanBody,
  GetScanParams,
  DeleteScanParams,
  GetScanStatusParams,
  CancelScanParams,
  GetScanReportParams,
  ParseSitemapBody,
} from "@workspace/api-zod";
import { startScan, cancelScan, pauseScan, resumeScan, isScanPaused } from "../lib/scanQueue";
import { fetchSitemapUrls, parseUrlsFromCsv } from "../lib/sitemap";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/scans", async (req, res): Promise<void> => {
  const sessions = await db.select()
    .from(scanSessionsTable)
    .orderBy(desc(scanSessionsTable.createdAt))
    .limit(50);

  res.json(sessions.map(s => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
  })));
});

router.post("/scans", async (req, res): Promise<void> => {
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { urls, name, options } = parsed.data;

  if (!urls || urls.length === 0) {
    res.status(400).json({ error: "At least one URL is required" });
    return;
  }

  const validUrls = urls.filter(url => {
    try { new URL(url); return true; } catch { return false; }
  });

  if (validUrls.length === 0) {
    res.status(400).json({ error: "No valid URLs provided" });
    return;
  }

  const [session] = await db.insert(scanSessionsTable).values({
    name: name || null,
    status: "pending",
    totalUrls: validUrls.length,
    scannedUrls: 0,
    failedUrls: 0,
    totalIssues: 0,
    criticalIssues: 0,
    options: options ?? null,
  }).returning();

  await db.insert(pageResultsTable).values(
    validUrls.map(url => ({
      scanId: session.id,
      url,
      status: "pending",
      issueCount: 0,
      criticalCount: 0,
    }))
  );

  // Start scan in background
  startScan(session.id, validUrls, options ?? {}).catch(err => {
    logger.error({ scanId: session.id, err }, "Background scan failed");
  });

  res.status(201).json({
    ...session,
    createdAt: session.createdAt.toISOString(),
    completedAt: null,
  });
});

router.get("/scans/parse-sitemap", async (req, res): Promise<void> => {
  res.status(405).json({ error: "Use POST" });
});

router.post("/scans/parse-sitemap", async (req, res): Promise<void> => {
  const parsed = ParseSitemapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const urls = await fetchSitemapUrls(parsed.data.url);
    res.json({ urls, count: urls.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

router.post("/scans/upload-csv", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const content = req.file.buffer.toString("utf-8");
  const urls = parseUrlsFromCsv(content);

  res.json({ urls, count: urls.length });
});

router.get("/scans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetScanParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db.select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const pages = await db.select()
    .from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, session.id));

  const pagesWithIssues = await Promise.all(pages.map(async page => {
    const issues = await db.select()
      .from(accessibilityIssuesTable)
      .where(eq(accessibilityIssuesTable.pageId, page.id));

    return {
      ...page,
      scannedAt: page.scannedAt?.toISOString() ?? null,
      issues,
    };
  }));

  res.json({
    ...session,
    createdAt: session.createdAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    pages: pagesWithIssues,
  });
});

router.delete("/scans/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteScanParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  cancelScan(params.data.id);

  const [deleted] = await db.delete(scanSessionsTable)
    .where(eq(scanSessionsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/scans/:id/status", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetScanStatusParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db.select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const pages = await db.select()
    .from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, params.data.id));

  const ACTIVE_STAGES = ["scanning", "navigating", "rendering", "analyzing", "saving"];
  const scanning = pages.find(p => ACTIVE_STAGES.includes(p.status));
  const currentUrl = scanning ? scanning.url : null;

  res.json({
    id: session.id,
    status: session.status,
    totalUrls: session.totalUrls,
    scannedUrls: session.scannedUrls,
    failedUrls: session.failedUrls,
    currentUrl,
    pages: pages.map(p => ({
      url: p.url,
      status: p.status,
      issueCount: p.issueCount,
      criticalCount: p.criticalCount,
      errorMessage: p.errorMessage ?? null,
    })),
  });
});

router.post("/scans/:id/cancel", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CancelScanParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db.select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  cancelScan(params.data.id);

  await db.update(scanSessionsTable)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(scanSessionsTable.id, params.data.id));

  const [updated] = await db.select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, params.data.id));

  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    completedAt: updated.completedAt?.toISOString() ?? null,
  });
});

router.post("/scans/:id/pause", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const scanId = parseInt(raw, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db.select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, scanId));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const paused = pauseScan(scanId);
  if (!paused) {
    res.status(409).json({ error: "Scan is not currently running" });
    return;
  }

  await db.update(scanSessionsTable)
    .set({ status: "paused" })
    .where(eq(scanSessionsTable.id, scanId));

  res.json({ id: scanId, status: "paused" });
});

router.post("/scans/:id/resume", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const scanId = parseInt(raw, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db.select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, scanId));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  if (!isScanPaused(scanId)) {
    res.status(409).json({ error: "Scan is not paused" });
    return;
  }

  const resumed = resumeScan(scanId);
  if (!resumed) {
    res.status(409).json({ error: "Scan is not paused" });
    return;
  }

  await db.update(scanSessionsTable)
    .set({ status: "running" })
    .where(eq(scanSessionsTable.id, scanId));

  res.json({ id: scanId, status: "running" });
});

router.get("/scans/:id/report", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetScanReportParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db.select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const pages = await db.select()
    .from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, params.data.id));

  const allIssues = await db
    .select({
      ruleId: accessibilityIssuesTable.ruleId,
      impact: accessibilityIssuesTable.impact,
      description: accessibilityIssuesTable.description,
      wcagLevel: accessibilityIssuesTable.wcagLevel,
      pageId: accessibilityIssuesTable.pageId,
    })
    .from(accessibilityIssuesTable)
    .innerJoin(pageResultsTable, eq(accessibilityIssuesTable.pageId, pageResultsTable.id))
    .where(eq(pageResultsTable.scanId, params.data.id));

  const issuesByImpact = {
    critical: allIssues.filter(i => i.impact === "critical").length,
    serious: allIssues.filter(i => i.impact === "serious").length,
    moderate: allIssues.filter(i => i.impact === "moderate").length,
    minor: allIssues.filter(i => i.impact === "minor").length,
  };

  const issuesByWcagLevel = {
    A: allIssues.filter(i => i.wcagLevel === "A").length,
    AA: allIssues.filter(i => i.wcagLevel === "AA").length,
    AAA: allIssues.filter(i => i.wcagLevel === "AAA").length,
  };

  const ruleCounts = new Map<string, { count: number; description: string }>();
  for (const issue of allIssues) {
    const existing = ruleCounts.get(issue.ruleId);
    if (existing) {
      existing.count++;
    } else {
      ruleCounts.set(issue.ruleId, { count: 1, description: issue.description });
    }
  }

  const topRules = Array.from(ruleCounts.entries())
    .map(([ruleId, { count, description }]) => ({ ruleId, count, description }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const pagesWithMostIssues = pages
    .filter(p => p.status === "completed")
    .map(p => ({ url: p.url, issueCount: p.issueCount, criticalCount: p.criticalCount }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 10);

  res.json({
    scanId: session.id,
    totalPages: session.totalUrls,
    scannedPages: session.scannedUrls,
    failedPages: session.failedUrls,
    totalIssues: session.totalIssues,
    issuesByImpact,
    issuesByWcagLevel,
    topRules,
    pagesWithMostIssues,
  });
});


// GET /api/pages/:pageId/snapshot — return stored page screenshot as JPEG
router.get("/pages/:pageId/snapshot", async (req, res): Promise<void> => {
  const pageId = parseInt(req.params.pageId, 10);
  if (isNaN(pageId)) {
    res.status(400).json({ error: "Invalid pageId" });
    return;
  }
  const [page] = await db
    .select({ screenshot: pageResultsTable.screenshot })
    .from(pageResultsTable)
    .where(eq(pageResultsTable.id, pageId));

  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  if (!page.screenshot) {
    res.status(404).json({ error: "No snapshot available for this page" });
    return;
  }
  const buf = Buffer.from(page.screenshot, "base64");
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(buf);
});

// GET /api/pages/:pageId/html — serve stored Puppeteer-rendered HTML for Element Viewer
router.get("/pages/:pageId/html", async (req, res): Promise<void> => {
  const pageId = parseInt(req.params.pageId, 10);
  if (isNaN(pageId)) {
    res.status(400).json({ error: "Invalid pageId" });
    return;
  }
  const [page] = await db
    .select({ pageHtml: pageResultsTable.pageHtml })
    .from(pageResultsTable)
    .where(eq(pageResultsTable.id, pageId))
    .limit(1);
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  if (!page.pageHtml) {
    res.status(404).json({ error: "No HTML available for this page" });
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json({ html: page.pageHtml, statusCode: 200 });
});

// GET /api/page-source?url=... — server-side HTML fetch for Element Viewer (fallback)
router.get("/page-source", async (req, res): Promise<void> => {
  const { url } = req.query;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url required" });
    return;
  }
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    const html = await resp.text();
    res.json({ html, statusCode: resp.status });
  } catch (err) {
    logger.warn({ err, url }, "page-source fetch failed");
    res
      .status(502)
      .json({
        error: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
      });
  }
});

export default router;
