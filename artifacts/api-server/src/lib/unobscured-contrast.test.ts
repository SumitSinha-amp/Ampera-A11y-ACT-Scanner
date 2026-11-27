import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findContrastOverlayClose, scanUnobscuredContrast } from "./unobscured-contrast";
import type { ScanIssue } from "./scanner";

describe("Unobscured ACT-R69 states", () => {
  let browser: Browser, page: Page, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({ entryPoints: [fileURLToPath(new URL("./browser/index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife" }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 800 });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  const content = '<style>body{background:white}p{color:#11a670;font:500 10px Arial}input{background:white;font-size:16px}input::placeholder{color:#b3b3b3;opacity:1}</style><p id="promotion">Extra baggage, discounts</p><input id="from" placeholder="Where from?">';
  const modal = (control = '<button type="button" aria-label="Close dialog">×</button>', extra = "") =>
    `<div id="overlay" role="dialog" style="position:fixed;inset:0;background:white;z-index:100">${control}${extra}</div>
    <script>document.querySelector('#overlay').addEventListener('click',e=>{if(e.target.closest('[aria-label="Close dialog"],[data-testid="closeIcon"]'))document.querySelector('#overlay').remove()})</script>`;
  async function load(html: string) {
    await page.setContent(content + html);
    await page.evaluate(bundle);
  }
  async function scan() {
    return page.evaluate(() => {
      const r = (window as any).__ampera.runAllRules({ rules: ["ACT-R69"] });
      return { issues: r.issues as ScanIssue[], stats: r.stats };
    });
  }
  function options(baseline: ScanIssue[]) {
    return { baseline, scan, capture: async () => ({
      screenshot: Buffer.from(await page.screenshot({ type: "jpeg" })).toString("base64"),
      pageHtml: await page.content(),
    }) };
  }
  it("preserves the original overlay findings and links confirmed failures to new evidence", async () => {
    await load(modal());
    const baseline = (await scan()).issues;
    const original = JSON.stringify(baseline);
    expect(baseline.filter(i => i.selector === "p#promotion" || i.selector === "input#from")
      .every(i => i.type === "Potential Issue")).toBe(true);
    const baselineHtml = await page.content();
    const result = await scanUnobscuredContrast(page, options(baseline));
    expect(result.error).toBeUndefined();
    expect(JSON.stringify(baseline)).toBe(original);
    expect(baselineHtml).toContain('id="overlay"');
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every(i => i.type === "Issue")).toBe(true);
    expect(result.states).toHaveLength(1);
    expect(result.states[0].screenshot.length).toBeGreaterThan(100);
    expect(result.states[0].pageHtml).not.toContain('<div id="overlay"');
    expect(result.issues.every(i => i.interactionStateKey === result.states[0].key && i.bboxWidth! > 0)).toBe(true);
  });
  it("supports an R103-only scan and keeps widget failures with matching unobscured evidence", async () => {
    await load('<button id="action" style="color:white;background:#ff4f17">Promotion</button>' + modal());
    const widgetScan = async () => page.evaluate(() => {
      const r = (window as any).__ampera.runAllRules({ rules: ["ACT-R103"] });
      return { issues: r.issues as ScanIssue[], stats: r.stats };
    });
    const baseline = (await widgetScan()).issues;
    expect(baseline.some(i => i.selector === "button#action" && i.type === "Potential Issue")).toBe(true);
    const result = await scanUnobscuredContrast(page, { ...options(baseline), scan: widgetScan });
    expect(result.error).toBeUndefined();
    // The empty native field's placeholder is also applicable widget text.
    expect(result.issues).toHaveLength(2);
    const action = result.issues.find(i => i.selector === "button#action")!;
    expect(action).toMatchObject({ ruleId: "ACT-R103", type: "Issue" });
    expect(action.interactionStateKey).toBe(result.states[0].key);
    expect(result.states[0].pageHtml).not.toContain('<div id="overlay"');
  });
  it("recognizes an explicitly named SVG close icon in a non-semantic fixed overlay", async () => {
    await load(modal('<svg data-testid="closeIcon" width="24" height="24"><path d="M0 0L24 24" stroke="black"/></svg>').replace('role="dialog"', ""));
    expect(await findContrastOverlayClose(page)).toMatchObject({ label: "closeIcon" });
    expect((await scanUnobscuredContrast(page, options((await scan()).issues))).issues).toHaveLength(2);
  });
  it.each([
    ['submit', '<form><button aria-label="Close dialog">Close</button></form>'],
    ['explicit submit', '<button type="submit" aria-label="Close dialog">Close</button>'],
    ['navigation', '<a href="/elsewhere" aria-label="Close dialog">Close</a>'],
    ['delete', '<button type="button" aria-label="Delete account" data-testid="closeIcon">Delete</button>'],
    ['consent', '<button type="button">Accept cookies</button>'],
    ['cookie close', '<button type="button" aria-label="Close dialog">Close</button><p>Cookie consent</p>'],
    ['unlabelled', '<button type="button">×</button>'],
  ])("does not activate unsafe or ambiguous %s controls", async (_name, control) => {
    await load(modal(control));
    expect(await findContrastOverlayClose(page)).toBeNull();
    const result = await scanUnobscuredContrast(page, options((await scan()).issues));
    expect(result.issues).toEqual([]);
    expect(await page.$("#overlay")).not.toBeNull();
  });
  it("does not treat an ordinary page close button as a modal", async () => {
    await load('<button type="button" aria-label="Close dialog">Close</button>');
    expect(await findContrastOverlayClose(page)).toBeNull();
  });
  it("does not claim an unobscured state when closing does nothing", async () => {
    await load(modal().replace("<script>", '<script type="text/plain">'));
    const result = await scanUnobscuredContrast(page, options((await scan()).issues));
    expect(result.issues).toEqual([]);
    expect(result.states).toEqual([]);
  });
  it("rescans a settled state if earlier safe exploration already closed the overlay", async () => {
    await load(modal());
    const baseline = (await scan()).issues;
    await page.click('[aria-label="Close dialog"]');
    const result = await scanUnobscuredContrast(page, options(baseline));
    expect(result.issues).toHaveLength(2);
    expect(result.states[0].triggerSelector).toBe("body");
  });
  it("commits no findings without corresponding state evidence", async () => {
    await load(modal());
    const baseline = (await scan()).issues;
    const result = await scanUnobscuredContrast(page, { ...options(baseline),
      capture: async () => { throw new Error("capture failed"); } });
    expect(result.issues).toEqual([]);
    expect(result.states).toEqual([]);
    expect(result.error).toBe("capture failed");
  });
  it("retains uncertainty about an image-backed background after dismissal", async () => {
    await load(modal() + '<style>#promotion{background-image:url(https://invalid.test/image.png)}</style>');
    const result = await scanUnobscuredContrast(page, options((await scan()).issues));
    expect(result.issues.find(i => i.selector === "p#promotion")?.type).toBe("Potential Issue");
  });
  it("caps nested overlay dismissal at two states", async () => {
    await load([0, 1, 2].map(i => `<div id="layer${i}" role="dialog" style="position:fixed;inset:0;background:white;z-index:${100 + i}"><button type="button" aria-label="Close dialog" onclick="this.parentElement.remove()">Close</button><p>Layer ${i}</p></div>`).join(""));
    const result = await scanUnobscuredContrast(page, options((await scan()).issues));
    expect(result.error).toBeUndefined();
    expect(result.states).toHaveLength(2);
    expect(await page.$("#layer0")).not.toBeNull();
    expect(await page.$("#layer1")).toBeNull();
    expect(await page.$("#layer2")).toBeNull();
  });
  it("stops without findings if an apparent close control navigates", async () => {
    await load(modal().replace("document.querySelector('#overlay').remove()", "location.hash='changed'"));
    const result = await scanUnobscuredContrast(page, options((await scan()).issues));
    expect(result.error).toContain("changed the page URL");
    expect(result.issues).toEqual([]);
    expect(result.states).toEqual([]);
    await page.goto("about:blank");
  });
});
