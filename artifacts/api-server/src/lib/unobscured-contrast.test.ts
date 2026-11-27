import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findContrastOverlayClose, scanUnobscuredContrast } from "./unobscured-contrast";
import { withEvidenceBudget } from "./evidence-budget";
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
  it("confirms nested button text and a scripted promotion within the production evidence budget", async () => {
    await load(`
      <button id="search" style="background:#ff4f17;color:white;border:0">
        <div><h4 id="search-text" style="font:600 14px Arial;color:white">Search Flights</h4></div>
      </button>
      <div id="save" onclick="return false" style="cursor:pointer;color:white;background:#ff4f17;font:600 10px Arial">SAVE MORE</div>
      ${modal()}
    `);
    await page.evaluate(() => {
      const original = document.createTreeWalker.bind(document);
      (window as any).__legacyWalks = 0;
      document.createTreeWalker = (...args: Parameters<Document["createTreeWalker"]>) => {
        (window as any).__legacyWalks++;
        return original(...args);
      };
    });
    const widgetScan = async () => page.evaluate(() => {
      const r = (window as any).__ampera.runAllRules({ rules: ["ACT-R103"] });
      return { issues: r.issues as ScanIssue[], stats: r.stats };
    });
    const baseline = (await widgetScan()).issues;
    for (const selector of ["h4#search-text", "div#save"]) {
      expect(baseline.some(i => i.selector === selector && i.type === "Potential Issue")).toBe(true);
    }
    const bounded = await withEvidenceBudget(page, 15000,
      () => scanUnobscuredContrast(page, { ...options(baseline), scan: widgetScan }));
    expect(bounded.error).toBeUndefined();
    expect(bounded.value?.error).toBeUndefined();
    for (const selector of ["h4#search-text", "div#save"]) {
      const finding = bounded.value!.issues.find(i => i.selector === selector && i.type === "Issue")!;
      expect(finding).toBeDefined();
      expect(finding.description).toContain("3.29:1");
      expect(finding.description).toContain("(4.5:1)");
      expect(finding.interactionStateKey).toBe(bounded.value!.states[0].key);
    }
    expect(await page.evaluate(() => (window as any).__legacyWalks)).toBe(0);
    // The optimization must not disable the legacy enhanced-contrast rule
    // when that rule really was selected.
    await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R66"] }));
    expect(await page.evaluate(() => (window as any).__legacyWalks)).toBeGreaterThan(0);
  });
  it("keeps R69 popup findings identical in normal, rule-only and combined-rule scans", async () => {
    const fixture = `<style>
      body{background:white;color:black;font:14px Arial}
      .green{color:#11a670;font:500 10px Arial}
      input{background:white;font-size:16px}
      input::placeholder{color:#b3b3b3;opacity:1}
      #return{color:#999;font-size:16px}
      #booking,#save{background:#ff4f17;color:white;border:0}
      #booking h4{font:600 14px Arial;color:white}
    </style>
    <p id="extra" class="green">Extra baggage, discounts</p>
    <p id="senior" class="green">Up to ₹600 off</p>
    <p id="armed" class="green">Up to ₹600 off</p>
    <input id="origin" placeholder="Where from?">
    <input id="destination" placeholder="Where to?">
    <span id="return">Return</span>
    <button id="booking"><div><h4 id="search">Search Flights</h4></div></button>
    <div id="save" role="button" tabindex="0">SAVE MORE</div>${modal()}`;
    const modes: (string[] | undefined)[] = [undefined, ["ACT-R69"], ["ACT-R69", "ACT-R103"]];
    const actual: unknown[] = [];
    for (const rules of modes) {
      await page.setContent(fixture);
      await page.evaluate(bundle);
      const modeScan = () => page.evaluate(rules => {
        const r = (window as any).__ampera.runAllRules({ rules });
        return { issues: r.issues as ScanIssue[], stats: r.stats };
      }, rules);
      const baseline = (await modeScan()).issues;
      const baselineBefore = JSON.stringify(baseline);
      const result = await withEvidenceBudget(page, 15000, () =>
        scanUnobscuredContrast(page, { ...options(baseline), scan: modeScan }));
      expect(result.error).toBeUndefined();
      expect(result.value?.error).toBeUndefined();
      expect(JSON.stringify(baseline)).toBe(baselineBefore);
      const confirmed = result.value!.issues.filter(i => i.ruleId === "ACT-R69" && i.type === "Issue");
      expect(confirmed).toHaveLength(8);
      expect(confirmed.every(i => i.interactionStateKey === result.value!.states[0].key)).toBe(true);
      expect(result.value!.states[0].pageHtml).not.toContain('<div id="overlay"');
      actual.push(confirmed.map(i => ({
        selector: i.selector, type: i.type, description: i.description,
      })).sort((a, b) => a.selector!.localeCompare(b.selector!)));
      if (rules?.length === 1) {
        expect(result.value!.issues.every(i => i.ruleId === "ACT-R69")).toBe(true);
      }
    }
    expect(actual[1]).toEqual(actual[0]);
    expect(actual[2]).toEqual(actual[0]);
  }, 30000);
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
