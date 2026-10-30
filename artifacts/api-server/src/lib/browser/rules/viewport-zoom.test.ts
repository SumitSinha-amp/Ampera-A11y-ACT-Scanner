import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateViewportZoom } from "./viewport-zoom";

describe("R47 Alfa viewport parsing semantics", () => {
  it.each([
    ["user-scalable=yes", true, false],
    ["maximum-scale=2.0", true, false],
    ["maximum-scale=-1", false, false],
    ["user-scalable=no", true, true],
    ["user-scalable=yes, initial-scale=0.8, maximum-scale=1.5", true, true],
    ["maximum-scale=1.0", true, true],
    ["maximum-scale=yes", true, true],
    ["width=device-width", false, false],
    ["", false, false],
    ["maximum-scale", false, false],
    ["user-scalable=", false, false],
    [" USER-SCALABLE = NO ; MAXIMUM-SCALE = 4 ", true, true],
    ["user-scalable=0", true, true],
    ["user-scalable=0.5", true, true],
    ["user-scalable=-0.5", true, true],
    ["user-scalable=1", true, false],
    ["user-scalable=-1", true, false],
    ["user-scalable=device-width", true, false],
    ["user-scalable=device-height", true, false],
    ["user-scalable=garbage", true, true],
    ["maximum-scale=0", true, true],
    ["maximum-scale=1.999", true, true],
    ["maximum-scale=2", true, false],
    ["maximum-scale=4", true, false],
    ["maximum-scale=no", true, true],
    ["maximum-scale=device-width", true, false],
    ["maximum-scale=device-height", true, false],
    ["maximum-scale=garbage", true, true],
    ["maximum-scale=1.5junk", true, true],
    ["user-scalable=none", true, true],
    ["maximum-scale=1,maximum-scale=4", true, false],
    ["maximum-scale=4;maximum-scale=1", true, true],
    ["maximum-scale=1;maximum-scale=-1", false, false],
    ["maximum-scale=1;maximum-scale=", true, true],
    ["user-scalable=no;user-scalable=yes", true, false],
    ["user-scalable=no;user-scalable=", true, true],
    ["maximum-scale ignored = = === 1.5", true, true],
    ["user-scalable\xa0=\tNO", true, true],
    ["not-maximum-scale=1,not-user-scalable=no", false, false],
    ["maximum-scale=20", true, false],
    // Alfa lowercases the value first; Number("infinity") is NaN.
    ["maximum-scale=Infinity", true, true],
  ] as const)("parses %s with applicable=%s, failure=%s", (content, applicable, fails) => {
    expect(evaluateViewportZoom(content)).toMatchObject({ applicable, fails });
  });

  it("clamps maximum-scale exactly as Alfa does", () => {
    expect(evaluateViewportZoom("maximum-scale=0").maximumScale).toBe(0.1);
    expect(evaluateViewportZoom("maximum-scale=20").maximumScale).toBe(10);
  });
});

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}

describe.skipIf(!existsSync(chromium))("R47 browser integration / W3C b4f0c3 fixtures", () => {
  let browser: Browser;
  let page: Page;
  let bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    page = await browser.newPage();
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(meta: string, options: { rules?: string[]; emitManualOnlyRules?: boolean } = { rules: ["ACT-R47"] }) {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Viewport fixture</title>${meta}</head><body><main><p>Visible content</p></main></body></html>`);
    await page.evaluate(bundle);
    return page.evaluate(options => {
      const result = (window as any).__ampera.runAllRules(options);
      return {
        issues: result.issues.filter((issue: any) => issue.ruleId === "ACT-R47"),
        stats: result.stats.filter((stat: any) => stat.ruleId === "ACT-R47"),
        status: result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R47"),
      };
    }, options);
  }

  // All published W3C b4f0c3 examples: negative maximum-scale is discarded
  // (no failed outcome), consistent with Alfa's applicability filtering.
  it.each([
    ['<meta name="viewport" content="user-scalable=yes">', 0],
    ['<meta name="viewport" content="maximum-scale=2.0">', 0],
    ['<meta name="viewport" content="maximum-scale=-1">', 0],
    ['<meta name="viewport" content="user-scalable=no">', 1],
    ['<meta name="viewport" content="user-scalable=yes, initial-scale=0.8, maximum-scale=1.5">', 1],
    ['<meta name="viewport" content="maximum-scale=1.0">', 1],
    ['<meta name="viewport" content="maximum-scale=yes">', 1],
    ['<meta charset="UTF-8">', 0],
    ['<meta name="viewport">', 0],
    ['<meta name="viewport" content="width=device-width">', 0],
    ['<meta name="viewport" content="">', 0],
  ] as const)("matches the published fixture %s", async (meta, count) => {
    expect((await scan(meta)).issues).toHaveLength(count);
  });

  it("checks all targets with distinct selectors, including mixed-case names and declarations", async () => {
    const result = await scan('<meta name="viewport" content="maximum-scale=4"><meta name="VIEWPORT" content="USER-SCALABLE = NO"><meta name="viewport" content="maximum-scale=1.5">');
    expect(result.issues).toHaveLength(2);
    expect(new Set(result.issues.map((issue: any) => issue.selector)).size).toBe(2);
    expect(result.stats).toEqual([{ ruleId: "ACT-R47", totalChecked: 3, scope: "element" }]);
    expect(result.status.status).toBe("executed");
  });

  it("is not applicable when no usable restriction property is present", async () => {
    const result = await scan('<meta name="viewport" content="width=device-width"><meta name="viewport" content="maximum-scale=-1">');
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([{ ruleId: "ACT-R47", totalChecked: 0, scope: "element" }]);
    expect(result.status.status).toBe("not-applicable");
  });

  it("preserves the HindiPod101 markup finding with qualified browser-support wording", async () => {
    const result = await scan('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ type: "Issue", impact: "serious" });
    expect(result.issues[0].description).toContain("below the required 2 (200%)");
    expect(result.issues[0].description).toContain("Desktop browsers and many modern mobile browsers ignore or override");
    expect(result.issues[0].description).not.toContain("Viewport zoom is disabled via meta tag");
  });

  it("uses identical outcomes in normal, explicit, and manual-enabled scans", async () => {
    const meta = '<meta name="viewport" content="maximum-scale=1.5">';
    const normal = await scan(meta, {});
    expect(await scan(meta)).toEqual(normal);
    expect(await scan(meta, { rules: ["ACT-R47"], emitManualOnlyRules: true })).toEqual(normal);
    const excluded = await scan(meta, { rules: ["ACT-R96"] });
    expect(excluded.issues).toEqual([]);
    expect(excluded.stats).toEqual([]);
    expect(excluded.status.status).toBe("not-selected");
  });

  it("does not apply to SVG-namespace meta elements", async () => {
    await page.setContent('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await page.evaluate(() => {
      const meta = document.createElementNS("http://www.w3.org/2000/svg", "meta");
      meta.setAttribute("name", "viewport");
      meta.setAttribute("content", "user-scalable=no");
      document.querySelector("svg")!.append(meta);
    });
    await page.evaluate(bundle);
    const count = await page.evaluate(() =>
      (window as any).__ampera.runAllRules({ rules: ["ACT-R47"] }).issues.length);
    expect(count).toBe(0);
  });
});
