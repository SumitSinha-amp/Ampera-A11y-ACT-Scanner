import { execFileSync } from "node:child_process";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withEvidenceBudget } from "./evidence-budget";

describe("post-baseline evidence budget", () => {
  it("keeps successful evidence and does not close the page", async () => {
    const close = vi.fn();
    const result = await withEvidenceBudget({ close } as unknown as Page, 1000, async () => ({ findings: 2 }));
    expect(result).toEqual({ value: { findings: 2 } });
    expect(close).not.toHaveBeenCalled();
  });

  it("does not start work when the queue has no safe time remaining", async () => {
    const work = vi.fn();
    expect(await withEvidenceBudget({} as Page, 0, work)).toHaveProperty("error");
    expect(work).not.toHaveBeenCalled();
  });

  it("settles timed-out work before returning, without publishing late evidence", async () => {
    let finish!: (value: string) => void;
    const task = new Promise<string>(resolve => { finish = resolve; });
    const close = vi.fn(async () => { finish("late evidence"); });
    expect(await withEvidenceBudget({ close } as unknown as Page, 10, () => task))
      .toEqual({ error: "Additional evidence time limit reached" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("cleans up after an enrichment error instead of rejecting the baseline", async () => {
    const close = vi.fn(async () => {});
    expect(await withEvidenceBudget({ close } as unknown as Page, 1000,
      async () => { throw new Error("evidence failed"); })).toEqual({ error: "evidence failed" });
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("busy Chromium renderer deadline", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await puppeteer.launch({
      executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  it("closes the target even while synchronous JavaScript is stuck", async () => {
    const page = await browser.newPage();
    const baseline = { issues: ["original finding"], screenshot: "baseline snapshot" };
    const started = Date.now();
    const result = await withEvidenceBudget(page, 100,
      () => page.evaluate(() => { while (true) { /* intentionally stuck renderer */ } }));
    expect(result.error).toBe("Additional evidence time limit reached");
    expect(page.isClosed()).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(baseline).toEqual({ issues: ["original finding"], screenshot: "baseline snapshot" });
    const nextPage = await browser.newPage();
    expect(await nextPage.evaluate(() => 2 + 2)).toBe(4);
    await nextPage.close();
  }, 10000);
});
