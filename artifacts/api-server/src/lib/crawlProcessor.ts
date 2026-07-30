import { db, pool } from "@workspace/db";
import { qaPagesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { runQALinkChecker } from "./qaLinkChecker";
import { logger } from "./logger";

const CONCURRENT_IMAGE_CHECKS = 8;
const IMAGE_TIMEOUT_MS = 6000;
const UA = "Mozilla/5.0 (compatible; AmperaA11yQABot/1.0; +https://ampera.ai)";

const activeProcessors = new Set<number>();

export async function runCrawlPostProcessing(scanId: number): Promise<void> {
  if (activeProcessors.has(scanId)) {
    logger.info({ scanId }, "Crawl post-processor already running — skipping duplicate");
    return;
  }
  activeProcessors.add(scanId);
  try {
    logger.info({ scanId }, "Crawl post-processing: starting");

    await Promise.all([
      runQALinkChecker(scanId).catch((err) =>
        logger.error({ scanId, err }, "Crawl post-processing: QA link checker failed"),
      ),
      runImageChecker(scanId).catch((err) =>
        logger.error({ scanId, err }, "Crawl post-processing: image checker failed"),
      ),
      runWordInventoryExtraction(scanId).catch((err) =>
        logger.error({ scanId, err }, "Crawl post-processing: word inventory failed"),
      ),
    ]);

    logger.info({ scanId }, "Crawl post-processing: complete");
  } finally {
    activeProcessors.delete(scanId);
  }
}

async function runImageChecker(scanId: number): Promise<void> {
  const client = await pool.connect();
  try {
    const rows = (
      await client.query<{ src: string }>(
        `SELECT DISTINCT src FROM qa_images WHERE scan_id = $1 AND checked_at IS NULL LIMIT 2000`,
        [scanId],
      )
    ).rows;

    if (rows.length === 0) return;
    logger.info({ scanId, count: rows.length }, "Crawl post-processing: checking images");

    for (let i = 0; i < rows.length; i += CONCURRENT_IMAGE_CHECKS) {
      const batch = rows.slice(i, i + CONCURRENT_IMAGE_CHECKS);
      await Promise.all(batch.map(({ src }) => checkAndStoreImage(scanId, src)));
    }
  } finally {
    client.release();
  }
}

async function checkAndStoreImage(scanId: number, src: string): Promise<void> {
  let httpStatus = 0;
  let isBroken = false;
  try {
    const res = await fetch(src, {
      method: "HEAD",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: { "User-Agent": UA },
    });
    httpStatus = res.status;
    isBroken = httpStatus >= 400;
  } catch {
    httpStatus = 0;
    isBroken = true;
  }

  try {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE qa_images SET http_status = $1, is_broken = $2, checked_at = NOW()
         WHERE scan_id = $3 AND src = $4`,
        [httpStatus, isBroken, scanId, src],
      );
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn({ scanId, src, err }, "Crawl post-processing: failed to persist image check");
  }
}

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by","from","up","about",
  "into","through","during","before","after","above","below","between","out","off","over","under",
  "again","further","then","once","here","there","when","where","why","how","all","both","each",
  "few","more","most","other","some","such","no","not","only","same","so","than","too","very",
  "can","will","just","should","would","could","may","might","shall","must","need","ought",
  "do","does","did","has","have","had","is","are","was","were","be","been","being",
  "this","that","these","those","it","its","they","them","their","we","our","you","your",
  "he","him","his","she","her","i","me","my","who","which","what","as","if","because",
  "while","although","though","even","whether","since","until","unless",
]);

async function runWordInventoryExtraction(scanId: number): Promise<void> {
  const pages = await db
    .select({ url: qaPagesTable.url, bodyText: qaPagesTable.bodyText })
    .from(qaPagesTable)
    .where(and(eq(qaPagesTable.scanId, scanId), sql`body_text IS NOT NULL`));

  if (pages.length === 0) return;

  logger.info({ scanId, pageCount: pages.length }, "Crawl post-processing: extracting word inventory");

  const wordPageSet = new Map<string, Set<string>>();
  const wordCount = new Map<string, number>();

  for (const page of pages) {
    if (!page.bodyText) continue;
    const words = page.bodyText
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && w.length <= 30 && !STOP_WORDS.has(w) && /^[a-z]/.test(w));

    const uniqueOnPage = new Set(words);
    for (const word of uniqueOnPage) {
      if (!wordPageSet.has(word)) wordPageSet.set(word, new Set());
      wordPageSet.get(word)!.add(page.url);
    }
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
    }
  }

  if (wordPageSet.size === 0) return;

  const entries = [...wordPageSet.entries()]
    .map(([word, pages]) => ({
      word,
      pageCount: pages.size,
      totalCount: wordCount.get(word) ?? 0,
    }))
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 5000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM qa_word_inventory WHERE scan_id = $1`, [scanId]);
    for (let i = 0; i < entries.length; i += 200) {
      const batch = entries.slice(i, i + 200);
      const vals = batch
        .map((e) => `(${scanId}, '${e.word.replace(/'/g, "''")}', ${e.pageCount}, ${e.totalCount})`)
        .join(",");
      await client.query(
        `INSERT INTO qa_word_inventory (scan_id, word, page_count, total_count) VALUES ${vals}`,
      );
    }
    await client.query("COMMIT");
    logger.info({ scanId, wordCount: entries.length }, "Crawl post-processing: word inventory saved");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.warn({ scanId, err }, "Crawl post-processing: word inventory save failed");
  } finally {
    client.release();
  }
}
