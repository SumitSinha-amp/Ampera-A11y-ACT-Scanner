import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { verifyKeyboardFocus as Verifier } from "./keyboard-focus-verification";
import { RULE_REGISTRY } from "./browser/registry";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}
describe.skipIf(!existsSync(chromium))("ACT-R119 native keyboard focus verification", () => {
  let browser: Browser;
  let engine: string;
  let verify: typeof Verifier;
  beforeAll(async () => {
    engine = buildSync({
      entryPoints: [fileURLToPath(new URL("./browser/index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    const nodeModule = buildSync({
      entryPoints: [fileURLToPath(new URL("./keyboard-focus-verification.ts", import.meta.url))],
      bundle: true, write: false, platform: "node", format: "esm",
    }).outputFiles[0].text;
    verify = (await import(`data:text/javascript;base64,${Buffer.from(nodeModule).toString("base64")}`)).verifyKeyboardFocus;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function prepare(html: string) {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });
    await page.setContent(`<!doctype html><html lang="en"><head><title>Focus test</title>
      <style>body{margin:0}button{width:100px;height:30px;border:0;border-radius:0}
      #covered{position:absolute;left:50px;top:140px}#cover{position:fixed;left:0;top:120px;width:100%;height:70px;background:rgb(20,30,40);z-index:10}</style>
      </head><body>${html}</body></html>`);
    await page.evaluate(engine);
    return page;
  }
  function check(page: Page, overrides: Partial<Parameters<typeof Verifier>[1]> = {}) {
    return verify(page, {
      budgetMs: 6000,
      captureEvidence: async () => ({
        screenshot: Buffer.from(await page.screenshot({ type: "jpeg", quality: 30 })).toString("base64"),
        pageHtml: await page.content(),
      }),
      ...overrides,
    });
  }
  async function scan(html: string, overrides: Partial<Parameters<typeof Verifier>[1]> = {}) {
    const page = await prepare(html);
    try { return await check(page, overrides); }
    finally { await page.close(); }
  }

  it("runs automatically and confirms a completely obscured focused control", async () => {
    expect(RULE_REGISTRY.find(rule => rule.id === "ACT-R119")).toMatchObject({ manual: false, executionTier: "automatic" });
    const result = await scan('<button id="covered">Covered</button><div id="cover"></div>');
    expect(result.complete).toBe(true);
    expect(result.checked).toBe(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      selector: "button#covered", type: "Issue", wcagCriteria: "2.4.11", wcagLevel: "AA",
      bboxX: 50, bboxY: 140, bboxWidth: 100, bboxHeight: 30,
    });
    expect(result.issues[0].description).toContain("div#cover");
    expect(result.states[0].key).toBe(result.issues[0].interactionStateKey);
    expect(result.states[0].screenshot.length).toBeGreaterThan(100);
  });

  it("honors explicit selection and never emits a bar-only heuristic", async () => {
    expect((await scan('<button id="covered">Covered</button><div id="cover"></div>', { rules: ["ACT-R4"] })).checked).toBe(0);
    expect((await scan('<button id="covered">Covered</button><div id="cover"></div>', { rules: [" act-r119 "] })).issues).toHaveLength(1);
    const page = await prepare('<button id="covered">Covered</button><div id="cover"></div>');
    try {
      const baseline = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R119"] }));
      expect(baseline.issues).toEqual([]);
    } finally { await page.close(); }
  });

  it("does not turn partial coverage into a minimum-focus failure", async () => {
    expect((await scan('<button id="covered">Partly visible</button><div id="cover" style="top:155px"></div>')).issues).toEqual([]);
  });

  it("passes unobscured controls, overlay descendants, and transparent layers", async () => {
    expect((await scan('<button id="covered">Visible</button>')).issues).toEqual([]);
    expect((await scan('<div id="cover"><button>In the bar</button></div>')).issues).toEqual([]);
    expect((await scan('<button id="covered">Visible</button><div id="cover" style="background:transparent"></div>')).issues).toEqual([]);
    expect((await scan('<button id="covered">Visible through paint</button><div id="cover" style="opacity:.5"></div>')).issues).toEqual([]);
  });

  it("does not confirm lower stacking layers or clipped-away overlays", async () => {
    expect((await scan('<button id="covered" style="z-index:20">Above</button><div id="cover"></div>')).issues).toEqual([]);
    expect((await scan('<button id="covered">Visible</button><div style="position:absolute;overflow:hidden;width:10px;height:10px"><div id="cover" style="position:absolute"></div></div>')).issues).toEqual([]);
    expect((await scan('<button id="covered" style="pointer-events:none;z-index:20">Above</button><div id="cover"></div>')).issues).toEqual([]);
  });

  it("checks both scroll directions and passes the scroll-padding repair", async () => {
    const page = await prepare(`<div style="position:fixed;top:0;width:100%;height:90px;background:black;z-index:10"></div>
      <main style="padding:100px 20px 150px">${Array.from({ length: 12 }, (_, i) => `<div style="height:140px"><button id="item-${i}">Item ${i}</button></div>`).join("")}</main>
      <div style="position:fixed;bottom:0;width:100%;height:100px;background:black;z-index:10"></div>`);
    try {
      const broken = await check(page, { maxFindings: 20 });
      expect(broken.issues.length).toBeGreaterThan(0);
      expect(broken.issues.some(issue => issue.interactionStateKey?.includes("reverse"))).toBe(true);
      await page.addStyleTag({ content: "html{scroll-padding-top:100px;scroll-padding-bottom:110px}button{scroll-margin-top:100px;scroll-margin-bottom:110px}" });
      expect((await check(page, { maxFindings: 20 })).issues).toEqual([]);
    } finally { await page.close(); }
  });

  it("detects opaque pointer-events:none overlays and restores author declarations", async () => {
    const page = await prepare('<button id="covered">Covered</button><div id="cover" style="pointer-events:none!important"></div>');
    try {
      const before = await page.content();
      expect((await check(page)).issues).toHaveLength(1);
      expect(await page.content()).toBe(before);
    } finally { await page.close(); }
  });

  it("supports a union of multiple opaque obstructions", async () => {
    const result = await scan('<button id="covered">Covered</button><div id="cover" style="width:100px"></div><div style="position:fixed;top:120px;left:100px;width:100px;height:70px;background:black;z-index:10"></div>');
    expect(result.issues).toHaveLength(1);
  });

  it("verifies header and footer overlap on small or tall overlays, without old bar-size heuristics", async () => {
    const result = await scan('<button id="top" style="position:absolute;top:10px">Top</button><button id="bottom" style="position:absolute;bottom:10px">Bottom</button><div style="position:fixed;top:0;width:120px;height:200px;background:black;z-index:10"></div><div style="position:fixed;bottom:0;width:120px;height:70px;background:black;z-index:10"></div>');
    expect(result.issues.map(issue => issue.selector)).toEqual(["button#top", "button#bottom"]);
  });

  it("restores focus, text selection, page scroll, nested scroll, and form data without activating controls", async () => {
    const page = await prepare(`<input id="name" value="Preserve me"><div id="scroll" style="height:100px;overflow:auto"><div style="height:800px"><button>Inner</button></div></div>
      <form onsubmit="window.submitted=true"><button id="covered" onclick="window.clicked=true">Submit</button></form><div id="cover"></div><div style="height:1800px"></div>
      <script>window.clicked=false;window.submitted=false</script>`);
    try {
      await page.evaluate(() => {
        const name = document.querySelector<HTMLInputElement>("#name")!;
        name.focus(); name.setSelectionRange(2, 5);
        document.querySelector("#scroll")!.scrollTop = 70;
        window.scrollTo(0, 150);
      });
      await check(page);
      expect(await page.evaluate(() => {
        const name = document.querySelector<HTMLInputElement>("#name")!;
        return { focus: document.activeElement?.id, value: name.value, selection: [name.selectionStart, name.selectionEnd],
          scroll: scrollY, inner: document.querySelector("#scroll")!.scrollTop,
          clicked: (window as any).clicked, submitted: (window as any).submitted };
      })).toEqual({ focus: "name", value: "Preserve me", selection: [2, 5], scroll: 150, inner: 70, clicked: false, submitted: false });
    } finally { await page.close(); }
  });

  it("uses native focus order, skips disabled/negative controls, and bounds traps", async () => {
    const result = await scan('<button id="covered" tabindex="-1">Not tabbed</button><button disabled>Disabled</button><button id="first" tabindex="1">First</button><button id="trap" onkeydown="if(event.key===\'Tab\')event.preventDefault()">Trap</button><div id="cover"></div>');
    expect(result.issues).toEqual([]);
    expect(result.checked).toBe(2);
  });

  it("marks budget exhaustion as incomplete, rather than claiming a passing check", async () => {
    const result = await scan('<button id="covered">Covered</button><div id="cover"></div>', { budgetMs: 0 });
    expect(result.complete).toBe(false);
    expect(result.checked).toBe(0);
  });

  it("restores state and returns an explicit error if evidence capture fails", async () => {
    const page = await prepare('<button id="covered">Covered</button><div id="cover"></div>');
    try {
      const before = await page.content();
      const result = await check(page, { captureEvidence: async () => { throw new Error("Evidence unavailable"); } });
      expect(result.error).toBe("Evidence unavailable");
      expect(result.complete).toBe(false);
      expect(result.issues).toEqual([]);
      expect(await page.content()).toBe(before);
    } finally { await page.close(); }
  });
});
