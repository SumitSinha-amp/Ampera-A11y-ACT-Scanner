import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}
describe.skipIf(!existsSync(chromium))("ACT-R100 main-content instrument", () => {
  let browser: Browser;
  let bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, options: { rules?: string[]; emitManualOnlyRules?: boolean } = { rules: ["ACT-R100"] }) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Instrument fixture</title></head><body>${html}</body></html>`);
      await page.evaluate(bundle);
      return await page.evaluate((options) => {
        const before = document.documentElement.outerHTML;
        const result = (window as any).__ampera.runAllRules(options);
        return {
          issues: result.issues.filter((issue: any) => issue.ruleId === "ACT-R100"),
          stats: result.stats.filter((stat: any) => stat.ruleId === "ACT-R100"),
          status: result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R100"),
          unchanged: before === document.documentElement.outerHTML,
        };
      }, options);
    } finally { await page.close(); }
  }

  const main = '<main id="main"><h1>Chapter one</h1><p>Main content.</p></main>';

  it("passes the official first skip-link example", async () => {
    const result = await scan('<a href="#main">Skip to main content</a><a href="./chapter2.html">Read chapter two</a><aside>About the book</aside>' + main);
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([{ ruleId: "ACT-R100", totalChecked: 1, scope: "page" }]);
    expect(result.status).toMatchObject({ status: "executed", executionTier: "manual" });
    expect(result.unchanged).toBe(true);
  });

  it("passes official navigation-group and later repeated-block examples", async () => {
    expect((await scan('<nav><a href="#bio">Biography</a><a href="#about">About</a><a href="#main">Go</a></nav><aside id="bio">Biography</aside><aside id="about">About</aside>' + main)).issues).toEqual([]);
    expect((await scan('<aside><a href="#about">About</a><p>Biography</p></aside><aside id="about"><a href="#main">Continue</a><p>About the book</p></aside>' + main)).issues).toEqual([]);
  });

  it("passes the official literal scripted-button example without activating it", async () => {
    const result = await scan('<button onclick="location.assign(\'#main\')">Skip to main content</button><aside>About the book</aside>' + main);
    expect(result.issues).toEqual([]);
    expect(result.unchanged).toBe(true);
  });

  it("asks one page-level review question for the official no-instrument example", async () => {
    const result = await scan('<a href="./chapter2.html">Read chapter two</a><aside>About the book</aside>' + main);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ type: "Potential Issue", selector: "html", ruleId: "ACT-R100" });
    expect(result.issues[0].description).toContain("moves focus to the start");
    expect(result.stats[0]).toMatchObject({ totalChecked: 1, scope: "page" });
  });

  it("does not require English skip wording or an arbitrary early position", async () => {
    expect((await scan(Array.from({ length: 9 }, () => '<a href="/other">Other</a>').join("") + '<a href="#main">Aller au contenu principal</a>' + main)).issues).toEqual([]);
  });

  it("recognizes a landmark role and targets at the start, not later content", async () => {
    expect((await scan('<a href="#heading">Go</a><div role="main"><h1 id="heading">Start</h1><p>Content</p></div>')).issues).toEqual([]);
    expect((await scan('<a href="#later">Go</a><main><h1>Start</h1><p id="later">Later content</p></main>')).issues).toHaveLength(1);
  });

  it("recognizes empty anchors immediately before main, but not before intervening content", async () => {
    expect((await scan('<a href="#start">Go</a><a id="start"></a>' + main)).issues).toEqual([]);
    expect((await scan('<a href="#start">Go</a><a id="start"></a><p>Other content intervenes</p>' + main)).issues).toHaveLength(1);
  });

  it("recognizes focus-revealed offscreen links and encoded fragments", async () => {
    expect((await scan('<a style="position:absolute;left:-10000px" href="#main%20content">Go</a><main id="main content">Main content</main>')).issues).toEqual([]);
  });

  it("recognizes absolute same-document fragments but rejects other documents and broken fragments", async () => {
    expect((await scan('<a href="about:blank#main">Go</a>' + main)).issues).toEqual([]);
    for (const href of ["https://other.example/#main", "#missing", "#%ZZ"]) {
      expect((await scan(`<a href="${href}">Go</a>` + main)).issues).toHaveLength(1);
    }
  });

  it("does not mistake hidden, disabled, downloading, or new-window controls for instruments", async () => {
    for (const attributes of ["hidden", 'style="display:none"', 'aria-hidden="true"', 'aria-disabled="true"', "inert", "download", 'target="_blank"']) {
      expect((await scan(`<a href="#main" ${attributes}>Go</a>` + main)).issues).toHaveLength(1);
    }
  });

  it("requires literal focus() targets to be focusable and leaves complex scripting for review", async () => {
    expect((await scan('<button onclick="document.getElementById(\'main\').focus()">Go</button><main id="main" tabindex="-1">Content</main>')).issues).toEqual([]);
    expect((await scan('<button onclick="document.getElementById(\'main\').focus()">Go</button>' + main)).issues).toHaveLength(1);
    expect((await scan('<button onclick="window.location.assign(\'#main\')">Go</button>' + main)).issues).toEqual([]);
    expect((await scan('<button onclick="if(false)location.assign(\'#main\')">Go</button>' + main)).issues).toHaveLength(1);
    expect((await scan('<a href="#main" onclick="return false">Go</a>' + main)).issues).toHaveLength(1);
  });

  it("does not turn lack of a main landmark into a definite failure", async () => {
    const result = await scan('<a href="#content">Go</a><div id="content"><h1>Article</h1><p>Content</p></div>');
    expect(result.issues[0].type).toBe("Potential Issue");
    expect(result.issues[0].elementContext).toContain("locate the main content manually");
  });

  it("does not check PDFs or count target=_blank links", async () => {
    const result = await scan('<a href="#main">Go</a><a href="/untagged.pdf">Untagged PDF</a><a href="/tagged.pdf">Tagged PDF</a><a href="/other" target="_blank">Other</a>' + main);
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([{ ruleId: "ACT-R100", totalChecked: 1, scope: "page" }]);
  });

  it("preserves manual-review gating and explicit rule selection", async () => {
    expect((await scan(main, {})).issues).toEqual([]);
    expect((await scan(main, { emitManualOnlyRules: true })).issues).toHaveLength(1);
    const excluded = await scan(main, { rules: ["ACT-R79"], emitManualOnlyRules: true });
    expect(excluded.issues).toEqual([]);
    expect(excluded.stats).toEqual([]);
    expect(excluded.status.status).toBe("not-selected");
  });

  it("is inapplicable to standalone SVG documents", async () => {
    const page = await browser.newPage();
    try {
      await page.goto("data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><title>SVG</title></svg>'));
      await page.evaluate(bundle);
      const result = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R100"] }));
      expect(result.issues).toEqual([]);
      expect(result.stats).toEqual([]);
      expect(result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R100").status).toBe("not-applicable");
    } finally { await page.close(); }
  });

  it("retains the requested WCAG 2.4.1 Level A mapping in server and client metadata", () => {
    const scanner = readFileSync(fileURLToPath(new URL("../../scanner.ts", import.meta.url)), "utf8");
    const client = readFileSync(fileURLToPath(new URL("../../../../../accessibility-scanner/src/lib/actRules.ts", import.meta.url)), "utf8");
    for (const source of [scanner, client]) {
      expect(source).toContain('"ACT-R100": { sc: ["2.4.1"], level: ["A"] }');
    }
  });
});
