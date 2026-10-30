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

describe.skipIf(!existsSync(chromium))("ACT-R78 Siteimprove heading-section content", () => {
  let browser: Browser;
  let engine: string;
  beforeAll(async () => {
    engine = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, rules: string[] | null = ["ACT-R78"]) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Section content</title></head><body>${html}</body></html>`);
      await page.evaluate(engine);
      return await page.evaluate((rules) => {
        const before = document.body.innerHTML;
        const result = (window as any).__ampera.runAllRules({ rules: rules ?? undefined });
        return {
          issues: result.issues.filter((issue: any) => issue.ruleId === "ACT-R78"),
          stats: result.stats.filter((stat: any) => stat.ruleId === "ACT-R78"),
          unchanged: before === document.body.innerHTML,
        };
      }, rules);
    } finally { await page.close(); }
  }

  const selectors = (result: Awaited<ReturnType<typeof scan>>) =>
    result.issues.map((issue: { selector: string }) => issue.selector);

  // These first fixtures mirror upstream sia-r78/rule.spec.tsx outcomes.
  it("passes nested heading hierarchies when accessible content follows", async () => {
    const result = await scan('<h1>Part one</h1><h2>Chapter one</h2><h3>Section 1</h3>content<h1>Part two</h1><h2>Chapter one</h2>content<h2>Chapter two</h2><h3>Section one</h3>content');
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([{ ruleId: "ACT-R78", totalChecked: 7, scope: "element" }]);
    expect(result.unchanged).toBe(true);
  });

  it("matches upstream failures for a hierarchy with no body content", async () => {
    const result = await scan('<h1 id="p1">Part one</h1><h1 id="p2">Part two</h1><h2 id="c21">Chapter one</h2><h1 id="p3">Part three</h1><h2 id="c31">Chapter one</h2><h2 id="c32">Chapter two</h2><h3 id="s321">Section one</h3>');
    expect(selectors(result)).toEqual(["h1#p1", "h2#c21", "h2#c31", "h3#s321"]);
    expect(result.issues.every((issue: any) => issue.type === "Issue")).toBe(true);
  });

  it("counts clipped and transparent accessible content", async () => {
    expect((await scan('<h1>One</h1><div style="height:0;width:0;overflow:hidden">Content</div><h1>Two</h1><p style="opacity:0">More content</p>')).issues).toEqual([]);
  });

  it("does not mistake a structural wrapper for content before its heading", async () => {
    expect(selectors(await scan('<h1 id="one">Hello</h1><nav aria-label="site"><h1 id="two">Navigation</h1><a href="#">Foo</a></nav>'))).toEqual(["h1#one"]);
  });

  it("ignores whitespace and the heading's own subtree", async () => {
    expect(selectors(await scan('<h1 id="one"><span>Hello</span></h1> \n\t <h1 id="two">World</h1>'))).toEqual(["h1#one", "h1#two"]);
  });

  it("is inapplicable without accessible semantic headings", async () => {
    const result = await scan('<div>Content</div><h1 aria-hidden="true">Hidden</h1><h2 style="display:none">Hidden</h2><h3 role="button">Not a heading</h3>');
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([]);
  });

  it("excludes headings containing semantic buttons or links", async () => {
    const result = await scan('<h1><button>Accordion</button></h1><h2><a href="#">News link</a></h2><h2><span role="button">Custom button</span></h2>');
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([]);
  });

  it("excludes a closed-details summary heading but includes an open one", async () => {
    const result = await scan('<details><summary><h1>Closed</h1></summary><p>Hidden</p></details><details open><summary><h1 id="open">Open</h1></summary></details>');
    expect(selectors(result)).toEqual(["h1#open"]);
    expect(result.stats[0].totalChecked).toBe(1);
  });

  it("counts content in a shadow root between document headings", async () => {
    expect(selectors(await scan('<h1 id="one">Introduction</h1><div id="host"></div><h1 id="two">Conclusion</h1><script>document.getElementById("host").attachShadow({mode:"open"}).innerHTML="<p>Content</p>"</script>'))).toEqual(["h1#two"]);
  });

  it("finds shadow headings and follows their section across the shadow boundary", async () => {
    expect((await scan('<div id="host"></div><h1>Conclusion</h1><p>More content</p><script>document.getElementById("host").attachShadow({mode:"open"}).innerHTML="<h1>Introduction</h1><p>Content</p>"</script>')).issues).toEqual([]);
  });

  it("uses ARIA heading levels including native overrides", async () => {
    expect(selectors(await scan('<div role="heading" aria-level="2" id="first">First</div><h6 aria-level="2" id="second">Second</h6><p>Content</p>'))).toEqual(["div#first"]);
  });

  it("finds content outside the heading's immediate parent", async () => {
    expect((await scan('<section><header><h2>Section</h2></header><p>Content</p></section>')).issues).toEqual([]);
  });

  it("does not count aria-hidden, CSS-hidden, inert or script text", async () => {
    expect(selectors(await scan('<h2 id="empty">Empty</h2><p aria-hidden="true">Hidden</p><p hidden>Hidden</p><p inert>Hidden</p><script>window.testValue="Not content"</script>'))).toEqual(["h2#empty"]);
  });

  it("counts replaced accessible content and text within presentational wrappers", async () => {
    expect((await scan('<h2>Image</h2><img alt="Map" src="data:image/png,invalid"><h2>Input</h2><input aria-label="Name"><h2>Text</h2><div role="none">Accessible text</div>')).issues).toEqual([]);
  });

  it("does not confuse missing heading text with missing section content", async () => {
    expect((await scan('<h2></h2><p>Content still follows the empty heading</p>')).issues).toEqual([]);
  });

  it("runs automatically while respecting explicit rule selection", async () => {
    expect(selectors(await scan('<h2 id="empty">Empty</h2>', null))).toEqual(["h2#empty"]);
    expect((await scan('<h2>Empty</h2>', ["ACT-R4"])).issues).toEqual([]);
  });

  it("retains the product Issue classification and WCAG 2.4.6 AA mappings", () => {
    const scanner = readFileSync(fileURLToPath(new URL("../../scanner.ts", import.meta.url)), "utf8");
    expect(scanner).toContain('"ACT-R78": { sc: ["2.4.6"], level: ["AA"] }');
    expect(scanner).toMatch(/"ACT-R78":\s*{\s*type: "Issue"/);
    const clientRules = readFileSync(fileURLToPath(new URL("../../../../../accessibility-scanner/src/lib/actRules.ts", import.meta.url)), "utf8");
    expect(clientRules).toContain('"ACT-R78": { sc: ["2.4.6"], level: ["AA"] }');
  });
});
