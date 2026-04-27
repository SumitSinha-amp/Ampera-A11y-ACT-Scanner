import { Router, type IRouter } from "express";
import multer from "multer";
import { getAuth } from "@clerk/express";
import { db, scanSessionsTable, pageResultsTable, accessibilityIssuesTable, projectsTable } from "@workspace/db";
import { eq, and, desc, sql, inArray, isNull, or } from "drizzle-orm";
import {
  CreateScanBody,
  GetScanParams,
  DeleteScanParams,
  GetScanStatusParams,
  CancelScanParams,
  GetScanReportParams,
  ParseSitemapBody,
  UpdateScanParams,
  UpdateScanBody,
} from "@workspace/api-zod";
import { startScan, cancelScan, pauseScan, resumeScan, isScanActive, queueRetryUrl } from "../lib/scanQueue";
import { fetchSitemapUrls, parseUrlsFromCsv } from "../lib/sitemap";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FALLBACK_USER_ID = "shared-user";

function getAuthUserId(req: any): string {
  const auth = getAuth(req);
  return auth?.userId ?? FALLBACK_USER_ID;
}

router.get("/scans", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const sessions = await db
    .select({
      id: scanSessionsTable.id,
      projectId: scanSessionsTable.projectId,
      projectName: projectsTable.name,
      name: scanSessionsTable.name,
      initiatorName: scanSessionsTable.initiatorName,
      initiatorRole: scanSessionsTable.initiatorRole,
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
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { urls, name, projectId, options, initiatorName, initiatorRole } = parsed.data;

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
    userId,
    name: name || null,
    projectId: projectId ?? null,
    initiatorName: initiatorName ?? null,
    initiatorRole: initiatorRole ?? null,
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
    initiatorName: session.initiatorName ?? null,
    initiatorRole: session.initiatorRole ?? null,
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

// ── Shared helper: build comparison data from two scan IDs ────────────────────
async function buildComparison(scan1Id: number, scan2Id: number, strip1?: string, strip2?: string) {
  const selectSession = {
    id: scanSessionsTable.id,
    projectId: scanSessionsTable.projectId,
    projectName: projectsTable.name,
    name: scanSessionsTable.name,
    initiatorName: scanSessionsTable.initiatorName,
    initiatorRole: scanSessionsTable.initiatorRole,
    status: scanSessionsTable.status,
    totalUrls: scanSessionsTable.totalUrls,
    scannedUrls: scanSessionsTable.scannedUrls,
    failedUrls: scanSessionsTable.failedUrls,
    totalIssues: scanSessionsTable.totalIssues,
    criticalIssues: scanSessionsTable.criticalIssues,
    createdAt: scanSessionsTable.createdAt,
    completedAt: scanSessionsTable.completedAt,
  };

  const [[row1], [row2], pages1raw, pages2raw] = await Promise.all([
    db.select(selectSession).from(scanSessionsTable)
      .leftJoin(projectsTable, eq(scanSessionsTable.projectId, projectsTable.id))
      .where(eq(scanSessionsTable.id, scan1Id)),
    db.select(selectSession).from(scanSessionsTable)
      .leftJoin(projectsTable, eq(scanSessionsTable.projectId, projectsTable.id))
      .where(eq(scanSessionsTable.id, scan2Id)),
    db.select({ id: pageResultsTable.id, url: pageResultsTable.url, status: pageResultsTable.status, issueCount: pageResultsTable.issueCount, criticalCount: pageResultsTable.criticalCount })
      .from(pageResultsTable).where(eq(pageResultsTable.scanId, scan1Id)),
    db.select({ id: pageResultsTable.id, url: pageResultsTable.url, status: pageResultsTable.status, issueCount: pageResultsTable.issueCount, criticalCount: pageResultsTable.criticalCount })
      .from(pageResultsTable).where(eq(pageResultsTable.scanId, scan2Id)),
  ]);

  if (!row1 || !row2) return null;

  // Normalise a URL by stripping a base-URL prefix (e.g. "https://stgwww.example.com")
  // so pages from two environments can be matched on their path alone.
  const norm = (url: string, strip?: string) => {
    let n = url.replace(/\/+$/, "").toLowerCase();
    if (strip) {
      const s = strip.replace(/\/+$/, "").toLowerCase();
      if (n.startsWith(s)) n = n.slice(s.length) || "/";
    }
    return n;
  };
  const map1 = new Map(pages1raw.map(p => [norm(p.url, strip1), p]));
  const map2 = new Map(pages2raw.map(p => [norm(p.url, strip2), p]));

  const matchedNorm = [...map1.keys()].filter(u => map2.has(u));
  const onlyInScan1 = pages1raw.filter(p => !map2.has(norm(p.url, strip1))).map(p => p.url);
  const onlyInScan2 = pages2raw.filter(p => !map1.has(norm(p.url, strip2))).map(p => p.url);

  const page1Ids = matchedNorm.map(u => map1.get(u)!.id);
  const page2Ids = matchedNorm.map(u => map2.get(u)!.id);

  const [issues1all, issues2all] = await Promise.all([
    page1Ids.length > 0
      ? db.select({ pageId: accessibilityIssuesTable.pageId, ruleId: accessibilityIssuesTable.ruleId, impact: accessibilityIssuesTable.impact, description: accessibilityIssuesTable.description, selector: accessibilityIssuesTable.selector, wcagCriteria: accessibilityIssuesTable.wcagCriteria, wcagLevel: accessibilityIssuesTable.wcagLevel })
          .from(accessibilityIssuesTable).where(inArray(accessibilityIssuesTable.pageId, page1Ids))
      : Promise.resolve([] as { pageId: number; ruleId: string; impact: string; description: string; selector: string | null; wcagCriteria: string | null; wcagLevel: string | null }[]),
    page2Ids.length > 0
      ? db.select({ pageId: accessibilityIssuesTable.pageId, ruleId: accessibilityIssuesTable.ruleId, impact: accessibilityIssuesTable.impact, description: accessibilityIssuesTable.description, selector: accessibilityIssuesTable.selector, wcagCriteria: accessibilityIssuesTable.wcagCriteria, wcagLevel: accessibilityIssuesTable.wcagLevel })
          .from(accessibilityIssuesTable).where(inArray(accessibilityIssuesTable.pageId, page2Ids))
      : Promise.resolve([] as { pageId: number; ruleId: string; impact: string; description: string; selector: string | null; wcagCriteria: string | null; wcagLevel: string | null }[]),
  ]);

  const byPage1 = new Map<number, typeof issues1all>();
  for (const i of issues1all) {
    if (!byPage1.has(i.pageId)) byPage1.set(i.pageId, []);
    byPage1.get(i.pageId)!.push(i);
  }
  const byPage2 = new Map<number, typeof issues2all>();
  for (const i of issues2all) {
    if (!byPage2.has(i.pageId)) byPage2.set(i.pageId, []);
    byPage2.get(i.pageId)!.push(i);
  }

  const issueKey = (i: { ruleId: string; selector: string | null }) =>
    `${i.ruleId}||${i.selector ?? ""}`;

  const pages = matchedNorm.map(nu => {
    const p1 = map1.get(nu)!;
    const p2 = map2.get(nu)!;
    const i1 = byPage1.get(p1.id) ?? [];
    const i2 = byPage2.get(p2.id) ?? [];
    const keys1 = new Set(i1.map(issueKey));
    const keys2 = new Set(i2.map(issueKey));
    const newIssues      = i2.filter(i => !keys1.has(issueKey(i)));
    const fixedIssues    = i1.filter(i => !keys2.has(issueKey(i)));
    const persistingIssues = i2.filter(i => keys1.has(issueKey(i)));
    return {
      url: p1.url,
      scan1Page: { status: p1.status, issueCount: p1.issueCount, criticalCount: p1.criticalCount },
      scan2Page: { status: p2.status, issueCount: p2.issueCount, criticalCount: p2.criticalCount },
      newIssues:        newIssues.map(i => ({ ruleId: i.ruleId, impact: i.impact, description: i.description, selector: i.selector, wcagCriteria: i.wcagCriteria, wcagLevel: i.wcagLevel })),
      fixedIssues:      fixedIssues.map(i => ({ ruleId: i.ruleId, impact: i.impact, description: i.description, selector: i.selector, wcagCriteria: i.wcagCriteria, wcagLevel: i.wcagLevel })),
      persistingIssues: persistingIssues.map(i => ({ ruleId: i.ruleId, impact: i.impact, description: i.description, selector: i.selector, wcagCriteria: i.wcagCriteria, wcagLevel: i.wcagLevel })),
    };
  });

  const totalNew       = pages.reduce((s, p) => s + p.newIssues.length, 0);
  const totalFixed     = pages.reduce((s, p) => s + p.fixedIssues.length, 0);
  const totalPersisting = pages.reduce((s, p) => s + p.persistingIssues.length, 0);

  const fmtSession = (s: typeof row1) => ({
    id: s.id, projectId: s.projectId, projectName: s.projectName ?? null,
    name: s.name, initiatorName: s.initiatorName, initiatorRole: s.initiatorRole,
    status: s.status, totalUrls: s.totalUrls, scannedUrls: s.scannedUrls,
    failedUrls: s.failedUrls, totalIssues: s.totalIssues, criticalIssues: s.criticalIssues,
    createdAt: s.createdAt.toISOString(), completedAt: s.completedAt?.toISOString() ?? null,
  });

  return {
    scan1: fmtSession(row1),
    scan2: fmtSession(row2),
    summary: { pagesCompared: matchedNorm.length, pagesOnlyInScan1: onlyInScan1.length, pagesOnlyInScan2: onlyInScan2.length, totalNew, totalFixed, totalPersisting },
    pages,
    onlyInScan1,
    onlyInScan2,
  };
}

// ── GET /scans/compare  (JSON) ─────────────────────────────────────────────
router.get("/scans/compare", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const scan1Id = parseInt(req.query.scan1Id as string, 10);
  const scan2Id = parseInt(req.query.scan2Id as string, 10);
  if (isNaN(scan1Id) || isNaN(scan2Id)) {
    res.status(400).json({ error: "scan1Id and scan2Id query params are required" });
    return;
  }
  const strip1 = (req.query.strip1 as string) || undefined;
  const strip2 = (req.query.strip2 as string) || undefined;
  const result = await buildComparison(scan1Id, scan2Id, strip1, strip2);
  if (!result) { res.status(404).json({ error: "One or both scans not found" }); return; }
  res.json(result);
});

// ── GET /scans/compare/csv  (CSV download) ─────────────────────────────────
router.get("/scans/compare/csv", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const scan1Id = parseInt(req.query.scan1Id as string, 10);
  const scan2Id = parseInt(req.query.scan2Id as string, 10);
  if (isNaN(scan1Id) || isNaN(scan2Id)) {
    res.status(400).json({ error: "scan1Id and scan2Id query params are required" });
    return;
  }
  const strip1 = (req.query.strip1 as string) || undefined;
  const strip2 = (req.query.strip2 as string) || undefined;
  const result = await buildComparison(scan1Id, scan2Id, strip1, strip2);
  if (!result) { res.status(404).json({ error: "One or both scans not found" }); return; }

  const escCsv = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const headerRow = ["URL", "Baseline Issues (A)", "Current Issues (B)", "New Issues", "Fixed Issues", "Persisting", "Net Change"].join(",");
  const dataRows = result.pages.map(p =>
    [p.url, p.scan1Page.issueCount, p.scan2Page.issueCount, p.newIssues.length, p.fixedIssues.length, p.persistingIssues.length, p.newIssues.length - p.fixedIssues.length].join(",")
  );

  // Issue detail rows
  const detailHeader = ["", "Type", "Rule ID", "Impact", "WCAG", "Selector", "Description"].join(",");
  const detailRows: string[] = [];
  for (const p of result.pages) {
    if (p.newIssues.length + p.fixedIssues.length + p.persistingIssues.length === 0) continue;
    detailRows.push(escCsv(p.url));
    for (const i of p.newIssues)       detailRows.push(["", "NEW",       escCsv(i.ruleId), escCsv(i.impact), escCsv(i.wcagCriteria), escCsv(i.selector), escCsv(i.description)].join(","));
    for (const i of p.fixedIssues)     detailRows.push(["", "FIXED",     escCsv(i.ruleId), escCsv(i.impact), escCsv(i.wcagCriteria), escCsv(i.selector), escCsv(i.description)].join(","));
    for (const i of p.persistingIssues) detailRows.push(["", "PERSISTING", escCsv(i.ruleId), escCsv(i.impact), escCsv(i.wcagCriteria), escCsv(i.selector), escCsv(i.description)].join(","));
  }

  const csv = [
    `Scan Comparison: ${result.scan1.name ?? `Scan #${scan1Id}`} vs ${result.scan2.name ?? `Scan #${scan2Id}`}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "SUMMARY",
    `Pages Compared,${result.summary.pagesCompared}`,
    `New Issues,${result.summary.totalNew}`,
    `Fixed Issues,${result.summary.totalFixed}`,
    `Persisting Issues,${result.summary.totalPersisting}`,
    `Pages only in Scan A,${result.summary.pagesOnlyInScan1}`,
    `Pages only in Scan B,${result.summary.pagesOnlyInScan2}`,
    "",
    "PAGE SUMMARY",
    headerRow,
    ...dataRows,
    "",
    "ISSUE DETAIL",
    detailHeader,
    ...detailRows,
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="comparison-scan${scan1Id}-vs-scan${scan2Id}.csv"`);
  res.send(csv);
});

router.get("/scans/:id", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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
      initiatorName: scanSessionsTable.initiatorName,
      initiatorRole: scanSessionsTable.initiatorRole,
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

  // Exclude screenshot and pageHtml — these are large blobs served via
  // dedicated snapshot endpoints and are never needed on the detail page.
  const pages = await db.select({
    id: pageResultsTable.id,
    scanId: pageResultsTable.scanId,
    url: pageResultsTable.url,
    status: pageResultsTable.status,
    issueCount: pageResultsTable.issueCount,
    criticalCount: pageResultsTable.criticalCount,
    errorMessage: pageResultsTable.errorMessage,
    scannedAt: pageResultsTable.scannedAt,
  }).from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, row.id));

  // Only load full issue details when the scan is finished.
  // During active scans (running / paused / pending) the live view doesn't
  // need issue details, so skip that expensive query entirely.
  const scanIsActive = ["running", "paused", "pending"].includes(row.status);

  type IssueRow = typeof accessibilityIssuesTable.$inferSelect;
  const issuesByPageId = new Map<number, IssueRow[]>();

  if (!scanIsActive && pages.length > 0) {
    const allIssues = await db.select()
      .from(accessibilityIssuesTable)
      .where(inArray(accessibilityIssuesTable.pageId, pages.map(p => p.id)));

    for (const issue of allIssues) {
      const list = issuesByPageId.get(issue.pageId) ?? [];
      list.push(issue);
      issuesByPageId.set(issue.pageId, list);
    }
  }

  const pagesWithIssues = pages.map(page => ({
    ...page,
    scannedAt: page.scannedAt?.toISOString() ?? null,
    issues: issuesByPageId.get(page.id) ?? [],
  }));

  res.json({
    ...row,
    projectName: row.projectName ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    initiatorName: row.initiatorName ?? null,
    initiatorRole: row.initiatorRole ?? null,
    pages: pagesWithIssues,
  });
});

router.patch("/scans/:id", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateScanParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }
  const parsed = UpdateScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, initiatorName, initiatorRole } = parsed.data;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (initiatorName !== undefined) updates.initiatorName = initiatorName;
  if (initiatorRole !== undefined) updates.initiatorRole = initiatorRole;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [updated] = await db.update(scanSessionsTable)
    .set(updates)
    .where(eq(scanSessionsTable.id, params.data.id))
    .returning({ id: scanSessionsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }
  res.status(204).send();
});

router.delete("/scans/:id", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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
    initiatorName: session.initiatorName ?? null,
    initiatorRole: session.initiatorRole ?? null,
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
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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

  if (session.status !== "running") {
    res.status(409).json({ error: "Scan is not currently running" });
    return;
  }

  // Signal the in-memory worker (if running) and update DB.
  // Works for live scans and zombie scans (server restarted mid-scan).
  pauseScan(scanId);

  await db.update(scanSessionsTable)
    .set({ status: "paused" })
    .where(eq(scanSessionsTable.id, scanId));

  res.json({ id: scanId, status: "paused" });
});

router.post("/scans/:id/resume", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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

  // Use DB status as the source of truth (in-memory state is lost on restart)
  // Allow resuming scans stuck in "pending" (orphaned before startScan ran)
  // as well as "paused" scans.
  if (session.status !== "paused" && session.status !== "pending") {
    res.status(409).json({ error: "Scan is not paused or pending" });
    return;
  }

  if (isScanActive(scanId)) {
    // Live worker exists — just signal it to continue
    resumeScan(scanId);
    await db.update(scanSessionsTable)
      .set({ status: "running" })
      .where(eq(scanSessionsTable.id, scanId));
  } else {
    // Zombie scan: server was restarted while the scan was running.
    // Reset any pages that were mid-flight back to "pending" so they get re-scanned.
    await db.update(pageResultsTable)
      .set({ status: "pending" })
      .where(and(
        eq(pageResultsTable.scanId, scanId),
        inArray(pageResultsTable.status, ["navigating", "scanning", "saving"]),
      ));

    const remainingPages = await db
      .select({ url: pageResultsTable.url })
      .from(pageResultsTable)
      .where(and(
        eq(pageResultsTable.scanId, scanId),
        inArray(pageResultsTable.status, ["pending", "requeued"]),
      ));

    if (remainingPages.length === 0) {
      // Nothing left to scan — mark as completed
      await db.update(scanSessionsTable)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(scanSessionsTable.id, scanId));
      res.json({ id: scanId, status: "completed" });
      return;
    }

    await db.update(scanSessionsTable)
      .set({ status: "running" })
      .where(eq(scanSessionsTable.id, scanId));

    const urls = remainingPages.map(p => p.url);
    startScan(scanId, urls, {
      ...(session.options as Record<string, unknown> ?? {}),
      skipCompletedPages: true,
    }).catch(err => {
      logger.error({ scanId, err }, "Zombie scan restart failed");
    });

    logger.info({ scanId, urlCount: urls.length }, "Restarted zombie scan worker");
  }

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
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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
      initiatorName: scanSessionsTable.initiatorName,
      initiatorRole: scanSessionsTable.initiatorRole,
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
    const n = m ? parseInt(m[1]) + 1 : 1;
    retryName = `${base} (retry ${n})`;
  }

  // Deduplicate: keep only the best-status row per URL.
  // Priority: completed > not_available > failed > (anything else/pending)
  const statusPriority = (s: string) =>
    s === "completed" ? 3 : s === "not_available" ? 2 : s === "failed" ? 1 : 0;

  const bestByUrl = new Map<string, typeof originalPages[number]>();
  for (const p of originalPages) {
    const existing = bestByUrl.get(p.url);
    if (!existing || statusPriority(p.status) > statusPriority(existing.status)) {
      bestByUrl.set(p.url, p);
    }
  }
  const dedupedPages = Array.from(bestByUrl.values());

  const completedPages = dedupedPages.filter(p => p.status === "completed");
  const pendingPages   = dedupedPages.filter(p => p.status !== "completed");

  // Compute totals for the pre-populated completed pages
  const preScanned   = completedPages.length;
  const preTotalIssues   = completedPages.reduce((s, p) => s + (p.issueCount ?? 0), 0);
  const preCriticalIssues = completedPages.reduce((s, p) => s + (p.criticalCount ?? 0), 0);

  const opts = (original.options ?? {}) as Record<string, unknown>;

  // Create new scan session (carries over project association and initiator)
  const [newSession] = await db.insert(scanSessionsTable).values({
    userId,
    name: retryName,
    projectId: original.projectId ?? null,
    status: pendingPages.length === 0 ? "completed" : "pending",
    totalUrls: dedupedPages.length,
    scannedUrls: preScanned,
    failedUrls: 0,
    totalIssues: preTotalIssues,
    criticalIssues: preCriticalIssues,
    options: original.options ?? null,
    initiatorName: original.initiatorName ?? null,
    initiatorRole: original.initiatorRole ?? null,
    ...(pendingPages.length === 0 ? { completedAt: new Date() } : {}),
  }).returning();

  // Insert completed pages with their data copied verbatim (bulk)
  let insertedCompleted: (typeof pageResultsTable.$inferSelect)[] = [];
  if (completedPages.length > 0) {
    insertedCompleted = await db.insert(pageResultsTable).values(
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
  }

  // Insert pending pages (failed/pending from original) — bulk
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
    startScan(newSession.id, urlsToScan, { ...(opts as Parameters<typeof startScan>[2]), skipCompletedPages: true }).catch(err => {
      logger.error({ scanId: newSession.id, err }, "Background retry scan failed");
    });
  }

  // Respond immediately so the client isn't blocked while issues are copied
  res.status(201).json({
    ...newSession,
    createdAt: newSession.createdAt.toISOString(),
    completedAt: newSession.completedAt?.toISOString() ?? null,
  });

  // Copy issues for completed pages in the background (one bulk select + bulk inserts)
  if (insertedCompleted.length > 0) {
    (async () => {
      try {
        const origPageIds = completedPages.map(p => p.id);
        const allOrigIssues = await db.select()
          .from(accessibilityIssuesTable)
          .where(inArray(accessibilityIssuesTable.pageId, origPageIds));

        if (allOrigIssues.length === 0) return;

        // Build a map from original page id → new page id
        const origToNew = new Map<number, number>();
        for (let i = 0; i < completedPages.length; i++) {
          const orig = completedPages[i];
          const inserted = insertedCompleted[i];
          if (orig && inserted) origToNew.set(orig.id, inserted.id);
        }

        const issueRows = allOrigIssues
          .map(iss => {
            const newPageId = origToNew.get(iss.pageId);
            if (!newPageId) return null;
            return {
              pageId: newPageId,
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
            };
          })
          .filter(Boolean) as (typeof accessibilityIssuesTable.$inferInsert)[];

        // Insert in chunks to avoid hitting DB parameter limits
        const CHUNK = 500;
        for (let i = 0; i < issueRows.length; i += CHUNK) {
          await db.insert(accessibilityIssuesTable).values(issueRows.slice(i, i + CHUNK));
        }
        logger.info({ scanId: newSession.id, issues: issueRows.length }, "Retry: background issue copy complete");
      } catch (err) {
        logger.error({ scanId: newSession.id, err }, "Retry: background issue copy failed");
      }
    })();
  }
});

router.post("/scans/:id/retry-url", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const scanId = parseInt(raw, 10);
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (isNaN(scanId) || !url) {
    res.status(400).json({ error: "Invalid scan ID or URL" });
    return;
  }

  const [session] = await db.select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, scanId));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const [page] = await db.select()
    .from(pageResultsTable)
    .where(and(eq(pageResultsTable.scanId, scanId), eq(pageResultsTable.url, url)));

  if (!page) {
    res.status(404).json({ error: "Page not found in scan" });
    return;
  }

  if (page.status !== "failed" && page.status !== "pending" && page.status !== "requeued") {
    res.status(409).json({ error: "Only failed or pending URLs can be retried" });
    return;
  }

  if (session.status === "running" || session.status === "paused" || session.status === "pending") {
    const queued = queueRetryUrl(scanId, url);
    if (!queued) {
      res.status(409).json({ error: "Scan is not running" });
      return;
    }
    await db.update(pageResultsTable)
      .set({ status: "requeued", errorMessage: null, scannedAt: null, issueCount: 0, criticalCount: 0 })
      .where(and(eq(pageResultsTable.scanId, scanId), eq(pageResultsTable.url, url)));
    res.status(202).json({
      id: scanId,
      status: session.status,
      queued: true,
    });
    return;
  }

  const [newSession] = await db.insert(scanSessionsTable).values({
    name: `${session.name ?? `Scan #${scanId}`} (URL retry)`,
    projectId: session.projectId ?? null,
    status: "pending",
    totalUrls: 1,
    scannedUrls: 0,
    failedUrls: 0,
    totalIssues: 0,
    criticalIssues: 0,
    options: session.options ?? null,
    initiatorName: session.initiatorName ?? null,
    initiatorRole: session.initiatorRole ?? null,
  }).returning();

  await db.insert(pageResultsTable).values({
    scanId: newSession.id,
    url,
    status: "pending",
    issueCount: 0,
    criticalCount: 0,
  });

  startScan(newSession.id, [url], { ...(session.options as Record<string, unknown>), skipCompletedPages: true }).catch(err => {
    logger.error({ scanId: newSession.id, err }, "Background URL retry failed");
  });

  res.status(201).json({
    ...newSession,
    createdAt: newSession.createdAt.toISOString(),
    completedAt: null,
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
