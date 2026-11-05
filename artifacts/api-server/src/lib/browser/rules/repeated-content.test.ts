import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}
describe.skipIf(!existsSync(chromium))("ACT-R101 repeated content review", () => {
  let browser: Browser, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, options = { rules: ["ACT-R101"] }) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Review fixture</title></head><body>${html}</body></html>`);
      await page.evaluate(bundle);
      return await page.evaluate(options => {
        const before = document.documentElement.outerHTML;
        const result = (window as any).__ampera.runAllRules(options);
        return {
          issues: result.issues.filter((issue: any) => issue.ruleId === "ACT-R101"),
          unchanged: before === document.documentElement.outerHTML,
        };
      }, options);
    } finally { await page.close(); }
  }

  it("reports one review item for the Dream-style header/navigation and unmarked primary content", async () => {
    const result = await scan('<header>Dream Destination<nav><a href="/">Home</a><a href="/trips">Trips</a></nav></header><div><h1>Book your destination</h1><p>Travel content</p></div>');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ type: "Potential Issue", selector: "body" });
    expect(result.issues[0].description).toContain("not identified");
    expect(result.unchanged).toBe(true);
  });
  it("does not count ancestor wrappers, main text or footer content as preceding main", async () => {
    expect((await scan('<div><main><h1>Article</h1><p>Content</p></main><footer>Footer navigation</footer></div>')).issues).toEqual([]);
  });
  it("asks for review of content before a main instead of asserting cross-page repetition", async () => {
    expect((await scan('<nav><a href="/">Home</a></nav><main>Article</main>')).issues).toHaveLength(1);
  });
  it("does not treat hidden headers or script text as preceding content", async () => {
    expect((await scan('<header hidden>Hidden</header><script type="text/plain">Data</script><main>Article</main>')).issues).toEqual([]);
  });
  it("includes image-only repeated-content candidates", async () => {
    expect((await scan('<header><img alt="Brand" src="data:,"></header><main>Article</main>')).issues).toHaveLength(1);
  });
  it("ignores hidden main landmarks and still asks for primary-content identification", async () => {
    const result = await scan('<main hidden>Hidden</main><h1>Article</h1>');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].description).toContain("not identified");
  });
  it("respects explicit rule exclusion", async () => {
    expect((await scan('<nav>Navigation</nav><h1>Article</h1>', { rules: ["ACT-R99"] })).issues).toEqual([]);
  });
  it("reports the same review item in a standard scan", async () => {
    expect((await scan('<header>Navigation</header><h1>Article</h1>', {} as any)).issues).toHaveLength(1);
  });
});
