import { Router, type IRouter } from "express";
import multer from "multer";
import { db, scanSessionsTable, pageResultsTable, accessibilityIssuesTable, projectsTable } from "@workspace/db";
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
  const sessions = await db
    .select({
      id: scanSessionsTable.id,
      projectId: scanSessionsTable.projectId,
      projectName: projectsTable.name,
      name: scanSessionsTable.name,
      status: scanSessionsTable.status,
      totalUrls: scanSessionsTable.totalUrls,
      scannedUrls: scanSessionsTable.scannedUrls,
      failedUrls: scanSessionsTable.failedUrls,
      totalIssues: scanSessionsTable.totalIssues,
      criticalIssues: scanSessionsTable.criticalIssues,
      options: scanSessionsTable.options,
      createdAt: scanSessionsTable.createdAt,
      completedAt: scanSessionsTable.completedAt,
    })
    .from(scanSessionsTable)
    .leftJoin(projectsTable, eq(scanSessionsTable.projectId, projectsTable.id))
    .orderBy(desc(scanSessionsTable.createdAt))
    .limit(50);

  res.json(sessions.map(s => ({
    ...s,
    projectName: s.projectName ?? null,
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

  const { urls, name, projectId, options } = parsed.data;

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
    projectId: projectId ?? null,
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

  const [row] = await db
    .select({
      id: scanSessionsTable.id,
      projectId: scanSessionsTable.projectId,
      projectName: projectsTable.name,
      name: scanSessionsTable.name,
      status: scanSessionsTable.status,
      totalUrls: scanSessionsTable.totalUrls,
      scannedUrls: scanSessionsTable.scannedUrls,
      failedUrls: scanSessionsTable.failedUrls,
      totalIssues: scanSessionsTable.totalIssues,
      criticalIssues: scanSessionsTable.criticalIssues,
      options: scanSessionsTable.options,
      createdAt: scanSessionsTable.createdAt,
      completedAt: scanSessionsTable.completedAt,
    })
    .from(scanSessionsTable)
    .leftJoin(projectsTable, eq(scanSessionsTable.projectId, projectsTable.id))
    .where(eq(scanSessionsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const pages = await db.select()
    .from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, row.id));

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
    ...row,
    projectName: row.projectName ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
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

/**
 * POST /api/scans/:id/retry
 *
 * Clone strategy:
 *  - Create a new scan session containing ALL original URLs.
 *  - For pages that were already `completed`, copy their screenshot, HTML,
 *    issue data and totals directly — no re-scan.
 *  - For pages that were `failed` or `pending`, mark them `pending` and
 *    add only those URLs to the actual scan queue.
 *
 * Query params:
 *  - name  (optional) – override the default retry name
 */
router.post("/scans/:id/retry", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const originalId = parseInt(raw, 10);
  if (isNaN(originalId)) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [originalRow] = await db
    .select({
      id: scanSessionsTable.id,
      projectId: scanSessionsTable.projectId,
      projectName: projectsTable.name,
      name: scanSessionsTable.name,
      status: scanSessionsTable.status,
      options: scanSessionsTable.options,
    })
    .from(scanSessionsTable)
    .leftJoin(projectsTable, eq(scanSessionsTable.projectId, projectsTable.id))
    .where(eq(scanSessionsTable.id, originalId));

  const original = originalRow;

  if (!original) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  // Fetch all pages + their issues in one pass
  const originalPages = await db.select()
    .from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, originalId));

  if (originalPages.length === 0) {
    res.status(400).json({ error: "Original scan has no pages to retry" });
    return;
  }

  // Compute retry name (strip old suffix, append "(retry N)")
  const customName = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  let retryName: string | null = null;
  if (customName) {
    retryName = customName;
  } else if (original.name) {
    const base = original.name.replace(/\s*\(retry(?:\s+\d+|failed)?\)/gi, "").trim();
    const m = original.name.match(/\(retry\s+(\d+)\)/i);
    const n = m ? parseInt(m[1]) + 1 : 2;
    retryName = `${base} (retry ${n})`;
  }

  const completedPages = originalPages.filter(p => p.status === "completed");
  const pendingPages   = originalPages.filter(p => p.status !== "completed");

  // Compute totals for the pre-populated completed pages
  const preScanned   = completedPages.length;
  const preTotalIssues   = completedPages.reduce((s, p) => s + (p.issueCount ?? 0), 0);
  const preCriticalIssues = completedPages.reduce((s, p) => s + (p.criticalCount ?? 0), 0);

  const opts = (original.options ?? {}) as Record<string, unknown>;

  // Create new scan session (carries over project association)
  const [newSession] = await db.insert(scanSessionsTable).values({
    name: retryName,
    projectId: original.projectId ?? null,
    status: pendingPages.length === 0 ? "completed" : "pending",
    totalUrls: originalPages.length,
    scannedUrls: preScanned,
    failedUrls: 0,
    totalIssues: preTotalIssues,
    criticalIssues: preCriticalIssues,
    options: original.options ?? null,
    ...(pendingPages.length === 0 ? { completedAt: new Date() } : {}),
  }).returning();

  // Insert completed pages with their data copied verbatim
  if (completedPages.length > 0) {
    const insertedCompleted = await db.insert(pageResultsTable).values(
      completedPages.map(p => ({
        scanId: newSession.id,
        url: p.url,
        status: "completed" as const,
        issueCount: p.issueCount ?? 0,
        criticalCount: p.criticalCount ?? 0,
        errorMessage: null,
        scannedAt: p.scannedAt ?? new Date(),
        screenshot: p.screenshot ?? null,
        pageHtml: p.pageHtml ?? null,
      }))
    ).returning();

    // Copy issues for each completed page
    for (const [idx, origPage] of completedPages.entries()) {
      const newPage = insertedCompleted[idx];
      if (!newPage) continue;

      const origIssues = await db.select()
        .from(accessibilityIssuesTable)
        .where(eq(accessibilityIssuesTable.pageId, origPage.id));

      if (origIssues.length > 0) {
        await db.insert(accessibilityIssuesTable).values(
          origIssues.map(iss => ({
            pageId: newPage.id,
            ruleId: iss.ruleId,
            impact: iss.impact,
            description: iss.description,
            element: iss.element ?? null,
            wcagCriteria: iss.wcagCriteria ?? null,
            wcagLevel: iss.wcagLevel ?? null,
            legalText: iss.legalText ?? null,
            selector: iss.selector ?? null,
            remediation: iss.remediation ?? null,
            bboxX: iss.bboxX ?? null,
            bboxY: iss.bboxY ?? null,
            bboxWidth: iss.bboxWidth ?? null,
            bboxHeight: iss.bboxHeight ?? null,
          }))
        );
      }
    }
  }

  // Insert pending pages (failed/pending from original)
  if (pendingPages.length > 0) {
    await db.insert(pageResultsTable).values(
      pendingPages.map(p => ({
        scanId: newSession.id,
        url: p.url,
        status: "pending" as const,
        issueCount: 0,
        criticalCount: 0,
      }))
    );
  }

  // Start scanning only the pages that need re-scanning
  const urlsToScan = pendingPages.map(p => p.url);
  if (urlsToScan.length > 0) {
    startScan(newSession.id, urlsToScan, opts as Parameters<typeof startScan>[2]).catch(err => {
      logger.error({ scanId: newSession.id, err }, "Background retry scan failed");
    });
  }

  res.status(201).json({
    ...newSession,
    createdAt: newSession.createdAt.toISOString(),
    completedAt: newSession.completedAt?.toISOString() ?? null,
  });
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
