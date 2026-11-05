import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R89 enhanced link contrast", () => {
  let browser: Browser, page: Page, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function scan(html: string, rules: string[] | undefined = ["ACT-R89"]) {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Enhanced contrast</title></head><body>${html}</body></html>`);
    await page.evaluate(bundle);
    return page.evaluate(rules => {
      const before = document.documentElement.outerHTML;
      const result = (window as any).__ampera.runAllRules({ rules });
      return {
        issues: result.issues.filter((i: any) => ["ACT-R88", "ACT-R89"].includes(i.ruleId)),
        stats: result.stats.filter((s: any) => ["ACT-R88", "ACT-R89"].includes(s.ruleId)),
        unchanged: before === document.documentElement.outerHTML,
        candidates: (window as any).__amperaContrastCandidates,
      };
    }, rules);
  }
  it("passes the official dark-grey example", async () => {
    expect((await scan('<a href="#" style="color:#333;background:white">Some link</a>')).issues).toEqual([]);
  });
  it("fails 5.74:1 text for AAA without falsely failing AA", async () => {
    const r = await scan('<a href="#" style="color:#666;background:white">Some link</a>', ["ACT-R88", "ACT-R89"]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ ruleId: "ACT-R89", type: "Issue" });
    expect(r.issues[0].description).toContain("minimum 7:1");
  });
  it.each(["hover", "focus", "visited"])("finds an enhanced-only failure in the authored %s state", async state => {
    const r = await scan(`<style>a{color:#333;background:white}a:${state}{color:#666}</style><a href="#">State link</a>`);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].description).toContain("5.74:1");
    expect(r.unchanged).toBe(true);
  });
  it("uses 4.5:1 for large text, not a blanket 7:1 threshold", async () => {
    expect((await scan('<a href="#" style="color:black;background:#777;font-size:18pt">Large link</a>')).issues).toEqual([]);
    expect((await scan('<a href="#" style="color:#888;background:white;font-size:14pt;font-weight:700">Large bold</a>')).issues[0].description).toContain("minimum 4.5:1");
  });
  it("checks separate text nodes, including single characters and punctuation", async () => {
    const r = await scan('<a href="#" style="color:#666;background:white">X<span>!</span>tail</a>');
    expect(r.issues).toHaveLength(3);
    expect(r.stats).toEqual([{ ruleId: "ACT-R89", totalChecked: 3, scope: "element" }]);
  });
  it("does not skip visually visible aria-hidden link text", async () => {
    expect((await scan('<a href="#" aria-hidden="true" style="color:#666;background:white">Visible</a>')).issues).toHaveLength(1);
  });
  it("excludes disabled, hidden, no-href and ARIA-only links", async () => {
    expect((await scan('<a hidden href="#">Hidden</a><a href="#" aria-disabled="true">Disabled</a><a>No href</a><span role="link">ARIA only</span>')).issues).toEqual([]);
  });
  it("keeps unknown photographic/gradient backdrops as review, without legacy pixel candidates", async () => {
    const r = await scan('<a href="#" style="color:white;background-image:linear-gradient(white,black)">Review</a>');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ ruleId: "ACT-R89", type: "Potential Issue" });
    expect(r.candidates).toEqual([]);
  });
  it("checks below-fold links in inner scrollers", async () => {
    const r = await scan('<div style="height:100px;overflow:auto"><div style="height:1200px"></div><a href="#" style="color:#666;background:white">Below fold</a></div>');
    expect(r.issues).toHaveLength(1);
  });
  it("has no 200-occurrence legacy cap and restores all markup", async () => {
    const r = await scan(Array(205).fill('<a href="#" style="color:#666;background:white">Link</a>').join(" "));
    expect(r.issues).toHaveLength(205);
    expect(r.unchanged).toBe(true);
  });
  it("preserves independent explicit rule selection", async () => {
    const html = '<a href="#" style="color:#666;background:white">Link</a>';
    expect((await scan(html, ["ACT-R88"])).issues).toEqual([]);
    expect((await scan(html, ["ACT-R66"])).issues).toEqual([]);
  });
});
