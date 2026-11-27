import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { verifyFocusAppearance as Verifier, reconcileFocusIndicatorIssues as Reconciler } from "./focus-appearance-verification";
import { RULE_REGISTRY } from "./browser/registry";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("Ampera R121 native focus appearance", () => {
  let browser: Browser, engine: string, verify: typeof Verifier;
  let reconcile: typeof Reconciler;
  beforeAll(async () => {
    engine = buildSync({ entryPoints: [fileURLToPath(new URL("./browser/index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife" }).outputFiles[0].text;
    const nodeModule = buildSync({ entryPoints: [fileURLToPath(new URL("./focus-appearance-verification.ts", import.meta.url))],
      bundle: true, write: false, platform: "node", format: "esm" }).outputFiles[0].text;
    const module = await import(`data:text/javascript;base64,${Buffer.from(nodeModule).toString("base64")}`);
    verify = module.verifyFocusAppearance;
    reconcile = module.reconcileFocusIndicatorIssues;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function prepare(html: string) {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 700 });
    await page.setContent(`<!doctype html><html lang="en"><head><title>Focus appearance</title></head><body>${html}</body></html>`);
    await page.evaluate(engine);
    return page;
  }
  const options = (page: Page) => ({
    rules: ["ACT-R121"], budgetMs: 9000,
    captureEvidence: async () => ({
      screenshot: Buffer.from(await page.screenshot({ type: "jpeg", quality: 20 })).toString("base64"),
      pageHtml: await page.content(),
    }),
  });
  async function scan(html: string, overrides: Partial<Parameters<typeof Verifier>[1]> = {}) {
    const page = await prepare(html);
    try { return await verify(page, { ...options(page), ...overrides }); }
    finally { await page.close(); }
  }
  it("runs automatically, without manual-only opt-in", () => {
    expect(RULE_REGISTRY.find(rule => rule.id === "ACT-R121")).toMatchObject({ manual: false, executionTier: "automatic" });
  });
  it("reports a global outline reset per focusable element with focused-state evidence", async () => {
    const r = await scan('<style>*{outline:none}</style><a href="#one">One</a><a href="#two">Two</a>');
    expect(r.issues).toHaveLength(2);
    expect(r.issues.every(i => i.ruleId === "ACT-R121" && i.type === "Potential Issue")).toBe(true);
    expect(r.checked).toBe(2);
    expect(r.complete).toBe(true);
    expect(r.states).toHaveLength(2);
    expect(r.issues[0].interactionStateKey).toBe(r.states[0].key);
    expect(r.states[0].screenshot).not.toBe("");
  });
  it("checks twenty distinct targets without grouping them into one stylesheet finding", async () => {
    const r = await scan('<style>:focus{outline:0}</style>' + Array.from({ length: 20 }, (_, i) => `<a id="link${i}" href="#${i}">Link ${i}</a>`).join(" "));
    expect(r.issues).toHaveLength(20);
    expect(new Set(r.issues.map(i => i.selector)).size).toBe(20);
  });
  it("R65 identifies twenty native keyboard targets with focused-state evidence", async () => {
    const r = await scan('<style>:focus{outline:0}</style>' + Array.from({ length: 20 }, (_, i) => `<a id="link${i}" href="#${i}">Link ${i}</a>`).join(" "),
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(20);
    expect(r.states).toHaveLength(20);
    expect(r.complete).toBe(true);
    expect(r.issues.every(i => i.ruleId === "ACT-R65" && i.type === "Potential Issue" &&
      i.wcagCriteria === "2.4.7" && i.wcagLevel === "AA" && !!i.interactionStateKey &&
      i.bboxWidth! > 0)).toBe(true);
    expect(new Set(r.issues.map(i => i.selector)).size).toBe(20);
    expect(r.issues[0].description).toContain('"Link 0"');
  });
  it("shares one traversal and evidence capture while keeping R65 and custom R121 distinct", async () => {
    const r = await scan('<style>*{outline:none}</style><a href="#a">One</a><a href="#b">Two</a>',
      { rules: ["ACT-R65", "ACT-R121"], ruleIds: ["ACT-R65", "ACT-R121"] });
    expect(r.checked).toBe(2);
    expect(r.issues.filter(i => i.ruleId === "ACT-R65")).toHaveLength(2);
    expect(r.issues.filter(i => i.ruleId === "ACT-R121")).toHaveLength(2);
    expect(r.states).toHaveLength(2);
    expect(r.complete).toBe(true);
  });
  it("preserves R65 selection without leaking custom R121 findings", async () => {
    const r = await scan('<a href="#" style="outline:none">Link</a>',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65", "ACT-R121"] });
    expect(r.issues.map(i => i.ruleId)).toEqual(["ACT-R65"]);
  });
  it("does not copy R65 into R121 without author-suppression evidence", async () => {
    const r = await scan('<style>a{outline-width:calc(0px + 0px)}</style><a href="#">Link</a>',
      { rules: ["ACT-R65", "ACT-R121"], ruleIds: ["ACT-R65", "ACT-R121"] });
    expect(r.issues.map(i => i.ruleId)).toEqual(["ACT-R65"]);
  });
  it("marks large unverified targets incomplete without discarding their static hints", async () => {
    const r = await scan(`<a id="large" href="#" style="outline:none">${"<span>Part </span>".repeat(101)}</a>`,
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.complete).toBe(false);
    expect(r.error).toContain("coverage is incomplete");
    expect(r.visitedSelectors).toHaveLength(0);
    const fallback = { ruleId: "ACT-R65", selector: "a#large" } as any;
    expect(reconcile([fallback], r)).toEqual([fallback]);
  });
  it("keeps native browser focus indications for R65", async () => {
    const r = await scan('<a href="#">Default</a><button>Button</button><input aria-label="Name">',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(0);
    expect(r.checked).toBe(3);
    expect(r.visitedSelectors).toHaveLength(3);
  });
  it.each([
    "a:focus-visible{box-shadow:0 0 0 3px blue}",
    "a:focus-visible{border:3px solid blue}",
    "p:focus-within{outline:3px solid blue}",
    "a:focus-visible::after{content:' Focused';background:yellow}",
    "a:focus-visible span{background:yellow}",
  ])("R65 recognizes replacement focus styling: %s", async css => {
    const r = await scan(`<style>a{outline:none;text-decoration:none}${css}</style><p><a href="#"><span>Link</span></a></p>`,
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(0);
  });
  it("replaces unmatched root R65 heuristics only after complete native coverage, preserving frames", () => {
    const make = (selector: string) => ({ ruleId: "ACT-R65", selector } as any);
    const existing = [make("#old"), make("#passed"), make("iframe >>> #nested")];
    expect(reconcile(existing, { complete: true, visitedSelectors: ["#passed"], issues: [make("#new")] })
      .map(i => i.selector)).toEqual(["iframe >>> #nested", "#new"]);
    expect(reconcile(existing, { complete: false, visitedSelectors: ["#passed"], issues: [] })
      .map(i => i.selector)).toEqual(["#old", "iframe >>> #nested"]);
  });
  it("preserves the default browser indicator", async () => {
    expect((await scan('<a href="#">Default</a><button>Button</button><input aria-label="Name">')).issues).toEqual([]);
  });
  it("does not treat color and underline on an image-only link as a rendered indicator", async () => {
    const r = await scan(`<style>a{outline:none;color:blue}a:focus{color:red;text-decoration:underline}</style>
      <a id="store" href="#"><img alt="Google Play" width="60" height="30" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='30'%3E%3Crect width='60' height='30'/%3E%3C/svg%3E"></a>`,
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ selector: "a#store", type: "Potential Issue" });
  });
  it.each([
    "a:focus{color:#656565}",
    "a{border:1px solid #dadada}a:focus{border-color:#0088ce}",
    "a{background:linear-gradient(#ff3c76,#ff2364)}a:focus{background:linear-gradient(#ff6f9a,#ff5688)}",
  ])("keeps color-only changes reviewable rather than asserting visibility: %s", async css => {
    const r = await scan(`<style>a{outline:none;text-decoration:none}${css}</style><a href="#">Control</a>`,
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].description).toContain("only color or other unverified paint");
    expect(r.states).toHaveLength(1);
  });
  it("keeps a new text underline as observed replacement styling", async () => {
    const r = await scan('<style>a{outline:none;text-decoration:none}a:focus{text-decoration:underline}</style><a href="#"><span>Text link</span></a>',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toEqual([]);
  });
  it("does not accept underline on text isolated inside an inline-block descendant", async () => {
    const r = await scan('<style>a{outline:none;text-decoration:none}a:focus{text-decoration:underline}span{display:inline-block}</style><a href="#"><span>Isolated text</span></a>',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
  });
  it("does not accept focus styling on a hidden descendant", async () => {
    const r = await scan('<style>a{outline:none}a:focus span{background:yellow}</style><a href="#">Visible<span hidden>Hidden</span></a>',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
  });
  it("checks zero-width icon links and captures their visible descendant bounds", async () => {
    const r = await scan(`<style>a{outline:none;display:inline-block;width:0;height:12px}i{display:inline-block;width:20px;height:20px;background:black}</style>
      <a id="social" aria-label="Social" href="#"><i></i></a>`,
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ selector: "a#social", bboxWidth: 20 });
    expect(r.complete).toBe(true);
  });
  it("accepts a contrasting native insertion caret in editable text fields", async () => {
    const r = await scan('<style>input,textarea{outline:none;background:white;color:#333;caret-color:#333}</style><input aria-label="From"><input aria-label="To"><textarea aria-label="Notes"></textarea>',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toEqual([]);
    expect(r.checked).toBe(3);
    expect(r.complete).toBe(true);
  });
  it.each(["transparent", "white", "#eee"])("does not accept an invisible/low-contrast caret: %s", async color => {
    const r = await scan(`<input aria-label="From" style="outline:none;background:white;caret-color:${color}">`,
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
  });
  it("does not infer an insertion caret in a readonly field", async () => {
    const r = await scan('<input aria-label="Readonly" readonly value="Value" style="outline:none;background:white;color:black">',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
  });
  it.each(["font-size:0", "text-indent:-9999px", "clip-path:inset(100%)"])("does not assume a caret is visible through %s", async css => {
    const r = await scan(`<input aria-label="From" style="outline:none;background:white;color:black;${css}">`,
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
  });
  it("accepts a solid field's contrasting caret even when its ancestor has a background image", async () => {
    const r = await scan('<div style="background:linear-gradient(black,gray)"><input aria-label="From" style="outline:none;background:white;caret-color:#333"></div>',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toEqual([]);
  });
  it("keeps caret visibility unverified over an unresolved image background", async () => {
    const r = await scan('<div style="background:linear-gradient(black,gray)"><input aria-label="From" style="outline:none;background:transparent;caret-color:#333"></div>',
      { rules: ["ACT-R65"], ruleIds: ["ACT-R65"] });
    expect(r.issues).toHaveLength(1);
  });
  it("retains a popup finding when only the baseline document traversal is complete", () => {
    const popup = { ruleId: "ACT-R65", selector: "a#add-another", interactionStateKey: "opened-railcards" } as any;
    expect(reconcile([popup], { complete: true, visitedSelectors: [], issues: [] })).toEqual([popup]);
  });
  it("keeps the static/popup R65 check consistent for native caret indicators", async () => {
    const page = await prepare('<input id="from" style="outline:none;background:white;caret-color:#333"><input id="hidden-caret" style="outline:none;background:white;caret-color:transparent">');
    try {
      const issues = await page.evaluate(() =>
        (window as any).__ampera.runAllRules({ rules: ["ACT-R65"] }).issues);
      expect(issues.some((issue: any) => issue.selector === "input#from")).toBe(false);
      expect(issues.some((issue: any) => issue.selector === "input#hidden-caret")).toBe(true);
    } finally { await page.close(); }
  });
  it.each([
    "a:focus-visible{outline:3px solid blue}",
    "a:focus-visible{box-shadow:0 0 0 3px blue}",
    "a:focus-visible{border:3px solid blue}",
    "a:focus-visible{background:yellow}",
    "a:focus-visible{text-decoration:underline}",
    "p:focus-within{outline:3px solid blue}",
    "a:focus-visible::after{content:' Focused';background:yellow}",
    "a:focus-visible span{background:yellow}",
  ])("does not report an observed replacement: %s", async css => {
    expect((await scan(`<style>a{outline:none;text-decoration:none}${css}</style><p><a href="#"><span>Link</span></a></p>`)).issues).toEqual([]);
  });
  it("does not mistake a static border or shadow for a replacement", async () => {
    expect((await scan('<a href="#" style="outline:none;border:1px solid black;box-shadow:0 0 1px gray">Static</a>')).issues).toHaveLength(1);
  });
  it("honors explicit selection, independent of R65", async () => {
    const html = '<a href="#" style="outline:none">Link</a>';
    expect((await scan(html, { rules: ["ACT-R65"] })).issues).toEqual([]);
    expect((await scan(html, { rules: undefined })).issues).toHaveLength(1);
  });
  it("skips negative-tabindex and disabled controls", async () => {
    expect((await scan('<style>*{outline:none}</style><button tabindex="-1">Negative</button><button disabled>Disabled</button><button>Tabbed</button>')).issues).toHaveLength(1);
  });
  it("preserves focus, selection, form values and scrolling without activation", async () => {
    const page = await prepare('<input id="name" value="Unchanged"><a id="bad" href="#other" style="outline:none" onclick="window.clicked=true">Link</a><div style="height:1200px"></div>');
    try {
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>("#name")!;
        input.focus(); input.setSelectionRange(2, 5); scrollTo(0, 100);
      });
      const before = await page.content(), url = page.url();
      await verify(page, options(page));
      expect(await page.content()).toBe(before);
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>("#name")!;
        return [document.activeElement?.id, input.value, input.selectionStart, input.selectionEnd, scrollY, !!(window as any).clicked];
      })).toEqual(["name", "Unchanged", 2, 5, 100, false]);
    } finally { await page.close(); }
  });
  it("marks budget exhaustion and traps as incomplete", async () => {
    expect((await scan('<a href="#">Link</a>', { budgetMs: 0 })).complete).toBe(false);
    expect((await scan('<button onkeydown="if(event.key===\'Tab\')event.preventDefault()">Trap</button><a href="#">Missed</a>')).complete).toBe(false);
  });
  it("restores the page after evidence capture errors", async () => {
    const page = await prepare('<a href="#" style="outline:none">Link</a>');
    try {
      const before = await page.content();
      const r = await verify(page, { ...options(page), captureEvidence: async () => { throw new Error("Evidence unavailable"); } });
      expect(r.error).toBe("Evidence unavailable");
      expect(r.complete).toBe(false);
      expect(await page.content()).toBe(before);
    } finally { await page.close(); }
  });
  it("R65 retains static hints and restores focus, selection and scrolling after capture failure", async () => {
    const page = await prepare('<input id="name" value="Unchanged"><a id="bad" href="#other" style="outline:none" onclick="window.clicked=true">Link</a><div style="height:1200px"></div>');
    try {
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>("#name")!;
        input.focus(); input.setSelectionRange(2, 5); scrollTo(0, 100);
      });
      const before = await page.content(), url = page.url();
      const r = await verify(page, { ...options(page), rules: ["ACT-R65"], ruleIds: ["ACT-R65"],
        captureEvidence: async () => { throw new Error("Evidence unavailable"); } });
      expect(r.complete).toBe(false);
      expect(r.error).toBe("Evidence unavailable");
      expect(await page.content()).toBe(before);
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>("#name")!;
        return [document.activeElement?.id, input.value, input.selectionStart, input.selectionEnd, scrollY, !!(window as any).clicked];
      })).toEqual(["name", "Unchanged", 2, 5, 100, false]);
      const fallback = { ruleId: "ACT-R65", selector: "a#bad" } as any;
      expect(reconcile([fallback], r)).toEqual([fallback]);
    } finally { await page.close(); }
  });
});
