import { db, scanSessionsTable, pageResultsTable, accessibilityIssuesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { scanPage } from "./scanner";
import { logger } from "./logger";

interface ScanOptions {
  timeout?: number;
  waitForNetworkIdle?: boolean;
  bypassCSP?: boolean;
  maxConcurrency?: number;
  rules?: string[];
  proxyPacUrl?: string;
}

const activeScanControllers = new Map<number, AbortController>();

export async function startScan(scanId: number, urls: string[], options: ScanOptions = {}): Promise<void> {
  const controller = new AbortController();
  activeScanControllers.set(scanId, controller);

  const { maxConcurrency = 1 } = options;

  try {
    await db.update(scanSessionsTable)
      .set({ status: "running" })
      .where(eq(scanSessionsTable.id, scanId));

    logger.info({ scanId, urlCount: urls.length }, "Starting scan session");

    for (let i = 0; i < urls.length; i += maxConcurrency) {
      if (controller.signal.aborted) {
        logger.info({ scanId }, "Scan cancelled by user");
        break;
      }

      const batch = urls.slice(i, i + maxConcurrency);
      await Promise.all(batch.map(url => scanSinglePage(scanId, url, options, controller.signal)));
    }

    const [session] = await db.select()
      .from(scanSessionsTable)
      .where(eq(scanSessionsTable.id, scanId));

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
  }
}

async function scanSinglePage(
  scanId: number,
  url: string,
  options: ScanOptions,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;

  const [pageRow] = await db.select()
    .from(pageResultsTable)
    .where(and(eq(pageResultsTable.scanId, scanId), eq(pageResultsTable.url, url)));

  if (!pageRow) return;

  await db.update(pageResultsTable)
    .set({ status: "scanning" })
    .where(eq(pageResultsTable.id, pageRow.id));

  logger.info({ scanId, url }, "Scanning page");

  const result = await scanPage(url, {
    timeout: options.timeout,
    waitForNetworkIdle: options.waitForNetworkIdle,
    bypassCSP: options.bypassCSP,
    rules: options.rules,
    proxyPacUrl: options.proxyPacUrl,
  });

  const issueCount = result.issues.length;
  const criticalCount = result.issues.filter(i => i.impact === "critical").length;

  await db.update(pageResultsTable)
    .set({
      status: result.error ? "failed" : "completed",
      issueCount,
      criticalCount,
      errorMessage: result.error || null,
      scannedAt: new Date(),
    })
    .where(eq(pageResultsTable.id, pageRow.id));

  if (result.issues.length > 0) {
    await db.insert(accessibilityIssuesTable).values(
      result.issues.map(issue => ({
        pageId: pageRow.id,
        ruleId: issue.ruleId,
        impact: issue.impact,
        description: issue.description,
        element: issue.element,
        wcagCriteria: issue.wcagCriteria,
        wcagLevel: issue.wcagLevel,
        selector: issue.selector,
        remediation: issue.remediation,
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
        scannedUrls: result.error ? session.scannedUrls : session.scannedUrls + 1,
        failedUrls: result.error ? session.failedUrls + 1 : session.failedUrls,
        totalIssues: session.totalIssues + issueCount,
        criticalIssues: session.criticalIssues + criticalCount,
      })
      .where(eq(scanSessionsTable.id, scanId));
  }
}

export function cancelScan(scanId: number): boolean {
  const controller = activeScanControllers.get(scanId);
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
}

export function isScanActive(scanId: number): boolean {
  return activeScanControllers.has(scanId);
}
