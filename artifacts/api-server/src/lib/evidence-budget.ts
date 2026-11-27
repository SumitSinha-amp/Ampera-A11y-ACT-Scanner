import type { Page } from "puppeteer";

/**
 * Only for enrichment AFTER baseline evidence has been captured. On expiry,
 * destroy this disposable page before returning: a Promise.race alone would
 * leave the timed-out task mutating a page that another worker could reuse.
 */
export async function withEvidenceBudget<T>(
  page: Page,
  budgetMs: number,
  work: () => Promise<T>,
): Promise<{ value?: T; error?: string }> {
  if (budgetMs <= 0) return { error: "Additional evidence budget exhausted" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = Promise.resolve().then(work);
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Additional evidence time limit reached")), budgetMs);
  });
  try {
    return { value: await Promise.race([pending, expired]) };
  } catch (err) {
    // Target.closeTarget uses the browser connection, including when renderer
    // JavaScript is stuck. No detached task may survive the page's lifetime.
    await page.close().catch(() => {});
    await pending.catch(() => {});
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
