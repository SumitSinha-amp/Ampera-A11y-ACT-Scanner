import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyZoomContrast } from "./zoom-contrast-verification";
import type { ScanIssue } from "./scanner";

describe("200% zoom contrast verification", () => {
  let browser: Browser, page: Page, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({ entryPoints: [fileURLToPath(new URL("./browser/index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife" }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  beforeEach(async () => {
    await page?.close();
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
  });
  afterAll(async () => { await browser?.close(); });

  const image = `url("data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="white" d="M0 0h1v1H0z"/></svg>').toString("base64")}")`;
  const fixture = `<style>
    html,body{margin:0;background:rgb(52,75,110)}
    #paint{width:100%;height:1400px;background-image:${image}}
    #wide{width:1000px;position:relative;padding-top:1100px}
    a{color:rgb(34,34,34);font:11px Arial}
    #first{position:relative;margin-left:580px;display:block;width:90px}
    #second{position:relative;margin-left:740px;display:block;width:220px}
  </style><div id="paint"><div id="wide">
    <a id="first" href="#never" onclick="window.activated=true;return false">Mobile application</a>
    <a id="second" href="#never">Join our online community and meet other travelers</a>
  </div></div>`;
  async function load(html = fixture) {
    await page.setContent(`<!doctype html><html><head><title>Zoom fixture</title></head><body>${html}</body></html>`);
    await page.evaluate(bundle);
  }
  async function scan(spatialContrast = false, rules = ["ACT-R69"]) {
    return page.evaluate(({ spatialContrast, rules }) => {
      const r = (window as any).__ampera.runAllRules({ spatialContrast, rules });
      return { issues: r.issues as ScanIssue[], stats: r.stats };
    }, { spatialContrast, rules });
  }
  async function options() {
    return { baseline: (await scan()).issues, scan,
      capture: async () => ({
        screenshot: Buffer.from(await page.screenshot({ type: "jpeg", captureBeyondViewport: false })).toString("base64"),
        pageHtml: await page.content(),
      }) };
  }

  it("confirms two overflowing labels at 200% with state-linked evidence and physical-pixel boxes", async () => {
    await load();
    const opts = await options();
    expect(opts.baseline.filter(i => /#first|#second/.test(i.selector || "")).every(i => i.type === "Potential Issue")).toBe(true);
    const before = JSON.stringify(opts.baseline);
    const result = await verifyZoomContrast(page, opts);
    expect(result.error).toBeUndefined();
    expect(result.complete).toBe(true);
    expect(result.issues.map(i => i.selector).sort()).toEqual(["a#first", "a#second"]);
    expect(result.issues.every(i => i.description.includes("1.80:1") && i.type === "Issue")).toBe(true);
    expect(JSON.stringify(opts.baseline)).toBe(before);
    for (const issue of result.issues) {
      const state = result.states.find(s => s.key === issue.interactionStateKey)!;
      const bytes = Buffer.from(state.screenshot, "base64");
      expect(bytes.length).toBeGreaterThan(100);
      const dimensions = await page.evaluate(base64 => new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("Invalid evidence image"));
        image.src = `data:image/jpeg;base64,${base64}`;
      }), state.screenshot);
      expect(dimensions).toEqual({ width: 1200, height: 800 });
      expect(state.pageHtml).toContain('id="paint"');
      expect(issue.bboxX).toBeGreaterThanOrEqual(0);
      expect(issue.bboxX! + issue.bboxWidth!).toBeLessThanOrEqual(1200);
      expect(issue.bboxY! + issue.bboxHeight!).toBeLessThanOrEqual(800);
    }
    expect(page.viewport()).toEqual({ width: 1200, height: 800, deviceScaleFactor: 1 });
    expect(await page.evaluate(() => (window as any).activated)).toBeUndefined();
  });

  it("restores viewport, document scrolling, inner scrolling and exact authored styles", async () => {
    await load(fixture + '<div id="scroll" style="height:50px;overflow:auto"><div style="height:300px">Scrollable content</div></div>');
    await page.evaluate(() => { document.querySelector("#scroll")!.scrollTop = 24; window.scrollTo(0, 300); });
    const original = await page.evaluate(() => ({ x: scrollX, y: scrollY,
      inner: document.querySelector("#scroll")!.scrollTop, html: document.documentElement.getAttribute("style"),
      body: document.body.getAttribute("style") }));
    await verifyZoomContrast(page, await options());
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY,
      inner: document.querySelector("#scroll")!.scrollTop, html: document.documentElement.getAttribute("style"),
      body: document.body.getAttribute("style") }))).toEqual(original);
  });

  it("does not promote text that remains inside an image-backed container", async () => {
    await load(fixture.replace("#paint{width:100%;", "#paint{width:1000px;"));
    expect((await verifyZoomContrast(page, await options())).issues).toEqual([]);
  });

  it("does not report a passing solid-background zoom state", async () => {
    await load(fixture.replace("background:rgb(52,75,110)", "background:white"));
    expect((await verifyZoomContrast(page, await options())).issues).toEqual([]);
  });

  it("keeps solid foreground paint over an overflowing link instead of assuming the canvas is its background", async () => {
    await load(fixture + '<style>a{background:white}</style>');
    expect((await verifyZoomContrast(page, await options())).issues).toEqual([]);
  });

  it("does not report dormant text that remains visually hidden after zoom", async () => {
    await load(fixture + '<style>#wide{visibility:hidden}</style>');
    expect((await verifyZoomContrast(page, await options())).issues).toEqual([]);
  });

  it("does not promote transparent text when opacity leaves its true paint unresolved", async () => {
    await load(fixture + '<style>#wide{filter:opacity(.8)}</style>');
    expect((await verifyZoomContrast(page, await options())).issues).toEqual([]);
  });

  it("retains uncertainty for occlusion instead of proving failure through a covering layer", async () => {
    await load(fixture + '<div style="position:fixed;inset:0;background:white;z-index:999">Overlay</div>');
    expect((await verifyZoomContrast(page, await options())).issues).toEqual([]);
  });

  it("does not duplicate pre-existing confirmed failures", async () => {
    await load();
    const opts = await options();
    opts.baseline = opts.baseline.map(i => ({ ...i, type: "Issue" }));
    expect((await verifyZoomContrast(page, opts)).issues).toEqual([]);
  });

  it("supports explicit widget-only selection without emitting other rule IDs", async () => {
    await load();
    const opts = await options();
    opts.scan = spatial => scan(spatial, ["ACT-R103"]);
    const result = await verifyZoomContrast(page, opts);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every(i => i.ruleId === "ACT-R103")).toBe(true);
  });

  it("retains baseline findings and restores state if evidence capture fails", async () => {
    await load();
    const opts = await options();
    const result = await verifyZoomContrast(page, { ...opts, capture: async () => { throw new Error("capture unavailable"); } });
    expect(result.complete).toBe(false);
    expect(result.error).toContain("capture unavailable");
    expect(result.issues).toEqual([]);
    expect(result.states).toEqual([]);
    expect(opts.baseline.length).toBeGreaterThan(0);
    expect(page.viewport()?.width).toBe(1200);
  });

  it("reports bounded coverage explicitly instead of treating unvisited positions as passing", async () => {
    await load();
    const result = await verifyZoomContrast(page, { ...await options(), maxStates: 0 });
    expect(result.complete).toBe(false);
    expect(result.issues).toEqual([]);
    expect(page.viewport()?.width).toBe(1200);
  });

  it("leaves ACT-R75's small-font results unchanged", async () => {
    await load();
    const before = await scan(false, ["ACT-R75"]);
    await verifyZoomContrast(page, await options());
    expect(await scan(false, ["ACT-R75"])).toEqual(before);
  });
});
