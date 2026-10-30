import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R44 orientation-dependent rotation", () => {
  let browser: Browser, page: Page, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 700 });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(css: string, html = '<main id="target">Main content</main>', rules: string[] = ["ACT-R44"]) {
    await page.setContent(`<!doctype html><html><head><title>Orientation</title><style>${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(bundle);
    return page.evaluate(rules => {
      const css = () => Array.from(document.styleSheets).map(s => {
        try { return Array.from(s.cssRules).map(r => r.cssText); }
        catch { return ["unreadable stylesheet"]; }
      });
      const before = css(), markup = document.documentElement.outerHTML;
      const result = (window as any).__ampera.runAllRules({ rules });
      return { issues: result.issues.filter((i: any) => i.ruleId === "ACT-R44"),
        restored: JSON.stringify(before) === JSON.stringify(css()) && markup === document.documentElement.outerHTML };
    }, rules);
  }

  it("ignores Weaver's Space unused Foundation show/hide utilities", async () => {
    const r = await scan(`@media (orientation:portrait){.show-for-landscape,.hide-for-portrait{display:none!important}}
      @media (orientation:landscape){.hide-for-landscape,.show-for-portrait{display:none!important}}`);
    expect(r.issues).toEqual([]);
    expect(r.restored).toBe(true);
  });
  it("does not mistake responsive visibility for a CSS transform lock", async () => {
    expect((await scan('@media (orientation:portrait){.extra{display:none}}',
      '<main>Main content</main><aside class="extra">Additional content</aside>')).issues).toEqual([]);
  });
  it.each([
    "transform:rotate(90deg)", "transform:rotate(-90deg)", "transform:rotateZ(90deg)",
    "transform:rotate3d(0,0,1,90deg)", "transform:matrix(0,1,-1,0,0,0)",
    "transform:matrix3d(0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1)",
    "rotate:90deg", "rotate:z 90deg", "rotate:0 0 -1 90deg",
    "--angle:90deg;transform:rotate(var(--angle))",
  ])("detects quarter-turn restrictions: %s", async declaration => {
    const r = await scan(`@media (orientation:portrait){#target{${declaration}}}`);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ type: "Issue", selector: "main#target" });
    expect(r.restored).toBe(true);
  });
  it.each(["rotate(0deg)", "rotate(45deg)", "rotate(180deg)", "rotateX(90deg)", "rotateY(90deg)", "scale(2)", "translateX(90px)"])(
    "does not report non-quarter-turn or unresolved 3D transforms: %s", async transform => {
      expect((await scan(`@media (orientation:portrait){#target{transform:${transform}}}`)).issues).toEqual([]);
    });
  it("ignores rotations on nonexistent targets", async () => {
    expect((await scan('@media (orientation:portrait){.unused{transform:rotate(90deg)}}')).issues).toEqual([]);
  });
  it("ignores hidden targets", async () => {
    expect((await scan('@media (orientation:portrait){#target{transform:rotate(90deg)}}',
      '<main id="target" hidden>Main content</main>')).issues).toEqual([]);
  });
  it("ignores identical rotation in both orientations", async () => {
    expect((await scan('#target{transform:rotate(90deg)} @media (orientation:portrait){#target{transform:rotate(90deg)}}')).issues).toEqual([]);
  });
  it("respects the cascade rather than overridden declarations", async () => {
    expect((await scan('@media (orientation:portrait){#target{transform:rotate(90deg)}} #target{transform:none!important}')).issues).toEqual([]);
  });
  it("keeps other media conditions intact", async () => {
    expect((await scan('@media (max-width:200px) and (orientation:portrait){#target{transform:rotate(90deg)}}')).issues).toEqual([]);
  });
  it("finds nested media/supports/layer declarations", async () => {
    const r = await scan('@layer example{@supports(display:grid){@media (orientation:portrait){#target{rotate:90deg}}}}');
    expect(r.issues).toHaveLength(1);
    expect(r.restored).toBe(true);
  });
  it("accounts for ancestor counter-rotation", async () => {
    expect((await scan('#outer{rotate:-90deg}@media (orientation:portrait){#outer{rotate:0deg}#target{rotate:-90deg}}',
      '<div id="outer"><main id="target">Main content</main></div>')).issues.map((i: any) => i.selector)).toEqual(["div#outer"]);
  });
  it("combines individual rotate with transform", async () => {
    expect((await scan('@media (orientation:portrait){#target{rotate:45deg;transform:rotate(45deg)}}')).issues).toHaveLength(1);
  });
  it("has normal/explicit parity and honors deselection", async () => {
    const css = '@media (orientation:portrait){#target{rotate:90deg}}';
    expect((await scan(css, undefined, [])).issues).toEqual((await scan(css)).issues);
    expect((await scan(css, undefined, ["ACT-R73"])).issues).toEqual([]);
  });
  it("detects the same restriction from a portrait viewport", async () => {
    await page.setViewport({ width: 700, height: 1000 });
    try {
      expect((await scan('@media (orientation:portrait){#target{rotate:90deg}}')).issues).toHaveLength(1);
    } finally { await page.setViewport({ width: 1000, height: 700 }); }
  });
  it("handles shadow-root styles and restores their media conditions", async () => {
    await page.setContent('<div id="host"></div>');
    await page.evaluate(() => {
      document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML =
        '<style>@media(orientation:portrait){main{rotate:90deg}}</style><main>Shadow content</main>';
    });
    await page.evaluate(bundle);
    const r = await page.evaluate(() => {
      const root = document.querySelector("#host")!.shadowRoot!;
      const rule = root.querySelector("style")!.sheet!.cssRules[0] as CSSMediaRule;
      const before = rule.media.mediaText;
      const result = (window as any).__ampera.runAllRules({ rules: ["ACT-R44"] });
      return { issues: result.issues, restored: before === rule.media.mediaText };
    });
    expect(r.issues).toHaveLength(1);
    expect(r.restored).toBe(true);
  });
  it("does not infer restrictions from unreadable stylesheets", async () => {
    await page.setRequestInterception(true);
    const handler = (request: import("puppeteer").HTTPRequest) => {
      if (request.url() === "https://cross-origin.test/theme.css") void request.respond({
        status: 200, contentType: "text/css", body: "@media(orientation:portrait){main{rotate:90deg}}",
      });
      else void request.continue();
    };
    page.on("request", handler);
    try {
      expect((await scan("", '<link rel="stylesheet" href="https://cross-origin.test/theme.css"><main>Main content</main>')).issues).toEqual([]);
    } finally {
      page.off("request", handler);
      await page.setRequestInterception(false);
    }
  });
});
