import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ScanRawResult } from "../types";
import { RULE_REGISTRY } from "../registry";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("custom list and access-key rules", () => {
  let browser: Browser, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function scan(html: string, rules?: string[], shadow?: string) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Rules</title></head><body>${html}</body></html>`);
      if (shadow) await page.evaluate(content => {
        document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML = content;
      }, shadow);
      await page.addScriptTag({ content: bundle });
      return await page.evaluate(selected => {
        const before = document.documentElement.outerHTML;
        const result = (window as any).__ampera.runAllRules({ rules: selected }) as {
          issues: ScanRawResult[];
          stats: { ruleId: string; totalChecked: number }[];
          ruleStatuses: { ruleId: string; status: string }[];
        };
        return { ...result, unchanged: before === document.documentElement.outerHTML };
      }, rules);
    } finally { await page.close(); }
  }
  it.each([
    "<ul><li>One</li><li>Two</li></ul>",
    "<ol><li>One<ul><li>Nested</li></ul></li></ol>",
    "<dl><dt>Term</dt><dd>Definition</dd><dt>Other</dt><dd>Definition</dd></dl>",
    "<dl><dt>A</dt><dt>B</dt><dd>One</dd><dd>Two</dd></dl>",
    "<dl><div><dt>A</dt><dd>B</dd></div><div><dt>C</dt><dd>D</dd></div></dl>",
    "<ul><script>void 0</script><template><div>Not active</div></template><li>Valid</li></ul>",
    "<ul></ul><ol></ol><dl></dl>",
    "<ul><li>Valid</li><div hidden>Hidden</div><div aria-hidden='true'>Hidden</div><div inert>Inert</div><div style='display:none'>Hidden</div></ul>",
  ])("accepts valid or excluded list content: %s", async html => {
    expect((await scan(html, ["ACT-R130"])).issues).toEqual([]);
  });
  it.each([
    "<ul><div>Wrong child</div></ul>",
    "<ol><div role='listitem'>Not li</div></ol>",
    "<ul>Unwrapped text<li>Item</li></ul>",
    "<dl><dd>Leading description</dd><dt>Term</dt><dd>Definition</dd></dl>",
    "<dl><dt>A</dt><dd>B</dd><dt>Trailing term</dt></dl>",
    "<dl><div><dt>A</dt><dd>B</dd></div><dt>C</dt><dd>D</dd></dl>",
    "<dl><div><dt>A</dt><dd>B</dd><dt>C</dt><dd>D</dd></div></dl>",
    "<dl><div><dd>No term</dd></div></dl>",
    "<dl><div><dt>No description</dt></div></dl>",
    "<dl><div>Direct text<dt>A</dt><dd>B</dd></div></dl>",
    "<dl><div><div role='term'>A</div><dd>B</dd></div></dl>",
    "<ul><slot></slot><li>Valid</li></ul>",
  ])("reports invalid list structure: %s", async html => {
    const result = await scan(html, ["ACT-R130"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ ruleId: "ACT-R130", type: "Issue", impact: "serious" });
    expect(result.unchanged).toBe(true);
  });
  it("excludes inaccessible and explicitly presentational lists", async () => {
    const result = await scan("<ul aria-hidden='true'><div>Bad</div></ul><ol inert><div>Bad</div></ol><dl hidden><div>Bad</div></dl><ul role='presentation'><div>Bad</div></ul><ul role='none'><div>Bad</div></ul>", ["ACT-R130"]);
    expect(result.issues).toEqual([]);
    expect(result.stats.find(stat => stat.ruleId === "ACT-R130")?.totalChecked).toBe(0);
    expect(result.ruleStatuses.find(stat => stat.ruleId === "ACT-R130")?.status).toBe("not-applicable");
  });
  it("honors the first recognized explicit role rather than later fallback roles", async () => {
    expect((await scan("<ul role='list none'><div>Bad</div></ul><ul role='unknown presentation'><div>Excluded</div></ul>", ["ACT-R130"])).issues).toHaveLength(1);
  });
  it("checks open shadow trees and slotted native list children", async () => {
    expect((await scan('<div id="host"><li>Slotted</li></div>', ["ACT-R130"],
      "<ul><slot></slot></ul>")).issues).toEqual([]);
    expect((await scan('<div id="host"><div role="listitem">Invalid</div></div>', ["ACT-R130"],
      "<ul><slot></slot></ul>")).issues).toHaveLength(1);
    expect((await scan('<div id="host"></div>', ["ACT-R130"],
      "<dl><div><dt>A</dt></div></dl>")).issues).toHaveLength(1);
  });
  it("accepts unique single-character tokens, empty keys and hidden competition", async () => {
    const result = await scan('<a href="#" accesskey="a b">A</a><button accesskey="c">C</button><button accesskey="  ">Empty</button><div style="display:none"><button accesskey="a">Hidden</button></div><input type="hidden" accesskey="b">', ["ACT-R131"]);
    expect(result.issues).toEqual([]);
    expect(result.stats.find(stat => stat.ruleId === "ACT-R131")?.totalChecked).toBe(2);
  });
  it("reports both competing elements, case-insensitively", async () => {
    const result = await scan('<a id="one" href="#" accesskey="a b">A</a><button id="two" accesskey="A">B</button>', ["ACT-R131"]);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every(issue => issue.type === "Best Practice" && issue.description.includes("another rendered element"))).toBe(true);
    expect(result.unchanged).toBe(true);
  });
  it("does not confuse an intra-element repeat with a cross-element conflict", async () => {
    const result = await scan('<button accesskey="a A a">Repeat</button>', ["ACT-R131"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].description).toContain("repeated within");
    expect(result.issues[0].description).not.toContain("another rendered");
  });
  it("checks all three failures on the same occurrence", async () => {
    const result = await scan('<button id="bad" accesskey="aa AA">Bad</button><button accesskey="aa">Other</button>', ["ACT-R131"]);
    const issue = result.issues.find(row => row.selector === "button#bad")!;
    expect(issue.description).toContain("another rendered");
    expect(issue.description).toContain("single characters");
    expect(issue.description).toContain("repeated within");
  });
  it("matches Alfa whitespace tokenization including non-breaking spaces", async () => {
    expect((await scan('<button accesskey="a&#9;b&#10;c&#12;d&#13;e">Valid</button>', ["ACT-R131"])).issues).toEqual([]);
    expect((await scan('<button accesskey="a&nbsp;b">Valid</button>', ["ACT-R131"])).issues).toEqual([]);
    expect((await scan('<button accesskey="a&nbsp;A">Repeated</button>', ["ACT-R131"])).issues).toHaveLength(1);
  });
  it.each([
    '<ul><p style="visibility:hidden">Still a structural child</p></ul>',
    '<ul style="visibility:hidden"><div>Invalid</div></ul>',
    '<ul role="none" tabindex="-1"><div>Presentational role conflicts with focusability</div></ul>',
    '<ul role="presentation" aria-label="List"><div>Role conflicts with global ARIA</div></ul>',
    '<ul role="none" aria-hidden="false"><div>Role conflicts with global ARIA</div></ul>',
    '<ul role="generic none"><div>First recognized role is not presentational</div></ul>',
  ])("matches upstream list applicability: %s", async html => {
    expect((await scan(html, ["ACT-R130"])).issues).toHaveLength(1);
  });
  it("treats Unicode whitespace as whitespace in direct list text", async () => {
    expect((await scan('<ul>&nbsp;&#x2003;&#xFEFF;<li>Valid</li></ul>', ["ACT-R130"])).issues).toEqual([]);
    expect((await scan('<ul role="NoNe"><div>Excluded</div></ul>', ["ACT-R130"])).issues).toEqual([]);
  });
  it("uses accessibility ownership for hidden children without accepting owned children as valid HTML content", async () => {
    expect((await scan('<div aria-hidden="true" aria-owns="bad"></div><ul><div id="bad">Owned by hidden owner</div><li>Valid</li></ul>', ["ACT-R130"])).issues).toEqual([]);
    expect((await scan('<div aria-owns="bad"></div><div aria-hidden="true"><ul id="bad"><div>Accessible by ownership</div></ul></div>', ["ACT-R130"])).issues).toHaveLength(1);
  });
  it("does not skip a list just because hidden/content-visibility is overridden or offscreen", async () => {
    const result = await scan('<ul hidden style="display:block"><div>Bad</div></ul><ul style="content-visibility:hidden"><div>Bad</div></ul><ul style="position:absolute;left:-99999px"><div>Bad</div></ul>', ["ACT-R130"]);
    expect(result.issues).toHaveLength(3);
  });
  it("does not count legacy media fallback access keys", async () => {
    expect((await scan('<button accesskey="a">Valid</button><video><button accesskey="a">Fallback</button></video><audio><button accesskey="aa">Fallback</button></audio>', ["ACT-R131"])).issues).toEqual([]);
  });
  it("keeps Japanese keys, repeated keys and UTF-16 character length aligned", async () => {
    expect((await scan('<button accesskey="ぬ め">Valid</button>', ["ACT-R131"])).issues).toEqual([]);
    const result = await scan('<button accesskey="ぬ ぬ ほす">Invalid</button>', ["ACT-R131"]);
    expect(result.issues[0].description).toContain('["ぬ"]');
    expect(result.issues[0].description).toContain('["ほす"]');
    // Upstream token.length === 1 deliberately counts UTF-16 code units.
    expect((await scan('<button accesskey="😀">Two code units</button>', ["ACT-R131"])).issues).toHaveLength(1);
  });
  it("retains rendered aria-hidden and inert competitors and shadow-tree keys", async () => {
    const result = await scan('<button accesskey="a">A</button><button aria-hidden="true" accesskey="A">Hidden from AT</button><button inert accesskey="a">Inert</button><div id="host"></div>', ["ACT-R131"], '<button accesskey="A">Shadow</button>');
    expect(result.issues).toHaveLength(4);
  });
  it("keeps selection, statistics and execution status independent", async () => {
    const html = '<ul><div>Bad</div></ul><button accesskey="aa">Bad</button>';
    for (const id of ["ACT-R130", "ACT-R131"]) {
      const result = await scan(html, [id]);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].ruleId).toBe(id);
      expect(result.stats).toEqual([{ ruleId: id, totalChecked: 1, scope: "element" }]);
      expect(result.ruleStatuses.find(stat => stat.ruleId === id)?.status).toBe("executed");
      expect(result.ruleStatuses.find(stat => stat.ruleId === (id === "ACT-R130" ? "ACT-R131" : "ACT-R130"))?.status).toBe("not-selected");
    }
    const standard = await scan(html, undefined);
    expect(standard.issues.filter(row => ["ACT-R130", "ACT-R131"].includes(row.ruleId))).toHaveLength(2);
  });
  it("exposes custom documentation and keeps access-key findings outside WCAG failures", async () => {
    const metadata = buildSync({
      entryPoints: [fileURLToPath(new URL("../../../../../accessibility-scanner/src/lib/actRules.ts", import.meta.url))],
      bundle: true, write: false, platform: "node", format: "esm",
    }).outputFiles[0].text;
    const { ACT_RULES } = await import(`data:text/javascript;base64,${Buffer.from(metadata).toString("base64")}`);
    expect(ACT_RULES["ACT-R130"]).toMatchObject({ custom: true, wcagCriteria: ["1.3.1"], wcagLevel: ["A"], ruleType: "Issue" });
    expect(ACT_RULES["ACT-R131"]).toMatchObject({ custom: true, wcagCriteria: [], wcagLevel: ["Best Practice"], ruleType: "Best Practice", ada: false, eaa: false });
    const api = readFileSync(fileURLToPath(new URL("../../scanner.ts", import.meta.url)), "utf8");
    expect(api).toContain('"ACT-R130": { sc: ["1.3.1"], level: ["A"] }');
    expect(api).toContain('"ACT-R131": { sc: [], level: ["Best Practice"] }');
    const picker = readFileSync(fileURLToPath(new URL("../../../../../accessibility-scanner/src/pages/home.tsx", import.meta.url)), "utf8");
    for (const id of ["ACT-R130", "ACT-R131"]) {
      expect(picker).toContain(`id: "${id}"`);
      expect(RULE_REGISTRY.find(rule => rule.id === id)).toMatchObject({ manual: false, executionTier: "automatic" });
    }
  });
});
