import { db, scanSessionsTable, pageResultsTable, accessibilityIssuesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { scanPage } from "./scanner";
import { logger } from "./logger";

interface ScanOptions {
  timeout?: number;
  waitForNetworkIdle?: boolean;
  bypassCSP?: boolean;
  maxConcurrency?: number;
  rules?: string[];
  proxyPacUrl?: string;
  skipCompletedPages?: boolean;
}

const activeScanControllers = new Map<number, AbortController>();
const pausedScans = new Set<number>();
const queuedRetryUrls = new Map<number, Set<string>>();
// Tracks how many times each URL has been auto-retried within the current scan run
const autoRetryCounters = new Map<number, Map<string, number>>();
const MAX_AUTO_RETRIES = 3; // total auto-retry attempts per URL before giving up

function getLegalText(legal?: { ada: string[]; eaa: boolean }): string {
  if (!legal) return "";
  const parts: string[] = [];
  if (legal.ada?.length) parts.push(`ADA ${legal.ada.join(", ")}`);
  if (legal.eaa) parts.push("EAA");
  return parts.join(", ");
}

async function setPageStatus(pageId: number, status: string): Promise<void> {
  await db.update(pageResultsTable)
    .set({ status })
    .where(eq(pageResultsTable.id, pageId));
}

async function waitIfPaused(scanId: number, controller: AbortController): Promise<boolean> {
  if (!pausedScans.has(scanId)) return true;
  logger.info({ scanId }, "Scan paused — waiting for resume");
  while (pausedScans.has(scanId) && !controller.signal.aborted) {
    await new Promise(r => setTimeout(r, 500));
  }
  if (controller.signal.aborted) return false;
  logger.info({ scanId }, "Scan resumed");
  await db.update(scanSessionsTable)
    .set({ status: "running" })
    .where(eq(scanSessionsTable.id, scanId));
  return true;
}

export async function startScan(scanId: number, urls: string[], options: ScanOptions = {}): Promise<void> {
  const controller = new AbortController();
  activeScanControllers.set(scanId, controller);

  const { maxConcurrency = 3 } = options;

  try {
    await db.update(scanSessionsTable)
      .set({ status: "running" })
      .where(eq(scanSessionsTable.id, scanId));

    logger.info({ scanId, urlCount: urls.length }, "Starting scan session");

    // ── Phase 1: process the initial URL list ──────────────────────────────
    for (let i = 0; i < urls.length; i += maxConcurrency) {
      if (controller.signal.aborted) {
        logger.info({ scanId }, "Scan cancelled by user");
        break;
      }
      if (!await waitIfPaused(scanId, controller)) break;

      const batch = urls.slice(i, i + maxConcurrency);
      await Promise.all(batch.map(url => scanSinglePage(scanId, url, options, controller.signal)));
    }

    // ── Phase 2: drain the retry queue ────────────────────────────────────
    // Failed URLs get added to queuedRetryUrls inside scanSinglePage.
    // Keep processing batches from the queue until it is empty or the scan
    // is cancelled.  Each pass through scanSinglePage may re-add the URL
    // (up to MAX_AUTO_RETRIES times) so we loop until the set is empty.
    while (!controller.signal.aborted) {
      const queued = queuedRetryUrls.get(scanId);
      if (!queued || queued.size === 0) break;

      if (!await waitIfPaused(scanId, controller)) break;

      // Snapshot the current queue — scanSinglePage removes each URL from
      // the set at start, and may re-add it at end if another retry is needed.
      const retryBatch = Array.from(queued).slice(0, maxConcurrency);
      logger.info({ scanId, retryBatch }, "Processing retry queue batch");
      await Promise.all(retryBatch.map(url => scanSinglePage(scanId, url, options, controller.signal)));
    }

    const finalStatus = controller.signal.aborted ? "cancelled" : "completed";

    await db.update(scanSessionsTable)
      .set({
        status: finalStatus,
        completedAt: new Date(),
      })
      .where(eq(scanSessionsTable.id, scanId));

    logger.info({ scanId, status: finalStatus }, "Scan session finished");
  } catch (err) {
    logger.error({ scanId, err }, "Scan session failed");
    await db.update(scanSessionsTable)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(scanSessionsTable.id, scanId));
  } finally {
    activeScanControllers.delete(scanId);
    pausedScans.delete(scanId);
    queuedRetryUrls.delete(scanId);
    autoRetryCounters.delete(scanId);
  }
}

export function queueRetryUrl(scanId: number, url: string): boolean {
  const controller = activeScanControllers.get(scanId);
  if (!controller || controller.signal.aborted) return false;
  if (!queuedRetryUrls.has(scanId)) queuedRetryUrls.set(scanId, new Set());
  queuedRetryUrls.get(scanId)?.add(url);
  return true;
}

async function scanSinglePage(
  scanId: number,
  url: string,
  options: ScanOptions,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;

  // ── Resolve the page row ──────────────────────────────────────────────────
  let pageRow: typeof pageResultsTable.$inferSelect | undefined;
  try {
    const rows = await db.select()
      .from(pageResultsTable)
      .where(and(eq(pageResultsTable.scanId, scanId), eq(pageResultsTable.url, url)));
    pageRow = rows[0];
  } catch (err) {
    logger.error({ scanId, url, err }, "DB error fetching page row — skipping URL");
    return;
  }

  if (!pageRow) return;
  if (options.skipCompletedPages && pageRow.status === "completed") return;
  const queued = queuedRetryUrls.get(scanId);
  if (queued?.has(url)) queued.delete(url);

  const pageId = pageRow.id;

  try {
    // Stage 1: navigating
    await setPageStatus(pageId, "navigating");
    logger.info({ scanId, url }, "Navigating to page");

    const result = await scanPage(url, {
      timeout: options.timeout,
      waitForNetworkIdle: options.waitForNetworkIdle,
      bypassCSP: options.bypassCSP,
      rules: options.rules,
      proxyPacUrl: options.proxyPacUrl,
      onStage: async (stage: string) => {
        await setPageStatus(pageId, stage);
      },
    });

    // Stage final: saving
    await setPageStatus(pageId, "saving");
    logger.info({ scanId, url }, "Saving scan results");

    const issueCount = result.issues.length;
    const criticalCount = result.issues.filter(i => i.impact === "critical").length;

    // Allow up to MAX_AUTO_RETRIES automatic retries per URL per scan run
    if (!autoRetryCounters.has(scanId)) autoRetryCounters.set(scanId, new Map());
    const counters = autoRetryCounters.get(scanId)!;
    const retryCount = counters.get(url) ?? 0;
    const shouldAutoRetry =
      Boolean(result.error) && !result.notAvailable &&
      activeScanControllers.has(scanId) &&
      retryCount < MAX_AUTO_RETRIES;

    const pageStatus = result.notAvailable ? "not_available" : result.error ? "failed" : "completed";

    // Update the primary row with full result data
    await db.update(pageResultsTable)
      .set({
        status: pageStatus,
        issueCount,
        criticalCount,
        errorMessage: result.error || null,
        scannedAt: new Date(),
        screenshot: result.screenshot ?? null,
        pageHtml: result.pageHtml ?? null,
      })
      .where(eq(pageResultsTable.id, pageId));

    // Sync any duplicate rows for the same URL so they never stay "pending"
    await db.update(pageResultsTable)
      .set({ status: pageStatus, issueCount: 0, criticalCount: 0, errorMessage: result.error || null, scannedAt: new Date() })
      .where(and(eq(pageResultsTable.scanId, scanId), eq(pageResultsTable.url, url), sql`id != ${pageId}`));

    if (result.issues.length > 0) {
      await db.insert(accessibilityIssuesTable).values(
        result.issues.map(issue => ({
          pageId,
          ruleId: issue.ruleId,
          impact: issue.impact,
          description: issue.description,
          element: issue.element,
          wcagCriteria: issue.wcagCriteria,
          wcagLevel: issue.wcagLevel,
          legalText: getLegalText(issue.legal),
          selector: issue.selector,
          remediation: issue.remediation,
          bboxX: issue.bboxX ?? null,
          bboxY: issue.bboxY ?? null,
          bboxWidth: issue.bboxWidth ?? null,
          bboxHeight: issue.bboxHeight ?? null,
        }))
      );
    }

    // Update session totals
    const [session] = await db.select()
      .from(scanSessionsTable)
      .where(eq(scanSessionsTable.id, scanId));

    if (session) {
      await db.update(scanSessionsTable)
        .set({
          scannedUrls: (result.error && !result.notAvailable) ? session.scannedUrls : session.scannedUrls + 1,
          failedUrls: (result.error && !result.notAvailable) ? session.failedUrls + 1 : session.failedUrls,
          totalIssues: session.totalIssues + issueCount,
          criticalIssues: session.criticalIssues + criticalCount,
        })
        .where(eq(scanSessionsTable.id, scanId));
    }

    if (shouldAutoRetry) {
      counters.set(url, retryCount + 1);
      logger.info({ scanId, url, attempt: retryCount + 1, max: MAX_AUTO_RETRIES }, "Auto-retrying URL");
      queueRetryUrl(scanId, url);
    } else if (result.error && !result.notAvailable) {
      logger.info({ scanId, url, retryCount }, "URL exceeded max auto-retries — giving up");
    }
  } catch (err) {
    // An unexpected error (browser crash, DB failure, etc.) must never take
    // down the whole scan — record the page as failed and carry on.
    logger.error({ scanId, url, err }, "Unexpected error scanning page — marking failed and continuing");
    try {
      await db.update(pageResultsTable)
        .set({ status: "failed", errorMessage: String(err), scannedAt: new Date() })
        .where(eq(pageResultsTable.id, pageId));
      const [session] = await db.select()
        .from(scanSessionsTable)
        .where(eq(scanSessionsTable.id, scanId));
      if (session) {
        await db.update(scanSessionsTable)
          .set({ failedUrls: session.failedUrls + 1 })
          .where(eq(scanSessionsTable.id, scanId));
      }
    } catch (dbErr) {
      logger.error({ scanId, url, dbErr }, "Could not persist page failure to DB");
    }
  }
}

export function cancelScan(scanId: number): boolean {
  pausedScans.delete(scanId);
  const controller = activeScanControllers.get(scanId);
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
}

export function pauseScan(scanId: number): boolean {
  pausedScans.add(scanId);
  return true;
}

export function resumeScan(scanId: number): boolean {
  if (!pausedScans.has(scanId)) return false;
  pausedScans.delete(scanId);
  return true;
}

export function isScanActive(scanId: number): boolean {
  return activeScanControllers.has(scanId);
}

export function isScanPaused(scanId: number): boolean {
  return pausedScans.has(scanId);
}
