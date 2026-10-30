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

describe.skipIf(!existsSync(chromium))("ACT-R98 main-content heading (upstream fixtures)", () => {
  let browser: Browser;
  let bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(
    html: string,
    options: { rules?: string[]; emitManualOnlyRules?: boolean } = { rules: ["ACT-R98"] },
  ) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>R98 fixture</title></head><body>${html}</body></html>`);
      await page.evaluate(bundle);
      return await page.evaluate(options => {
        const before = document.documentElement.outerHTML;
        const result = (window as any).__ampera.runAllRules(options);
        return {
          issues: result.issues.filter((issue: any) => issue.ruleId === "ACT-R98"),
          stats: result.stats.filter((stat: any) => stat.ruleId === "ACT-R98"),
          status: result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R98"),
          unchanged: before === document.documentElement.outerHTML,
        };
      }, options);
    } finally { await page.close(); }
  }

  it.each([
    '<main><h1>Start</h1><p>Content</p></main>',
    '<div role="main"><div role="heading" aria-level="2">Start</div><p>Content</p></div>',
    '<main><div><span></span><h2>Start</h2></div><p>Content</p></main>',
    '<main><img src="data:," alt=""><h1>Start</h1><p>Content</p></main>',
    '<main><h1><img src="data:," alt="Title"></h1><p>Content</p></main>',
    '<main><p>Missing heading</p></main><main><h1>Start</h1><p>Content</p></main>',
    '<main><p hidden>Hidden content</p><h1>Start</h1></main>',
    '<main><p aria-hidden="true">Excluded content</p><h1>Start</h1></main>',
  ])("passes a semantic heading at the start: %s", async html => {
    const result = await scan(html);
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([{ ruleId: "ACT-R98", totalChecked: 1, scope: "page" }]);
    expect(result.unchanged).toBe(true);
  });

  it.each([
    '<main><p>Content before heading</p><h1>Late</h1></main>',
    '<main><span role="presentation">Content before heading</span><h1>Late</h1></main>',
    '<main><strong style="font-size:24px">Not a heading</strong></main>',
    '<nav><h1>Navigation heading</h1></nav><main><p>No heading</p></main>',
    '<main aria-label="Main content"><p>No heading</p></main>',
    '<h1 id="title">Outside main</h1><main aria-labelledby="title"><p>No heading</p></main>',
    '<main><h1 aria-hidden="true">Excluded heading</h1><p>Content</p></main>',
    '<main><h1 style="display:none">Hidden heading</h1><p>Content</p></main>',
    '<main><h1 role="button">Overridden heading role</h1><p>Content</p></main>',
    '<main><img src="data:," alt="Content before heading"><h1>Late</h1></main>',
    '<main><input aria-label="Search"><h1>Late</h1></main>',
    '<main><p>No heading</p></main><main><p>No heading either</p></main>',
  ])("reports one page-level failure for identified main content: %s", async html => {
    const result = await scan(html);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ type: "Issue", selector: "html" });
    expect(result.stats).toEqual([{ ruleId: "ACT-R98", totalChecked: 1, scope: "page" }]);
    expect(result.unchanged).toBe(true);
  });

  it("treats AU-style div#main as undetermined, not a confirmed failure", async () => {
    const html = '<nav aria-label="Demo site menu">Menu</nav><div id="main"><div class="heading">Welcome!</div><p>Content</p></div>';
    const normal = await scan(html, {});
    const selected = await scan(html);
    expect(normal.issues).toEqual([]);
    expect(selected).toMatchObject({
      issues: normal.issues, stats: normal.stats, status: normal.status,
    });
    expect(selected.unchanged).toBe(true);
  });

  it.each([
    {},
    { rules: ["ACT-R98"] },
    { emitManualOnlyRules: true },
    { rules: ["ACT-R98"], emitManualOnlyRules: true },
    { rules: ["ACT-R98", "ACT-R100"] },
    { rules: ["ACT-R98", "ACT-R100"], emitManualOnlyRules: true },
  ])("does not manufacture a finding for an unanswered main-content question: %j", async options => {
    for (const html of [
      '<article><h1>Title</h1><p>Content</p></article>',
      '<div id="main"><div class="heading">Welcome!</div><p>Content</p></div>',
      '<nav>Navigation</nav><section aria-label="Region">Content</section>',
    ]) {
      const result = await scan(html, options);
      expect(result.issues).toEqual([]);
      expect(result.stats).toEqual([{ ruleId: "ACT-R98", totalChecked: 1, scope: "page" }]);
      // Whole-suite scans include unrelated DOM-mutating rules. R98 alone
      // must be non-mutating; compare only R98 outputs between scan modes.
      if (options.rules?.length === 1) expect(result.unchanged).toBe(true);
    }
  });

  it.each([
    '<main><h1>Start</h1><p>Content</p></main>',
    '<main><p>Content before heading</p><h1>Late</h1></main>',
    '<main aria-label="Content"><p>No heading</p></main>',
    '<main><h1 aria-hidden="true">Excluded</h1><p>Content</p></main>',
    '<div role="main"><div role="heading" aria-level="2">Start</div></div>',
    '<main><img src="data:," alt=""><h1>Start</h1></main>',
    '<main><p>No heading</p></main><main><h1>Start</h1></main>',
  ])("keeps normal and explicit R98 detection identical: %s", async html => {
    const normal = await scan(html, {});
    const expected = { issues: normal.issues, stats: normal.stats, status: normal.status };
    expect(await scan(html)).toMatchObject(expected);
    expect(await scan(html, { rules: ["ACT-R98"], emitManualOnlyRules: true })).toMatchObject(expected);
  });

  it("does not treat every nav/section/aside as a main-content region", async () => {
    const html = '<nav>Navigation</nav><section>Section</section><aside>Aside</aside><main><h1>Main heading</h1></main>';
    expect((await scan(html)).issues).toEqual([]);
  });

  it("runs deterministic checks in ordinary scans and preserves explicit selection", async () => {
    const html = '<main><p>Content without a heading</p></main>';
    const normal = await scan(html, {});
    expect(normal.issues[0].type).toBe("Issue");
    expect(normal.status).toMatchObject({ status: "executed", executionTier: "automatic" });
    const excluded = await scan(html, { rules: ["ACT-R79"], emitManualOnlyRules: true });
    expect(excluded.issues).toEqual([]);
    expect(excluded.stats).toEqual([]);
    expect(excluded.status.status).toBe("not-selected");
    expect((await scan('<div id="main">Content</div>', { emitManualOnlyRules: true })).issues).toEqual([]);
  });

  it("traverses the flat tree through a shadow root and slot", async () => {
    const html = `<div id="host"><h1 slot="title">Start</h1></div>
      <script>document.getElementById("host").attachShadow({mode:"open"}).innerHTML =
      '<main><slot name="title"></slot><p>Content</p></main>';</script>`;
    expect((await scan(html)).issues).toEqual([]);
  });

  it("is inapplicable to standalone SVG documents", async () => {
    const page = await browser.newPage();
    try {
      await page.goto("data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><title>SVG</title></svg>'));
      await page.evaluate(bundle);
      const result = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R98"] }));
      expect(result.issues).toEqual([]);
      expect(result.stats).toEqual([]);
      expect(result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R98").status).toBe("not-applicable");
    } finally { await page.close(); }
  });
});
