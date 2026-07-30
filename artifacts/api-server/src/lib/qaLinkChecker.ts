import { db } from "@workspace/db";
import { qaLinksTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";

const CONCURRENT_CHECKS = 8;
const TIMEOUT_MS = 8000;
const MAX_LINKS_PER_SCAN = 5000;
const UA = "Mozilla/5.0 (compatible; AmperaA11yQABot/1.0; +https://ampera.ai)";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 750;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function shouldCountAsBroken(status: number): boolean {
  return status >= 400 && status !== 403;
}

/** Active checker set — prevents double-running for the same scan */
const activeCheckers = new Set<number>();

export function isQACheckerRunning(scanId: number): boolean {
  return activeCheckers.has(scanId);
}

export async function runQALinkChecker(scanId: number): Promise<void> {
  if (activeCheckers.has(scanId)) {
    logger.info({ scanId }, "QA link checker already running — skipping duplicate");
    return;
  }
  activeCheckers.add(scanId);
  try {
    logger.info({ scanId }, "QA link checker starting");

    const unchecked = await db
      .selectDistinct({ destUrl: qaLinksTable.destUrl })
      .from(qaLinksTable)
      .where(and(eq(qaLinksTable.scanId, scanId), isNull(qaLinksTable.checkedAt)))
      .limit(MAX_LINKS_PER_SCAN);

    logger.info({ scanId, count: unchecked.length }, "QA: unique URLs to check");

    for (let i = 0; i < unchecked.length; i += CONCURRENT_CHECKS) {
      const batch = unchecked.slice(i, i + CONCURRENT_CHECKS);
      await Promise.all(batch.map(({ destUrl }) => checkAndStore(scanId, destUrl)));
    }

    logger.info({ scanId }, "QA link checker complete");
  } finally {
    activeCheckers.delete(scanId);
  }
}

async function checkAndStore(scanId: number, destUrl: string): Promise<void> {
  let httpStatus = 0;
  let isRedirect = false;
  let redirectTo: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(destUrl, {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": UA },
        });
        httpStatus = res.status;
        isRedirect = false;
        redirectTo = null;

        if (httpStatus >= 300 && httpStatus < 400) {
          isRedirect = true;
          redirectTo = res.headers.get("location");
          try {
            const followed = await fetch(destUrl, {
              method: "HEAD",
              signal: controller.signal,
              headers: { "User-Agent": UA },
            });
            httpStatus = followed.status;
          } catch {
            httpStatus = 0;
            isRedirect = false;
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      httpStatus = 0;
      isRedirect = false;
    }

    if (attempt < MAX_ATTEMPTS && (httpStatus === 0 || shouldRetryStatus(httpStatus))) {
      await sleep(RETRY_DELAY_MS * attempt);
      continue;
    }
    break;
  }

  try {
    await db
      .update(qaLinksTable)
      .set({ httpStatus, isRedirect, redirectTo, checkedAt: new Date() })
      .where(and(eq(qaLinksTable.scanId, scanId), eq(qaLinksTable.destUrl, destUrl)));
  } catch (dbErr) {
    logger.warn({ scanId, destUrl, dbErr }, "QA: failed to persist link check result");
  }
}

/**
 * Count broken/redirect links for a scan (fast aggregation).
 */
export async function getQALinkStats(scanId: number) {
  const [row] = await db
    .select({
      totalChecked: sql<number>`COUNT(*)::int`,
      broken: sql<number>`COUNT(*) FILTER (WHERE (http_status >= 400 AND http_status <> 403) OR (http_status = 0 AND checked_at IS NOT NULL))::int`,
      redirects: sql<number>`COUNT(*) FILTER (WHERE is_redirect = true)::int`,
      unchecked: sql<number>`COUNT(*) FILTER (WHERE checked_at IS NULL)::int`,
    })
    .from(qaLinksTable)
    .where(eq(qaLinksTable.scanId, scanId));
  return row ?? { totalChecked: 0, broken: 0, redirects: 0, unchecked: 0 };
}
