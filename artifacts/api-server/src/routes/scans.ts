import { Router, type IRouter } from "express";
import multer from "multer";
import {
  db,
  pool,
  scanSessionsTable,
  pageResultsTable,
  accessibilityIssuesTable,
  projectsTable,
} from "@workspace/db";
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
import {
  startScan,
  cancelScan,
  pauseScan,
  resumeScan,
  isScanActive,
  queueRetryUrl,
  addUrlsToRunningScan,
} from "../lib/scanQueue";
import { fetchSitemapUrls, parseUrlsFromCsv } from "../lib/sitemap";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/authMiddleware";
import { getEffectivePermissions } from "../lib/permissions";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function getAuthUserId(req: any): string {
  return req.session?.user?.id?.toString() ?? "";
}

function isAdminUser(req: any): boolean {
  const role = req.session?.user?.role;
  return role === "super_admin" || role === "admin";
}

router.get("/scans", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  const adminUser = isAdminUser(req);
  const role = req.session?.user?.role ?? "user";

  let canViewAll = adminUser;
  if (!canViewAll) {
    const perms = await getEffectivePermissions(parseInt(userId, 10), role);
    canViewAll = perms.canViewAllScans;
  }

  const selectCols = {
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
    userId: scanSessionsTable.userId,
  };

  const currentUserFullName = req.session?.user?.fullName ?? "";

  const sessions = canViewAll
    ? await db
        .select(selectCols)
        .from(scanSessionsTable)
        .leftJoin(
          projectsTable,
          eq(scanSessionsTable.projectId, projectsTable.id),
        )
        .orderBy(desc(scanSessionsTable.createdAt))
        .limit(200)
    : await db
        .select(selectCols)
        .from(scanSessionsTable)
        .leftJoin(
          projectsTable,
          eq(scanSessionsTable.projectId, projectsTable.id),
        )
        .where(
          or(
            eq(scanSessionsTable.userId, userId),
            ...(currentUserFullName
              ? [eq(scanSessionsTable.initiatorName, currentUserFullName)]
              : []),
          ),
        )
        .orderBy(desc(scanSessionsTable.createdAt))
        .limit(100);

  res.json(
    sessions.map((s) => ({
      ...s,
      projectName: s.projectName ?? null,
      createdAt: s.createdAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
    })),
  );
});

router.post("/scans", requireAuth, async (req, res): Promise<void> => {
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

  const {
    urls,
    name,
    projectId,
    groupId,
    options,
    initiatorName,
    initiatorRole,
  } = parsed.data;

  if (!urls || urls.length === 0) {
    res.status(400).json({ error: "At least one URL is required" });
    return;
  }

  const validUrls = urls.filter((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  });

  if (validUrls.length === 0) {
    res.status(400).json({ error: "No valid URLs provided" });
    return;
  }

  const [session] = await db
    .insert(scanSessionsTable)
    .values({
      userId,
      name: name || null,
      projectId: projectId ?? null,
      groupId: groupId ?? null,
      initiatorName: initiatorName ?? null,
      initiatorRole: initiatorRole ?? null,
      status: "pending",
      totalUrls: validUrls.length,
      scannedUrls: 0,
      failedUrls: 0,
      totalIssues: 0,
      criticalIssues: 0,
      options: options ?? null,
    })
    .returning();

  await db.insert(pageResultsTable).values(
    validUrls.map((url) => ({
      scanId: session.id,
      url,
      status: "pending",
      issueCount: 0,
      criticalCount: 0,
    })),
  );

  // Start scan in background
  startScan(session.id, validUrls, options ?? {}).catch((err) => {
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

router.post(
  "/scans/upload-csv",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const content = req.file.buffer.toString("utf-8");
    const urls = parseUrlsFromCsv(content);

    res.json({ urls, count: urls.length });
  },
);

// ── Shared helper: build comparison data from two scan IDs ────────────────────
async function buildComparison(
  scan1Id: number,
  scan2Id: number,
  strip1?: string,
  strip2?: string,
) {
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
    db
      .select(selectSession)
      .from(scanSessionsTable)
      .leftJoin(
        projectsTable,
        eq(scanSessionsTable.projectId, projectsTable.id),
      )
      .where(eq(scanSessionsTable.id, scan1Id)),
    db
      .select(selectSession)
      .from(scanSessionsTable)
      .leftJoin(
        projectsTable,
        eq(scanSessionsTable.projectId, projectsTable.id),
      )
      .where(eq(scanSessionsTable.id, scan2Id)),
    db
      .select({
        id: pageResultsTable.id,
        url: pageResultsTable.url,
        status: pageResultsTable.status,
        issueCount: pageResultsTable.issueCount,
        criticalCount: pageResultsTable.criticalCount,
      })
      .from(pageResultsTable)
      .where(eq(pageResultsTable.scanId, scan1Id)),
    db
      .select({
        id: pageResultsTable.id,
        url: pageResultsTable.url,
        status: pageResultsTable.status,
        issueCount: pageResultsTable.issueCount,
        criticalCount: pageResultsTable.criticalCount,
      })
      .from(pageResultsTable)
      .where(eq(pageResultsTable.scanId, scan2Id)),
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
  const map1 = new Map(pages1raw.map((p) => [norm(p.url, strip1), p]));
  const map2 = new Map(pages2raw.map((p) => [norm(p.url, strip2), p]));

  const matchedNorm = [...map1.keys()].filter((u) => map2.has(u));
  const onlyInScan1 = pages1raw
    .filter((p) => !map2.has(norm(p.url, strip1)))
    .map((p) => p.url);
  const onlyInScan2 = pages2raw
    .filter((p) => !map1.has(norm(p.url, strip2)))
    .map((p) => p.url);

  const page1Ids = matchedNorm.map((u) => map1.get(u)!.id);
  const page2Ids = matchedNorm.map((u) => map2.get(u)!.id);

  const [issues1all, issues2all] = await Promise.all([
    page1Ids.length > 0
      ? db
          .select({
            pageId: accessibilityIssuesTable.pageId,
            ruleId: accessibilityIssuesTable.ruleId,
            impact: accessibilityIssuesTable.impact,
            description: accessibilityIssuesTable.description,
            selector: accessibilityIssuesTable.selector,
            wcagCriteria: accessibilityIssuesTable.wcagCriteria,
            wcagLevel: accessibilityIssuesTable.wcagLevel,
          })
          .from(accessibilityIssuesTable)
          .where(inArray(accessibilityIssuesTable.pageId, page1Ids))
      : Promise.resolve(
          [] as {
            pageId: number;
            ruleId: string;
            impact: string;
            description: string;
            selector: string | null;
            wcagCriteria: string | null;
            wcagLevel: string | null;
          }[],
        ),
    page2Ids.length > 0
      ? db
          .select({
            pageId: accessibilityIssuesTable.pageId,
            ruleId: accessibilityIssuesTable.ruleId,
            impact: accessibilityIssuesTable.impact,
            description: accessibilityIssuesTable.description,
            selector: accessibilityIssuesTable.selector,
            wcagCriteria: accessibilityIssuesTable.wcagCriteria,
            wcagLevel: accessibilityIssuesTable.wcagLevel,
          })
          .from(accessibilityIssuesTable)
          .where(inArray(accessibilityIssuesTable.pageId, page2Ids))
      : Promise.resolve(
          [] as {
            pageId: number;
            ruleId: string;
            impact: string;
            description: string;
            selector: string | null;
            wcagCriteria: string | null;
            wcagLevel: string | null;
          }[],
        ),
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

  const pages = matchedNorm.map((nu) => {
    const p1 = map1.get(nu)!;
    const p2 = map2.get(nu)!;
    const i1 = byPage1.get(p1.id) ?? [];
    const i2 = byPage2.get(p2.id) ?? [];
    const keys1 = new Set(i1.map(issueKey));
    const keys2 = new Set(i2.map(issueKey));
    const newIssues = i2.filter((i) => !keys1.has(issueKey(i)));
    const fixedIssues = i1.filter((i) => !keys2.has(issueKey(i)));
    const persistingIssues = i2.filter((i) => keys1.has(issueKey(i)));
    return {
      url: p1.url,
      scan1Page: {
        status: p1.status,
        issueCount: p1.issueCount,
        criticalCount: p1.criticalCount,
      },
      scan2Page: {
        status: p2.status,
        issueCount: p2.issueCount,
        criticalCount: p2.criticalCount,
      },
      newIssues: newIssues.map((i) => ({
        ruleId: i.ruleId,
        impact: i.impact,
        description: i.description,
        selector: i.selector,
        wcagCriteria: i.wcagCriteria,
        wcagLevel: i.wcagLevel,
      })),
      fixedIssues: fixedIssues.map((i) => ({
        ruleId: i.ruleId,
        impact: i.impact,
        description: i.description,
        selector: i.selector,
        wcagCriteria: i.wcagCriteria,
        wcagLevel: i.wcagLevel,
      })),
      persistingIssues: persistingIssues.map((i) => ({
        ruleId: i.ruleId,
        impact: i.impact,
        description: i.description,
        selector: i.selector,
        wcagCriteria: i.wcagCriteria,
        wcagLevel: i.wcagLevel,
      })),
    };
  });

  const totalNew = pages.reduce((s, p) => s + p.newIssues.length, 0);
  const totalFixed = pages.reduce((s, p) => s + p.fixedIssues.length, 0);
  const totalPersisting = pages.reduce(
    (s, p) => s + p.persistingIssues.length,
    0,
  );

  const fmtSession = (s: typeof row1) => ({
    id: s.id,
    projectId: s.projectId,
    projectName: s.projectName ?? null,
    name: s.name,
    initiatorName: s.initiatorName,
    initiatorRole: s.initiatorRole,
    status: s.status,
    totalUrls: s.totalUrls,
    scannedUrls: s.scannedUrls,
    failedUrls: s.failedUrls,
    totalIssues: s.totalIssues,
    criticalIssues: s.criticalIssues,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
  });

  return {
    scan1: fmtSession(row1),
    scan2: fmtSession(row2),
    summary: {
      pagesCompared: matchedNorm.length,
      pagesOnlyInScan1: onlyInScan1.length,
      pagesOnlyInScan2: onlyInScan2.length,
      totalNew,
      totalFixed,
      totalPersisting,
    },
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
    res
      .status(400)
      .json({ error: "scan1Id and scan2Id query params are required" });
    return;
  }
  const strip1 = (req.query.strip1 as string) || undefined;
  const strip2 = (req.query.strip2 as string) || undefined;
  const result = await buildComparison(scan1Id, scan2Id, strip1, strip2);
  if (!result) {
    res.status(404).json({ error: "One or both scans not found" });
    return;
  }
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
    res
      .status(400)
      .json({ error: "scan1Id and scan2Id query params are required" });
    return;
  }
  const strip1 = (req.query.strip1 as string) || undefined;
  const strip2 = (req.query.strip2 as string) || undefined;
  const result = await buildComparison(scan1Id, scan2Id, strip1, strip2);
  if (!result) {
    res.status(404).json({ error: "One or both scans not found" });
    return;
  }

  const escCsv = (v: string | null | undefined) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;

  const headerRow = [
    "URL",
    "Baseline Issues (A)",
    "Current Issues (B)",
    "New Issues",
    "Fixed Issues",
    "Persisting",
    "Net Change",
  ].join(",");
  const dataRows = result.pages.map((p) =>
    [
      p.url,
      p.scan1Page.issueCount,
      p.scan2Page.issueCount,
      p.newIssues.length,
      p.fixedIssues.length,
      p.persistingIssues.length,
      p.newIssues.length - p.fixedIssues.length,
    ].join(","),
  );

  // Issue detail rows
  const detailHeader = [
    "",
    "Type",
    "Rule ID",
    "Impact",
    "WCAG",
    "Selector",
    "Description",
  ].join(",");
  const detailRows: string[] = [];
  for (const p of result.pages) {
    if (
      p.newIssues.length + p.fixedIssues.length + p.persistingIssues.length ===
      0
    )
      continue;
    detailRows.push(escCsv(p.url));
    for (const i of p.newIssues)
      detailRows.push(
        [
          "",
          "NEW",
          escCsv(i.ruleId),
          escCsv(i.impact),
          escCsv(i.wcagCriteria),
          escCsv(i.selector),
          escCsv(i.description),
        ].join(","),
      );
    for (const i of p.fixedIssues)
      detailRows.push(
        [
          "",
          "FIXED",
          escCsv(i.ruleId),
          escCsv(i.impact),
          escCsv(i.wcagCriteria),
          escCsv(i.selector),
          escCsv(i.description),
        ].join(","),
      );
    for (const i of p.persistingIssues)
      detailRows.push(
        [
          "",
          "PERSISTING",
          escCsv(i.ruleId),
          escCsv(i.impact),
          escCsv(i.wcagCriteria),
          escCsv(i.selector),
          escCsv(i.description),
        ].join(","),
      );
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
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="comparison-scan${scan1Id}-vs-scan${scan2Id}.csv"`,
  );
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
  const pages = await db
    .select({
      id: pageResultsTable.id,
      scanId: pageResultsTable.scanId,
      url: pageResultsTable.url,
      status: pageResultsTable.status,
      issueCount: pageResultsTable.issueCount,
      criticalCount: pageResultsTable.criticalCount,
      errorMessage: pageResultsTable.errorMessage,
      scannedAt: pageResultsTable.scannedAt,
      loadDurationMs: pageResultsTable.loadDurationMs,
      scanDurationMs: pageResultsTable.scanDurationMs,
    })
    .from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, row.id));

  // Only load full issue details when the scan is finished.
  // During active scans (running / paused / pending) the live view doesn't
  // need issue details, so skip that expensive query entirely.
  const scanIsActive = ["running", "paused", "pending"].includes(row.status);

  type IssueRow = typeof accessibilityIssuesTable.$inferSelect;
  const issuesByPageId = new Map<number, IssueRow[]>();

  if (!scanIsActive && pages.length > 0) {
    const allIssues = await db
      .select()
      .from(accessibilityIssuesTable)
      .where(
        inArray(
          accessibilityIssuesTable.pageId,
          pages.map((p) => p.id),
        ),
      );

    for (const issue of allIssues) {
      const list = issuesByPageId.get(issue.pageId) ?? [];
      list.push(issue);
      issuesByPageId.set(issue.pageId, list);
    }
  }

  const pagesWithIssues = pages.map((page) => ({
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
  const role = req.session?.user?.role ?? "user";
  const perms = await getEffectivePermissions(parseInt(userId, 10), role);
  if (!perms.canEditScan) {
    res.status(403).json({ error: "You don't have permission to edit scans" });
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
  const isSuperAdmin = role === "super_admin";
  const { name, initiatorName, initiatorRole } = parsed.data;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  // Only super_admin can change initiator metadata
  if (isSuperAdmin) {
    if (initiatorName !== undefined) updates.initiatorName = initiatorName;
    if (initiatorRole !== undefined) updates.initiatorRole = initiatorRole;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [updated] = await db
    .update(scanSessionsTable)
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
  const role = req.session?.user?.role ?? "user";
  const perms = await getEffectivePermissions(parseInt(userId, 10), role);
  if (!perms.canDeleteScan) {
    res
      .status(403)
      .json({ error: "You don't have permission to delete scans" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteScanParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  cancelScan(params.data.id);

  const [deleted] = await db
    .delete(scanSessionsTable)
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

  const scanId = params.data.id;

  const [session] = await db
    .select({
      id: scanSessionsTable.id,
      status: scanSessionsTable.status,
      initiatorName: scanSessionsTable.initiatorName,
      initiatorRole: scanSessionsTable.initiatorRole,
      totalUrls: scanSessionsTable.totalUrls,
      scannedUrls: scanSessionsTable.scannedUrls,
      failedUrls: scanSessionsTable.failedUrls,
    })
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, scanId));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  // Use SQL GROUP BY to get counts per status — vastly cheaper than loading
  // all rows into Node.js, especially on large scans (thousands of pages).
  const countResult = await pool.query<{
    status: string;
    cnt: string;
    issues: string;
    critical: string;
  }>(
    `SELECT status,
            COUNT(*)::text            AS cnt,
            SUM(issue_count)::text    AS issues,
            SUM(critical_count)::text AS critical
     FROM page_results WHERE scan_id = $1 GROUP BY status`,
    [scanId],
  );

  const counts: Record<string, number> = {};
  for (const row of countResult.rows) {
    counts[row.status] = parseInt(row.cnt, 10);
  }

  // Count completed pages that have at least one issue — single cheap query
  const pagesWithIssuesResult = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM page_results WHERE scan_id = $1 AND status = 'completed' AND issue_count > 0`,
    [scanId],
  );
  const pagesWithIssues = parseInt(
    pagesWithIssuesResult.rows[0]?.cnt || "0",
    10,
  );

  // Only load individual rows for non-completed pages (active, pending, failed, requeued).
  // Completed pages may number in the thousands — they don't need to be in the live feed.
  const NON_COMPLETED = [
    "navigating",
    "rendering",
    "analyzing",
    "saving",
    "scanning",
    "pending",
    "failed",
    "requeued",
    "not_available",
  ] as const;

  const pageFields = {
    url: pageResultsTable.url,
    status: pageResultsTable.status,
    issueCount: pageResultsTable.issueCount,
    criticalCount: pageResultsTable.criticalCount,
    errorMessage: pageResultsTable.errorMessage,
    loadDurationMs: pageResultsTable.loadDurationMs,
    scanDurationMs: pageResultsTable.scanDurationMs,
    scannedAt: pageResultsTable.scannedAt,
  } as const;

  const [activePages, recentlyCompleted] = await Promise.all([
    db
      .select(pageFields)
      .from(pageResultsTable)
      .where(
        and(
          eq(pageResultsTable.scanId, scanId),
          inArray(pageResultsTable.status, [...NON_COMPLETED]),
        ),
      )
      .limit(500),
    // Also fetch the 30 most-recently completed pages so timing shows up
    // in the live table as pages finish, without loading thousands of rows.
    db
      .select(pageFields)
      .from(pageResultsTable)
      .where(
        and(
          eq(pageResultsTable.scanId, scanId),
          eq(pageResultsTable.status, "completed"),
        ),
      )
      .orderBy(desc(pageResultsTable.scannedAt))
      .limit(30),
  ]);

  const ACTIVE_STAGES = new Set([
    "scanning",
    "navigating",
    "rendering",
    "analyzing",
    "saving",
  ]);
  const currentUrl =
    activePages.find((p) => ACTIVE_STAGES.has(p.status))?.url ?? null;

  // Merge: active/failed pages first (no timing yet), then recently completed (have timing)
  const allLivePages = [...activePages, ...recentlyCompleted];

  res.json({
    id: session.id,
    status: session.status,
    initiatorName: session.initiatorName ?? null,
    initiatorRole: session.initiatorRole ?? null,
    totalUrls: session.totalUrls,
    scannedUrls: session.scannedUrls,
    failedUrls: session.failedUrls,
    currentUrl,
    counts,
    pagesWithIssues,
    pages: allLivePages.map((p) => ({
      url: p.url,
      status: p.status,
      issueCount: p.issueCount,
      criticalCount: p.criticalCount,
      errorMessage: p.errorMessage ?? null,
      loadDurationMs: p.loadDurationMs ?? null,
      scanDurationMs: p.scanDurationMs ?? null,
    })),
  });
});

/**
 * POST /api/scans/:id/add-urls
 * Inject additional URLs into a running, paused, or pending scan.
 * Body: { urls: string[] }
 */
router.post(
  "/scans/:id/add-urls",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const role = req.session?.user?.role ?? "user";
    const perms = await getEffectivePermissions(parseInt(userId, 10), role);
    if (!perms.canManageScan) {
      res
        .status(403)
        .json({ error: "You don't have permission to modify scans" });
      return;
    }

    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const scanId = parseInt(raw, 10);
    if (isNaN(scanId)) {
      res.status(400).json({ error: "Invalid scan ID" });
      return;
    }

    const { urls } = req.body as { urls?: unknown };
    if (!Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({ error: "urls must be a non-empty array" });
      return;
    }

    const validUrls = (urls as unknown[])
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .map((u) => u.trim())
      .filter((u) => {
        try {
          new URL(u);
          return true;
        } catch {
          return false;
        }
      });

    if (validUrls.length === 0) {
      res.status(400).json({ error: "No valid URLs provided" });
      return;
    }

    const [session] = await db
      .select({
        status: scanSessionsTable.status,
        options: scanSessionsTable.options,
      })
      .from(scanSessionsTable)
      .where(eq(scanSessionsTable.id, scanId));

    if (!session) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    if (!["running", "paused", "pending"].includes(session.status)) {
      res.status(409).json({
        error: `Can only add URLs to a running, paused, or pending scan (current status: ${session.status})`,
      });
      return;
    }

    const result = await addUrlsToRunningScan(scanId, validUrls);
    res.json({ ...result, total: validUrls.length });
  },
);

router.post("/scans/:id/cancel", async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const role = req.session?.user?.role ?? "user";
  const perms = await getEffectivePermissions(parseInt(userId, 10), role);
  if (!perms.canManageScan) {
    res
      .status(403)
      .json({ error: "You don't have permission to cancel scans" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CancelScanParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  cancelScan(params.data.id);

  await db
    .update(scanSessionsTable)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(scanSessionsTable.id, params.data.id));

  const [updated] = await db
    .select()
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
  const role = req.session?.user?.role ?? "user";
  const perms = await getEffectivePermissions(parseInt(userId, 10), role);
  if (!perms.canManageScan) {
    res.status(403).json({ error: "You don't have permission to pause scans" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const scanId = parseInt(raw, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db
    .select()
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

  await db
    .update(scanSessionsTable)
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
  const role = req.session?.user?.role ?? "user";
  const perms = await getEffectivePermissions(parseInt(userId, 10), role);
  if (!perms.canManageScan) {
    res
      .status(403)
      .json({ error: "You don't have permission to resume scans" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const scanId = parseInt(raw, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db
    .select()
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
    // Live worker exists — reset any pages that got stuck mid-flight while
    // the scan was paused, then signal the worker to continue.
    const MID_FLIGHT = [
      "navigating",
      "scanning",
      "rendering",
      "analyzing",
      "saving",
    ] as const;
    const stuckRows = await db
      .select({ url: pageResultsTable.url })
      .from(pageResultsTable)
      .where(
        and(
          eq(pageResultsTable.scanId, scanId),
          inArray(pageResultsTable.status, [...MID_FLIGHT]),
        ),
      );

    if (stuckRows.length > 0) {
      await db
        .update(pageResultsTable)
        .set({ status: "pending" })
        .where(
          and(
            eq(pageResultsTable.scanId, scanId),
            inArray(pageResultsTable.status, [...MID_FLIGHT]),
          ),
        );
      // Re-queue them into Phase 2 so they're retried before Phase 3 runs.
      for (const row of stuckRows) {
        queueRetryUrl(scanId, row.url);
      }
      req.log.info(
        { scanId, count: stuckRows.length },
        "Reset stuck mid-flight pages on resume",
      );
    }

    resumeScan(scanId);
    await db
      .update(scanSessionsTable)
      .set({ status: "running" })
      .where(eq(scanSessionsTable.id, scanId));
  } else {
    // Zombie scan: server was restarted while the scan was running.
    // Reset any pages that were mid-flight back to "pending" so they get re-scanned.
    await db
      .update(pageResultsTable)
      .set({ status: "pending" })
      .where(
        and(
          eq(pageResultsTable.scanId, scanId),
          inArray(pageResultsTable.status, [
            "navigating",
            "scanning",
            "saving",
          ]),
        ),
      );

    const remainingPages = await db
      .select({ url: pageResultsTable.url })
      .from(pageResultsTable)
      .where(
        and(
          eq(pageResultsTable.scanId, scanId),
          inArray(pageResultsTable.status, ["pending", "requeued"]),
        ),
      );

    if (remainingPages.length === 0) {
      // Nothing left to scan — mark as completed
      await db
        .update(scanSessionsTable)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(scanSessionsTable.id, scanId));
      res.json({ id: scanId, status: "completed" });
      return;
    }

    await db
      .update(scanSessionsTable)
      .set({ status: "running" })
      .where(eq(scanSessionsTable.id, scanId));

    const urls = remainingPages.map((p) => p.url);
    startScan(scanId, urls, {
      ...((session.options as Record<string, unknown>) ?? {}),
      skipCompletedPages: true,
    }).catch((err) => {
      logger.error({ scanId, err }, "Zombie scan restart failed");
    });

    logger.info(
      { scanId, urlCount: urls.length },
      "Restarted zombie scan worker",
    );
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
  const role = req.session?.user?.role ?? "user";
  const perms = await getEffectivePermissions(parseInt(userId, 10), role);
  if (!perms.canManageScan) {
    res.status(403).json({ error: "You don't have permission to retry scans" });
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

  // Fetch ONLY metadata columns — never load screenshot/pageHtml into Node.js memory
  const originalPages = await db
    .select({
      id: pageResultsTable.id,
      url: pageResultsTable.url,
      status: pageResultsTable.status,
      issueCount: pageResultsTable.issueCount,
      criticalCount: pageResultsTable.criticalCount,
      scannedAt: pageResultsTable.scannedAt,
    })
    .from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, originalId));

  if (originalPages.length === 0) {
    res.status(400).json({ error: "Original scan has no pages to retry" });
    return;
  }

  // Compute retry name (strip old suffix, append "(retry N)")
  const customName =
    typeof req.body?.name === "string" ? req.body.name.trim() : null;
  let retryName: string | null = null;
  if (customName) {
    retryName = customName;
  } else if (original.name) {
    const base = original.name
      .replace(/\s*\(retry(?:\s+\d+|failed)?\)/gi, "")
      .trim();
    const m = original.name.match(/\(retry\s+(\d+)\)/i);
    const n = m ? parseInt(m[1]) + 1 : 1;
    retryName = `${base} (retry ${n})`;
  }

  // Deduplicate: keep only the best-status row per URL.
  // Priority: completed > not_available > failed > (anything else/pending)
  const statusPriority = (s: string) =>
    s === "completed" ? 3 : s === "not_available" ? 2 : s === "failed" ? 1 : 0;

  const bestByUrl = new Map<string, (typeof originalPages)[number]>();
  for (const p of originalPages) {
    const existing = bestByUrl.get(p.url);
    if (
      !existing ||
      statusPriority(p.status) > statusPriority(existing.status)
    ) {
      bestByUrl.set(p.url, p);
    }
  }
  const dedupedPages = Array.from(bestByUrl.values());

  const completedPages = dedupedPages.filter((p) => p.status === "completed");
  const pendingPages = dedupedPages.filter((p) => p.status !== "completed");

  // Compute totals for the pre-populated completed pages
  const preScanned = completedPages.length;
  const preTotalIssues = completedPages.reduce(
    (s, p) => s + (p.issueCount ?? 0),
    0,
  );
  const preCriticalIssues = completedPages.reduce(
    (s, p) => s + (p.criticalCount ?? 0),
    0,
  );

  const opts = (original.options ?? {}) as Record<string, unknown>;

  // Create new scan session (carries over project association and initiator)
  const [newSession] = await db
    .insert(scanSessionsTable)
    .values({
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
    })
    .returning();

  // Copy completed pages directly inside the DB (INSERT...SELECT) — screenshot/pageHtml
  // never pass through Node.js memory, preventing OOM on large scans.
  const completedPageIds = completedPages.map((p) => p.id);
  if (completedPageIds.length > 0) {
    await pool.query(
      `INSERT INTO page_results (scan_id, url, status, issue_count, critical_count, error_message, scanned_at, screenshot, page_html)
       SELECT $1, url, 'completed', issue_count, critical_count, NULL, scanned_at, screenshot, page_html
       FROM page_results
       WHERE id = ANY($2)`,
      [newSession.id, completedPageIds],
    );
  }

  // Insert pending pages (no large data to copy)
  if (pendingPages.length > 0) {
    await db.insert(pageResultsTable).values(
      pendingPages.map((p) => ({
        scanId: newSession.id,
        url: p.url,
        status: "pending" as const,
        issueCount: 0,
        criticalCount: 0,
      })),
    );
  }

  // Start scanning only the pages that need re-scanning
  const urlsToScan = pendingPages.map((p) => p.url);
  if (urlsToScan.length > 0) {
    startScan(newSession.id, urlsToScan, {
      ...(opts as Parameters<typeof startScan>[2]),
      skipCompletedPages: true,
    }).catch((err) => {
      logger.error(
        { scanId: newSession.id, err },
        "Background retry scan failed",
      );
    });
  }

  // Respond immediately
  res.status(201).json({
    ...newSession,
    createdAt: newSession.createdAt.toISOString(),
    completedAt: newSession.completedAt?.toISOString() ?? null,
  });

  // Copy issues in the background using INSERT...SELECT with a URL-based join —
  // all data stays inside the DB, no large arrays loaded into Node.js memory.
  if (completedPageIds.length > 0) {
    (async () => {
      try {
        await pool.query(
          `INSERT INTO accessibility_issues
             (page_id, rule_id, impact, description, element, wcag_criteria, wcag_level,
              legal_text, selector, remediation, bbox_x, bbox_y, bbox_width, bbox_height,
              false_positive, false_positive_note)
           SELECT new_pr.id, ai.rule_id, ai.impact, ai.description, ai.element,
                  ai.wcag_criteria, ai.wcag_level, ai.legal_text, ai.selector, ai.remediation,
                  ai.bbox_x, ai.bbox_y, ai.bbox_width, ai.bbox_height,
                  ai.false_positive, ai.false_positive_note
           FROM accessibility_issues ai
           JOIN page_results orig_pr ON orig_pr.id = ai.page_id
           JOIN page_results new_pr  ON new_pr.scan_id = $1 AND new_pr.url = orig_pr.url
           WHERE orig_pr.id = ANY($2)`,
          [newSession.id, completedPageIds],
        );
        logger.info(
          { scanId: newSession.id },
          "Retry: background issue copy complete",
        );
      } catch (err) {
        logger.error(
          { scanId: newSession.id, err },
          "Retry: background issue copy failed",
        );
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

  const [session] = await db
    .select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, scanId));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const [page] = await db
    .select()
    .from(pageResultsTable)
    .where(
      and(eq(pageResultsTable.scanId, scanId), eq(pageResultsTable.url, url)),
    );

  if (!page) {
    res.status(404).json({ error: "Page not found in scan" });
    return;
  }

  if (
    page.status !== "failed" &&
    page.status !== "pending" &&
    page.status !== "requeued"
  ) {
    res
      .status(409)
      .json({ error: "Only failed or pending URLs can be retried" });
    return;
  }

  if (
    session.status === "running" ||
    session.status === "paused" ||
    session.status === "pending"
  ) {
    const queued = queueRetryUrl(scanId, url);
    if (!queued) {
      res.status(409).json({ error: "Scan is not running" });
      return;
    }
    await db
      .update(pageResultsTable)
      .set({
        status: "requeued",
        errorMessage: null,
        scannedAt: null,
        issueCount: 0,
        criticalCount: 0,
      })
      .where(
        and(eq(pageResultsTable.scanId, scanId), eq(pageResultsTable.url, url)),
      );
    res.status(202).json({
      id: scanId,
      status: session.status,
      queued: true,
    });
    return;
  }

  const [newSession] = await db
    .insert(scanSessionsTable)
    .values({
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
    })
    .returning();

  await db.insert(pageResultsTable).values({
    scanId: newSession.id,
    url,
    status: "pending",
    issueCount: 0,
    criticalCount: 0,
  });

  startScan(newSession.id, [url], {
    ...(session.options as Record<string, unknown>),
    skipCompletedPages: true,
  }).catch((err) => {
    logger.error({ scanId: newSession.id, err }, "Background URL retry failed");
  });

  res.status(201).json({
    ...newSession,
    createdAt: newSession.createdAt.toISOString(),
    completedAt: null,
  });
});

// ── Server-side export (CSV / Excel) ─────────────────────────────────────────
// Uses a single LEFT JOIN query — no huge JSON roundtrip to the browser.
router.get(
  "/scans/:id/export",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const scanId = parseInt(raw, 10);
    if (isNaN(scanId)) {
      res.status(400).json({ error: "Invalid scan ID" });
      return;
    }

    const format = (req.query.format as string | undefined) ?? "csv";
    if (!["csv", "excel", "json"].includes(format)) {
      res.status(400).json({ error: "format must be csv, excel, or json" });
      return;
    }

    const [session] = await db
      .select({
        id: scanSessionsTable.id,
        name: scanSessionsTable.name,
        options: scanSessionsTable.options,
      })
      .from(scanSessionsTable)
      .where(eq(scanSessionsTable.id, scanId));

    if (!session) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    const scanName = session.name || `Scan #${session.id}`;
    const opts = session.options as Record<string, unknown> | null;
    const selectedRules: string[] = Array.isArray(opts?.rules)
      ? (opts!.rules as string[])
      : [];
    const rulesLabel =
      selectedRules.length === 0 ? "All rules" : selectedRules.join(", ");

    // Single LEFT JOIN: one row per issue, or one null-issue row per page with no issues.
    const joined = await db
      .select({
        url: pageResultsTable.url,
        ruleId: accessibilityIssuesTable.ruleId,
        impact: accessibilityIssuesTable.impact,
        description: accessibilityIssuesTable.description,
        wcagCriteria: accessibilityIssuesTable.wcagCriteria,
        wcagLevel: accessibilityIssuesTable.wcagLevel,
        legalText: accessibilityIssuesTable.legalText,
        selector: accessibilityIssuesTable.selector,
        element: accessibilityIssuesTable.element,
        remediation: accessibilityIssuesTable.remediation,
      })
      .from(pageResultsTable)
      .leftJoin(
        accessibilityIssuesTable,
        eq(accessibilityIssuesTable.pageId, pageResultsTable.id),
      )
      .where(eq(pageResultsTable.scanId, scanId))
      .orderBy(pageResultsTable.url);

    type ExportRow = {
      scanName: string;
      selectedRules: string;
      url: string;
      ruleId: string;
      ruleLabel: string;
      description: string;
      impact: string;
      wcagCriteria: string;
      wcagLevel: string;
      legalText: string;
      selector: string;
      element: string;
      remediation: string;
    };

    const rows: ExportRow[] = joined.map((r) => ({
      scanName,
      selectedRules: rulesLabel,
      url: r.url,
      ruleId: r.ruleId ?? rulesLabel,
      ruleLabel: r.ruleId ? r.ruleId : "No issues",
      description: r.ruleId
        ? (r.description ?? "")
        : "No accessibility issues found",
      impact: r.impact ?? "",
      wcagCriteria: r.wcagCriteria ?? "",
      wcagLevel: r.wcagLevel ?? "",
      legalText: r.legalText ?? "",
      selector: r.selector ?? "",
      element: r.element ?? "",
      remediation: r.remediation ?? "",
    }));

    const safeLabel = scanName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

    if (format === "json") {
      res.json({ scanName, selectedRules: rulesLabel, rows });
      return;
    }

    if (format === "csv") {
      const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = [
        "Scan Name",
        "Selected Rules",
        "Page URL",
        "Rule ID",
        "Rule Label",
        "Description",
        "Impact",
        "WCAG Criterion",
        "WCAG Level",
        "Compliance",
        "CSS Selector",
        "Element HTML",
        "Remediation",
      ];
      const lines = [
        header.map(escape).join(","),
        ...rows.map((r) =>
          [
            r.scanName,
            r.selectedRules,
            r.url,
            r.ruleId,
            r.ruleLabel,
            r.description,
            r.impact,
            r.wcagCriteria,
            r.wcagLevel,
            r.legalText,
            r.selector,
            r.element,
            r.remediation,
          ]
            .map(escape)
            .join(","),
        ),
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeLabel}-a11y-report.csv"`,
      );
      res.send(lines.join("\n"));
      return;
    }

    if (format === "excel") {
      const XLSX = await import("xlsx");
      const sheetData = rows.map((r) => ({
        "Scan Name": r.scanName,
        "Selected Rules": r.selectedRules,
        "Page URL": r.url,
        "Rule ID": r.ruleId,
        "Rule Label": r.ruleLabel,
        Description: r.description,
        Impact: r.impact,
        "WCAG Criterion": r.wcagCriteria,
        "WCAG Level": r.wcagLevel,
        Compliance: r.legalText,
        "CSS Selector": r.selector,
        "Element HTML": r.element,
        Remediation: r.remediation,
      }));
      const ws = XLSX.utils.json_to_sheet(sheetData);
      ws["!cols"] = [
        { wch: 40 },
        { wch: 20 },
        { wch: 60 },
        { wch: 12 },
        { wch: 12 },
        { wch: 50 },
        { wch: 12 },
        { wch: 16 },
        { wch: 10 },
        { wch: 30 },
        { wch: 40 },
        { wch: 60 },
        { wch: 50 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Issues");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeLabel}-a11y-report.xlsx"`,
      );
      res.send(buf);
      return;
    }
  },
);

router.get("/scans/:id/report", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetScanReportParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(scanSessionsTable)
    .where(eq(scanSessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  // All aggregations done in SQL — never load full page/issue rows into Node.js.
  // Scan #178 has 11762 pages; loading everything caused OOM crashes.
  const [impactResult, wcagResult, rulesResult, topPagesResult] =
    await Promise.all([
      pool.query<{ impact: string; cnt: string }>(
        `SELECT ai.impact, COUNT(*)::text AS cnt
         FROM accessibility_issues ai
         JOIN page_results pr ON pr.id = ai.page_id
         WHERE pr.scan_id = $1
         GROUP BY ai.impact`,
        [params.data.id],
      ),
      pool.query<{ wcag_level: string; cnt: string }>(
        `SELECT ai.wcag_level, COUNT(*)::text AS cnt
         FROM accessibility_issues ai
         JOIN page_results pr ON pr.id = ai.page_id
         WHERE pr.scan_id = $1
         GROUP BY ai.wcag_level`,
        [params.data.id],
      ),
      pool.query<{ rule_id: string; description: string; cnt: string }>(
        `SELECT ai.rule_id, ai.description, COUNT(*)::text AS cnt
         FROM accessibility_issues ai
         JOIN page_results pr ON pr.id = ai.page_id
         WHERE pr.scan_id = $1
         GROUP BY ai.rule_id, ai.description
         ORDER BY cnt::int DESC
         LIMIT 10`,
        [params.data.id],
      ),
      pool.query<{ url: string; issue_count: string; critical_count: string }>(
        `SELECT url, issue_count::text, critical_count::text
         FROM page_results
         WHERE scan_id = $1 AND status = 'completed'
         ORDER BY issue_count DESC
         LIMIT 10`,
        [params.data.id],
      ),
    ]);

  const issuesByImpact = {
    critical: parseInt(impactResult.rows.find((r) => r.impact === "critical")?.cnt ?? "0", 10),
    serious:  parseInt(impactResult.rows.find((r) => r.impact === "serious")?.cnt ?? "0", 10),
    moderate: parseInt(impactResult.rows.find((r) => r.impact === "moderate")?.cnt ?? "0", 10),
    minor:    parseInt(impactResult.rows.find((r) => r.impact === "minor")?.cnt ?? "0", 10),
  };

  const issuesByWcagLevel = {
    A:   parseInt(wcagResult.rows.find((r) => r.wcag_level === "A")?.cnt ?? "0", 10),
    AA:  parseInt(wcagResult.rows.find((r) => r.wcag_level === "AA")?.cnt ?? "0", 10),
    AAA: parseInt(wcagResult.rows.find((r) => r.wcag_level === "AAA")?.cnt ?? "0", 10),
  };

  const topRules = rulesResult.rows.map((r) => ({
    ruleId: r.rule_id,
    description: r.description,
    count: parseInt(r.cnt, 10),
  }));

  const pagesWithMostIssues = topPagesResult.rows.map((r) => ({
    url: r.url,
    issueCount: parseInt(r.issue_count, 10),
    criticalCount: parseInt(r.critical_count, 10),
  }));

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
    res.status(502).json({
      error: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// ── Smart Analysis ───────────────────────────────────────────────────────────

/** Extract the AEM component block name from a single selector part's classes.
 *  BEM convention: cmp-navigation__item-link → block is "cmp-navigation"
 *  Plain:          cmp-teaser               → block is "cmp-teaser"
 */
function cmpFromSelectorPart(part: string): string | null {
  // BEM element/modifier suffix — extract block only
  const bem = part.match(/\bcmp-([\w-]+?)__/);
  if (bem) return `cmp-${bem[1]}`;
  // Plain cmp- class (no BEM suffix)
  const plain = part.match(/\bcmp-([\w-]+)/);
  if (plain) return `cmp-${plain[1]}`;
  return null;
}

/** Build a short readable label from a CSS selector part, e.g. "ul.nav-list" or "li". */
function selectorPartLabel(part: string): string {
  // strip pseudo-classes/attributes
  const clean = part
    .replace(/::?[\w-]+(\([^)]*\))?/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .trim();
  const tagMatch = clean.match(/^([\w-]+)/);
  const tag = tagMatch ? tagMatch[1] : "div";
  // prefer first class
  const cls = clean.match(/\.([\w-]+)/);
  if (cls) return `${tag}.${cls[1]}`;
  // or id
  const id = clean.match(/#([\w-]+)/);
  if (id) return `${tag}#${id[1]}`;
  return tag;
}

function extractAemComponent(
  element: string | null,
  selector: string | null,
): { name: string; tag: string; hierarchy: string } {
  const tagMatch = element?.match(/^<(\w+)/i);
  const tag = tagMatch ? tagMatch[1].toLowerCase() : "unknown";

  // ── helper: build ancestor context from selector for a given component name ──
  const ancestorContext = (componentName: string): string => {
    if (!selector) return componentName;
    const parts = selector.split(/\s*>\s*/);
    const ancestorCmps: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      const cmp = cmpFromSelectorPart(parts[i]);
      if (cmp && !ancestorCmps.includes(cmp) && cmp !== componentName)
        ancestorCmps.push(cmp);
    }
    return ancestorCmps.length > 0
      ? `${ancestorCmps.join(" > ")} > ${componentName}`
      : componentName;
  };

  // Priority 1: explicit AEM data attributes on the element HTML itself
  if (element) {
    const cmpIs = element.match(/data-cmp-is=["']([^"']+)["']/);
    if (cmpIs) {
      const h = ancestorContext(cmpIs[1]);
      return { name: cmpIs[1], tag, hierarchy: h };
    }

    const dataComp = element.match(/data-component=["']([^"']+)["']/);
    if (dataComp) {
      const h = ancestorContext(dataComp[1]);
      return { name: dataComp[1], tag, hierarchy: h };
    }

    const dataModule = element.match(/data-module=["']([^"']+)["']/);
    if (dataModule) {
      const h = ancestorContext(dataModule[1]);
      return { name: dataModule[1], tag, hierarchy: h };
    }
  }

  // Priority 2: walk the full selector right-to-left (element → ancestors) for cmp- classes
  if (selector) {
    const parts = selector.split(/\s*>\s*/);
    const cmpLevels: string[] = [];

    for (let i = parts.length - 1; i >= 0; i--) {
      const cmp = cmpFromSelectorPart(parts[i]);
      if (cmp && !cmpLevels.includes(cmp)) cmpLevels.push(cmp);
    }

    if (cmpLevels.length > 0) {
      // cmpLevels[0] = nearest, last = outermost (absolute parent) — reverse for display
      const outermost = cmpLevels[cmpLevels.length - 1];
      const hierarchy = [...cmpLevels].reverse().join(" > ");
      return { name: outermost, tag, hierarchy: `${hierarchy} > <${tag}>` };
    }

    // Priority 3: no AEM components found — use outermost meaningful ancestor as name
    const SKIP_TAGS = new Set([
      "html",
      "body",
      "main",
      "div",
      "span",
      "section",
      "article",
      "aside",
      "header",
      "footer",
    ]);
    const meaningfulParts = parts.slice(0, -1).filter((p) => {
      const lbl = selectorPartLabel(p);
      return /[.#]/.test(lbl) || !SKIP_TAGS.has(lbl.split(".")[0]);
    });
    // Use outermost 6 meaningful ancestors; fall back to first 4 selector parts
    const ancestorParts =
      meaningfulParts.length > 0
        ? meaningfulParts.slice(0, 6)
        : parts.slice(0, Math.min(4, parts.length - 1));

    const ancestorLabels = ancestorParts.map((p) => selectorPartLabel(p));
    const hierStr = [...ancestorLabels, `<${tag}>`].join(" > ");
    // Absolute parent = outermost = first in ancestor list
    const name = ancestorLabels.length > 0 ? ancestorLabels[0] : `<${tag}>`;
    return { name, tag, hierarchy: hierStr };
  }

  // Priority 4: final fallback
  return { name: `<${tag}>`, tag, hierarchy: `<${tag}>` };
}

router.get(
  "/scans/:id/smart-analysis",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const scanId = parseInt(raw, 10);
    if (isNaN(scanId)) {
      res.status(400).json({ error: "Invalid scan ID" });
      return;
    }

    const [session] = await db
      .select({ id: scanSessionsTable.id })
      .from(scanSessionsTable)
      .where(eq(scanSessionsTable.id, scanId));
    if (!session) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    const rows = await db
      .select({
        ruleId: accessibilityIssuesTable.ruleId,
        impact: accessibilityIssuesTable.impact,
        element: accessibilityIssuesTable.element,
        selector: accessibilityIssuesTable.selector,
        description: accessibilityIssuesTable.description,
        pageUrl: pageResultsTable.url,
      })
      .from(accessibilityIssuesTable)
      .innerJoin(
        pageResultsTable,
        eq(accessibilityIssuesTable.pageId, pageResultsTable.id),
      )
      .where(
        and(
          eq(pageResultsTable.scanId, scanId),
          eq(accessibilityIssuesTable.falsePositive, false),
        ),
      );

    const IMPACT_ORDER: Record<string, number> = {
      critical: 0,
      serious: 1,
      moderate: 2,
      minor: 3,
    };

    type Entry = {
      componentName: string;
      tag: string;
      hierarchy: string;
      ruleIds: Set<string>;
      impacts: Set<string>;
      totalOccurrences: number;
      affectedPages: Set<string>;
      /** description text → set of page URLs that have this exact issue */
      issueVariants: Map<string, Set<string>>;
      /** First element HTML seen for this component — for AI fix panel */
      sampleElement: string | null;
      /** First CSS selector seen for this component — for AI fix panel */
      sampleSelector: string | null;
      /** First rule ID seen — for AI fix panel */
      sampleRuleId: string;
      /** First description seen — for AI fix panel */
      sampleDescription: string;
    };

    const map = new Map<string, Entry>();

    for (const row of rows) {
      const { name, tag, hierarchy } = extractAemComponent(
        row.element,
        row.selector,
      );
      const key = `${name}::${tag}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          componentName: name,
          tag,
          hierarchy,
          ruleIds: new Set(),
          impacts: new Set(),
          totalOccurrences: 0,
          affectedPages: new Set(),
          issueVariants: new Map(),
          sampleElement: row.element ?? null,
          sampleSelector: row.selector ?? null,
          sampleRuleId: row.ruleId,
          sampleDescription: row.description ?? "",
        };
        map.set(key, entry);
      }
      entry.ruleIds.add(row.ruleId);
      entry.impacts.add(row.impact);
      entry.totalOccurrences++;
      entry.affectedPages.add(row.pageUrl);

      // Track pages per unique issue description (cap at 50 unique descriptions)
      {
        const descKey = row.description || `[${row.ruleId}]`;
        let pages = entry.issueVariants.get(descKey);
        if (!pages) {
          if (entry.issueVariants.size < 50) {
            pages = new Set();
            entry.issueVariants.set(descKey, pages);
          }
        }
        pages?.add(row.pageUrl);
      }
    }

    const components = [...map.values()]
      .map((e) => {
        // Sort issue variants by number of affected pages desc, cap at 30
        const issueVariants = [...e.issueVariants.entries()]
          .map(([description, pages]) => ({
            description,
            occurrences: pages.size,
            pages: [...pages].slice(0, 50),
          }))
          .sort((a, b) => b.occurrences - a.occurrences)
          .slice(0, 30);

        return {
          componentName: e.componentName,
          tag: e.tag,
          hierarchy: e.hierarchy,
          ruleIds: [...e.ruleIds].sort(),
          worstImpact:
            [...e.impacts].sort(
              (a, b) => (IMPACT_ORDER[a] ?? 9) - (IMPACT_ORDER[b] ?? 9),
            )[0] ?? "minor",
          totalOccurrences: e.totalOccurrences,
          affectedPageCount: e.affectedPages.size,
          topPages: [...e.affectedPages].slice(0, 20),
          issueVariants,
        };
      })
      .sort((a, b) => b.totalOccurrences - a.totalOccurrences);

    res.json({
      scanId,
      totalIssues: rows.length,
      totalComponents: components.length,
      components,
    });
  },
);

// ── Smart Analysis — per-page occurrences for code view ──────────────────────
router.get(
  "/scans/:id/smart-analysis/page-occurrences",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const scanId = parseInt(raw, 10);
    if (isNaN(scanId)) {
      res.status(400).json({ error: "Invalid scan ID" });
      return;
    }

    const componentName =
      typeof req.query.componentName === "string"
        ? req.query.componentName
        : null;
    const pageUrl =
      typeof req.query.pageUrl === "string" ? req.query.pageUrl : null;
    if (!componentName || !pageUrl) {
      res.status(400).json({ error: "componentName and pageUrl are required" });
      return;
    }

    const rows = await db
      .select({
        id: accessibilityIssuesTable.id,
        pageId: accessibilityIssuesTable.pageId,
        ruleId: accessibilityIssuesTable.ruleId,
        impact: accessibilityIssuesTable.impact,
        element: accessibilityIssuesTable.element,
        selector: accessibilityIssuesTable.selector,
        description: accessibilityIssuesTable.description,
        bboxX: accessibilityIssuesTable.bboxX,
        bboxY: accessibilityIssuesTable.bboxY,
        bboxWidth: accessibilityIssuesTable.bboxWidth,
        bboxHeight: accessibilityIssuesTable.bboxHeight,
      })
      .from(accessibilityIssuesTable)
      .innerJoin(
        pageResultsTable,
        eq(accessibilityIssuesTable.pageId, pageResultsTable.id),
      )
      .where(
        and(
          eq(pageResultsTable.scanId, scanId),
          eq(pageResultsTable.url, pageUrl),
          eq(accessibilityIssuesTable.falsePositive, false),
        ),
      );

    const pageId = rows[0]?.pageId ?? null;

    const occurrences = rows
      .filter((row) => {
        const { name } = extractAemComponent(row.element, row.selector);
        return name === componentName;
      })
      .map((row) => ({
        id: row.id,
        ruleId: row.ruleId,
        impact: row.impact,
        element: row.element ?? "",
        selector: row.selector ?? "",
        description: row.description ?? "",
        bboxX: row.bboxX ?? null,
        bboxY: row.bboxY ?? null,
        bboxWidth: row.bboxWidth ?? null,
        bboxHeight: row.bboxHeight ?? null,
      }));

    res.json({ componentName, pageUrl, pageId, occurrences });
  },
);

// ── False-positive flag ──────────────────────────────────────────────────────
router.patch("/issues/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid issue ID" });
    return;
  }

  const { falsePositive, note } = req.body as {
    falsePositive?: unknown;
    note?: unknown;
  };
  if (typeof falsePositive !== "boolean") {
    res.status(400).json({ error: "'falsePositive' must be a boolean" });
    return;
  }

  const [updated] = await db
    .update(accessibilityIssuesTable)
    .set({
      falsePositive,
      falsePositiveNote:
        falsePositive && typeof note === "string" && note.trim()
          ? note.trim()
          : null,
    })
    .where(eq(accessibilityIssuesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }

  res.json(updated);
});

export default router;
