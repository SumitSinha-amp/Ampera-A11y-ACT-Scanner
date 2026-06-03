import { db, scanSessionsTable, pageResultsTable, accessibilityIssuesTable } from "@workspace/db";
import { eq, and, sql, or, inArray, lt } from "drizzle-orm";
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
// URLs injected mid-scan via addUrlsToRunningScan — drained by the Phase 1 loop
const injectedUrlQueue = new Map<number, string[]>();

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

  const { maxConcurrency = 2 } = options;

  try {
    await db.update(scanSessionsTable)
      .set({ status: "running" })
      .where(eq(scanSessionsTable.id, scanId));

    logger.info({ scanId, urlCount: urls.length }, "Starting scan session");

    // ── Phase 1: process the initial URL list (dynamic — new URLs may be injected) ──
    const liveQueue = [...urls];
    let qi = 0;
    while (qi < liveQueue.length) {
      if (controller.signal.aborted) {
        logger.info({ scanId }, "Scan cancelled by user");
        break;
      }
      if (!await waitIfPaused(scanId, controller)) break;

      // Drain any URLs injected mid-scan via addUrlsToRunningScan
      const injected = injectedUrlQueue.get(scanId);
      if (injected && injected.length > 0) {
        liveQueue.push(...injected.splice(0));
        logger.info({ scanId, count: liveQueue.length - qi }, "Injected URLs appended to live queue");
      }

      const batch = liveQueue.slice(qi, qi + maxConcurrency);
      qi += maxConcurrency;
      await Promise.all(batch.map(url => scanSinglePage(scanId, url, options, controller.signal)));
    }

    // Final drain — pick up URLs injected right as the loop was finishing
    const finalInjected = injectedUrlQueue.get(scanId);
    if (finalInjected && finalInjected.length > 0 && !controller.signal.aborted) {
      const extra = finalInjected.splice(0);
      logger.info({ scanId, count: extra.length }, "Processing URLs injected after Phase 1 completion");
      for (let i = 0; i < extra.length; i += maxConcurrency) {
        if (controller.signal.aborted) break;
        if (!await waitIfPaused(scanId, controller)) break;
        const batch = extra.slice(i, i + maxConcurrency);
        await Promise.all(batch.map(url => scanSinglePage(scanId, url, options, controller.signal)));
      }
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
      // skipCompletedPages: true — never re-scan a URL that succeeded while it
      // was waiting in the retry queue (e.g. completed by a concurrent Phase 1 worker).
      await Promise.all(retryBatch.map(url => scanSinglePage(scanId, url, { ...options, skipCompletedPages: true }, controller.signal)));
    }

    // ── Phase 3: post-cycle retry loop (up to 5 rounds) ──────────────────────
    // After Phase 1 + 2, retry every page still marked not_available or failed.
    // We loop up to MAX_PHASE3_RETRIES times so transient blips, slow deploys,
    // or brief CDN hiccups have multiple chances to clear.  The scan is never
    // marked "completed" until all retry rounds are finished (or aborted).
    // Safety valve: if two consecutive rounds show ZERO improvement (same
    // failure count) we stop early — the site is likely unreachable.
    const MAX_PHASE3_RETRIES = 5;
    let prevPhase3FailedCount = -1; // sentinel: first round has no prior count
    let consecutiveNoProgress = 0;

    for (let round = 1; round <= MAX_PHASE3_RETRIES; round++) {
      if (controller.signal.aborted) break;

      const failedRows = await db
        .select({ url: pageResultsTable.url })
        .from(pageResultsTable)
        .where(
          and(
            eq(pageResultsTable.scanId, scanId),
            or(
              eq(pageResultsTable.status, "not_available"),
              eq(pageResultsTable.status, "failed"),
            ),
          ),
        );

      if (failedRows.length === 0) {
        logger.info({ scanId, round }, "Phase 3: no failed/not_available pages remaining — stopping early");
        break;
      }

      // Bail only when TWO consecutive rounds produced zero improvement —
      // this avoids abandoning a slow site after a single unlucky round while
      // still protecting against a truly unreachable target.
      if (prevPhase3FailedCount !== -1 && failedRows.length >= prevPhase3FailedCount) {
        consecutiveNoProgress++;
      } else {
        consecutiveNoProgress = 0; // improvement this round — reset counter
      }
      prevPhase3FailedCount = failedRows.length;

      if (consecutiveNoProgress >= 2) {
        logger.warn(
          { scanId, failedCount: failedRows.length, round, consecutiveNoProgress },
          "Phase 3 aborted — no improvement over 2 consecutive rounds, site likely unreachable",
        );
        break;
      }

      const requeueUrls = failedRows.map((r) => r.url);
      logger.info(
        { scanId, round, max: MAX_PHASE3_RETRIES, count: requeueUrls.length },
        "Phase 3 retry round starting",
      );

      // Mark as "requeued" so the UI reflects that another attempt is in progress.
      await db
        .update(pageResultsTable)
        .set({ status: "requeued" })
        .where(
          and(
            eq(pageResultsTable.scanId, scanId),
            or(
              eq(pageResultsTable.status, "not_available"),
              eq(pageResultsTable.status, "failed"),
            ),
          ),
        );

      // Scan in batches — counter updates are skipped here and recomputed after.
      for (let i = 0; i < requeueUrls.length; i += maxConcurrency) {
        if (controller.signal.aborted) break;
        if (!await waitIfPaused(scanId, controller)) break;
        const batch = requeueUrls.slice(i, i + maxConcurrency);
        logger.info({ scanId, round, batch }, "Phase 3 retry batch");
        // skipCompletedPages: true — Phase 3 must never re-scan a page that
        // already completed successfully, even if a duplicate failed row exists.
        await Promise.all(
          batch.map((url) => scanSinglePage(scanId, url, { ...options, skipCompletedPages: true }, controller.signal, true)),
        );
      }

      // Recompute session totals from DB after every round so the UI stays accurate.
      const [totals] = await db
        .select({
          totalIssues:    sql<number>`COALESCE(SUM(issue_count), 0)`,
          criticalIssues: sql<number>`COALESCE(SUM(critical_count), 0)`,
          scannedUrls:    sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`,
          failedUrls:     sql<number>`COUNT(*) FILTER (WHERE status IN ('failed', 'not_available'))`,
        })
        .from(pageResultsTable)
        .where(eq(pageResultsTable.scanId, scanId));

      if (totals) {
        await db
          .update(scanSessionsTable)
          .set({
            totalIssues:    Number(totals.totalIssues),
            criticalIssues: Number(totals.criticalIssues),
            scannedUrls:    Number(totals.scannedUrls),
            failedUrls:     Number(totals.failedUrls),
          })
          .where(eq(scanSessionsTable.id, scanId));
        logger.info({ scanId, round, totals }, "Phase 3 round totals recomputed");
      }
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
    injectedUrlQueue.delete(scanId);
  }
}

export function queueRetryUrl(scanId: number, url: string): boolean {
  const controller = activeScanControllers.get(scanId);
  if (!controller || controller.signal.aborted) return false;
  if (!queuedRetryUrls.has(scanId)) queuedRetryUrls.set(scanId, new Set());
  queuedRetryUrls.get(scanId)?.add(url);
  return true;
}

/**
 * Inject additional URLs into a scan that is currently running, paused, or pending.
 * Inserts DB rows immediately (so status/progress reflects them) and feeds the
 * live Phase-1 queue so the worker picks them up without any restart.
 */
export async function addUrlsToRunningScan(
  scanId: number,
  urls: string[],
): Promise<{ added: number; skipped: number }> {
  // Deduplicate against existing page_results rows
  const existing = await db
    .select({ url: pageResultsTable.url })
    .from(pageResultsTable)
    .where(eq(pageResultsTable.scanId, scanId));

  const existingSet = new Set(existing.map((r) => r.url));
  const newUrls = urls.filter((u) => !existingSet.has(u));

  if (newUrls.length === 0) {
    return { added: 0, skipped: urls.length };
  }

  // Insert pending rows so the DB immediately reflects the new total
  await db.insert(pageResultsTable).values(
    newUrls.map((url) => ({ scanId, url, status: "pending" as const })),
  );

  // Update total_urls on the session
  await db
    .update(scanSessionsTable)
    .set({ totalUrls: sql`${scanSessionsTable.totalUrls} + ${newUrls.length}` })
    .where(eq(scanSessionsTable.id, scanId));

  // Feed the live queue if the scan worker is still running
  if (!injectedUrlQueue.has(scanId)) injectedUrlQueue.set(scanId, []);
  injectedUrlQueue.get(scanId)!.push(...newUrls);

  logger.info(
    { scanId, added: newUrls.length, skipped: urls.length - newUrls.length },
    "URLs injected into running scan",
  );

  return { added: newUrls.length, skipped: urls.length - newUrls.length };
}

async function scanSinglePage(
  scanId: number,
  url: string,
  options: ScanOptions,
  signal: AbortSignal,
  skipCounterUpdates = false,
): Promise<void> {
  if (signal.aborted) return;

  // If the scan was paused while this page was already queued in a batch,
  // hold here until resumed (or cancelled) before touching any DB state.
  if (pausedScans.has(scanId)) {
    logger.info({ scanId, url }, "Page waiting — scan is paused");
    while (pausedScans.has(scanId) && !signal.aborted) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (signal.aborted) return;
  }

  // ── Resolve the page row ──────────────────────────────────────────────────
  // ORDER BY prefers the row that most needs to be worked on (requeued/failed/
  // not_available) over any already-completed duplicate, avoiding a race where
  // the completed row is accidentally selected and then overwritten by a retry.
  let pageRow: typeof pageResultsTable.$inferSelect | undefined;
  try {
    const rows = await db.select()
      .from(pageResultsTable)
      .where(and(eq(pageResultsTable.scanId, scanId), eq(pageResultsTable.url, url)))
      .orderBy(
        sql`CASE WHEN ${pageResultsTable.status} IN ('requeued','failed','not_available','pending') THEN 0 ELSE 1 END`,
        pageResultsTable.id,
      );
    pageRow = rows[0];
  } catch (err) {
    logger.error({ scanId, url, err }, "DB error fetching page row — skipping URL");
    return;
  }

  if (!pageRow) return;
  // Never re-scan a page that is already completed.  This guard applies to all
  // callers; Phase 3 also sets skipCompletedPages: true for an extra layer.
  if (pageRow.status === "completed") return;
  const queued = queuedRetryUrls.get(scanId);
  if (queued?.has(url)) queued.delete(url);

  const pageId = pageRow.id;

  try {
    // Stage 1: navigating
    await setPageStatus(pageId, "navigating");
    logger.info({ scanId, url }, "Navigating to page");

    // Hard per-URL deadline — 30 s beyond the configured Puppeteer timeout.
    // When it fires we abort the AbortController, which force-closes the live
    // Puppeteer page so the scan mutex is released immediately.
    const configuredTimeout = options.timeout ?? 60_000;
    const hardDeadline = configuredTimeout + 20_000;
    const urlAbortController = new AbortController();
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    const hardTimeoutPromise = new Promise<never>((_, reject) => {
      hardTimer = setTimeout(() => {
        urlAbortController.abort(); // force-closes the Puppeteer page
        reject(new Error(`URL scan hard-timeout after ${hardDeadline}ms — aborting stuck navigation`));
      }, hardDeadline);
    });

    // Run scanPage against the hard-deadline.  If the hard timer fires first
    // we convert the thrown error into a synthetic failed result so that the
    // shouldAutoRetry logic below still applies (Phase 2 queue) instead of
    // falling into the outer catch which skips retry altogether.
    let result: Awaited<ReturnType<typeof scanPage>>;
     const scanStart = Date.now();
    try {
      result = await Promise.race([
        scanPage(url, {
          timeout: configuredTimeout,
          waitForNetworkIdle: options.waitForNetworkIdle,
          bypassCSP: options.bypassCSP,
          rules: options.rules,
          proxyPacUrl: options.proxyPacUrl,
          signal: urlAbortController.signal,
          onStage: async (stage: string) => {
            await setPageStatus(pageId, stage);
          },
        }),
        hardTimeoutPromise,
      ]);
    } catch (raceErr) {
      // Hard-timeout (or any scanPage internal rejection) — treat as a
      // recoverable failure so the retry queue picks it up.
      result = { url, issues: [], error: String(raceErr) };
    } finally {
      if (hardTimer !== null) clearTimeout(hardTimer);
    }

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
     const scanDurationMs = Date.now() - scanStart;
    await db.update(pageResultsTable)
      .set({
        status: pageStatus,
        issueCount,
        criticalCount,
        errorMessage: result.error || null,
        scannedAt: new Date(),
        loadDurationMs: result.loadDurationMs ?? null,
        scanDurationMs,
        screenshot: result.screenshot ?? null,
        pageHtml: result.pageHtml ?? null,
      })
      .where(eq(pageResultsTable.id, pageId));

    // Sync any duplicate rows for the same URL so they never stay "pending".
    // Crucially, NEVER overwrite a row that is already "completed" — doing so
    // would cause the DONE counter to drop when a retry of a duplicate row fails.
    await db.update(pageResultsTable)
      .set({ status: pageStatus, issueCount: 0, criticalCount: 0, errorMessage: result.error || null, scannedAt: new Date() })
      .where(and(
        eq(pageResultsTable.scanId, scanId),
        eq(pageResultsTable.url, url),
        sql`${pageResultsTable.id} != ${pageId}`,
        sql`${pageResultsTable.status} != 'completed'`,
      ));

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

    // Update session totals (skipped during post-cycle retry; recomputed from DB after)
    if (!skipCounterUpdates) {
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

/**
 * Periodic watchdog that detects scans marked "running" in the DB but not
 * present in the in-memory activeScanControllers (which happens when Azure
 * App Service restarts the container mid-scan).
 *
 * For each stuck scan it:
 *   1. Resets any mid-flight page rows (navigating/scanning/saving/…) → pending
 *   2. Re-queues all pending/requeued pages and calls startScan()
 *   3. If no pages remain it marks the session "completed"
 *
 * A 3-minute creation-age guard prevents recovering a scan whose page rows
 * haven't been inserted yet (the retry endpoint can take ~30 s for large scans).
 */
/** Returns true when the error is a PostgreSQL read-only-transaction rejection. */
function isReadOnlyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("read-only transaction") || msg.includes("read only");
}

/**
 * Timestamp until which the watchdog suppresses writes (and log spam) after
 * detecting a read-only database.  0 = not suppressed.
 * Suppression window: 10 minutes, then one more attempt before extending again.
 */
let _watchdogSuspendedUntil = 0;

export function startScanWatchdog(intervalMs = 60_000): void {
  const MID_FLIGHT = ["navigating", "scanning", "rendering", "analyzing", "saving"] as const;
  const RESTARTABLE = ["pending", "requeued"] as const;

  setInterval(async () => {
    // If the database is in read-only mode, skip writes entirely and avoid
    // flooding the log.  Re-attempt every 10 minutes in case storage was
    // freed up or the connection was switched to the primary.
    if (Date.now() < _watchdogSuspendedUntil) return;

    try {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

      const runningSessions = await db
        .select({ id: scanSessionsTable.id, options: scanSessionsTable.options })
        .from(scanSessionsTable)
        .where(
          and(
            inArray(scanSessionsTable.status, ["running", "pending"]),
            lt(scanSessionsTable.createdAt, threeMinutesAgo),
          ),
        );

      for (const session of runningSessions) {
        if (activeScanControllers.has(session.id)) continue;

        logger.warn({ scanId: session.id }, "Watchdog: detected stuck scan — attempting recovery");

        await db
          .update(pageResultsTable)
          .set({ status: "pending" })
          .where(
            and(
              eq(pageResultsTable.scanId, session.id),
              inArray(pageResultsTable.status, [...MID_FLIGHT]),
            ),
          );

        const remaining = await db
          .select({ url: pageResultsTable.url })
          .from(pageResultsTable)
          .where(
            and(
              eq(pageResultsTable.scanId, session.id),
              inArray(pageResultsTable.status, [...RESTARTABLE]),
            ),
          );

        if (remaining.length === 0) {
          await db
            .update(scanSessionsTable)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(scanSessionsTable.id, session.id));
          logger.info({ scanId: session.id }, "Watchdog: stuck scan had no remaining pages — marked completed");
          continue;
        }

        const urls = remaining.map((r) => r.url);
        logger.info({ scanId: session.id, urlCount: urls.length }, "Watchdog: restarting stuck scan");
        startScan(session.id, urls, {
          ...((session.options as Record<string, unknown>) ?? {}),
          skipCompletedPages: true,
        }).catch((err) => {
          logger.error({ scanId: session.id, err }, "Watchdog: stuck scan restart failed");
        });
      }
    } catch (err) {
      if (isReadOnlyError(err)) {
        // Suspend the watchdog for 10 minutes to avoid log-flooding.
        // The database is either out of storage (Azure auto-enables read-only
        // at 95% usage) or DATABASE_URL points to a read-replica.
        // Actions: (1) open Azure portal → your PostgreSQL server → Storage →
        //          increase allocated storage or clean up data; OR
        //          (2) verify DATABASE_URL uses the *primary* hostname, not a
        //          *.read.postgres.database.azure.com replica endpoint.
        _watchdogSuspendedUntil = Date.now() + 10 * 60 * 1000;
        logger.fatal(
          { err },
          "DATABASE IS READ-ONLY — all writes are blocked. " +
          "Watchdog suspended for 10 minutes. " +
          "Fix on Azure: (1) Storage ≥ 95%? Increase storage or delete data in the Azure portal. " +
          "(2) DATABASE_URL pointing to a read-replica? Use the primary server hostname.",
        );
      } else {
        logger.error({ err }, "Scan watchdog encountered an error");
      }
    }
  }, intervalMs);
}
