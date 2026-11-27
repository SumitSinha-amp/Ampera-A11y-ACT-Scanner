import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}

describe.skipIf(!existsSync(chromium))("ACT-R91 inline-important applicability", () => {
  let browser: Browser;
  let engine: string;
  beforeAll(async () => {
    engine = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, rules: string[] | null = ["ACT-R91"]) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html><head><title>Spacing fixture</title></head><body>${html}</body></html>`);
      await page.evaluate(engine);
      return await page.evaluate((rules) => {
        const w = window as unknown as { __ampera: { runAllRules: (options: { rules?: string[] }) => {
          issues: { ruleId: string; type: string; description: string; selector: string }[];
        } } };
        const before = document.body.innerHTML;
        const result = w.__ampera.runAllRules({ rules: rules ?? undefined });
        return {
          issues: result.issues.filter((row) => row.ruleId === "ACT-R91"),
          restored: before === document.body.innerHTML,
        };
      }, rules);
    } finally { await page.close(); }
  }

  it.each([
    '<h1 style="letter-spacing:-.02em">Readable heading</h1>',
    '<style>h1{letter-spacing:-.02em!important}</style><h1>Readable heading</h1>',
    '<style>h1{letter-spacing:-.02em!important;transition:all 1s}</style><h1>Readable heading</h1>',
    '<h1 style="letter-spacing:normal">Readable heading</h1>',
  ])("does not infer restrictive inline styles from defaults or stylesheets: %s", async (html) => {
    const result = await scan(html);
    expect(result.issues).toEqual([]);
    expect(result.restored).toBe(true);
  });
  it("keeps actual restrictive inline-important declarations as review findings", async () => {
    const result = await scan('<h1 style="letter-spacing:-.02em!important">Heading</h1>');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Potential Issue");
    expect(result.issues[0].description).toContain("does not establish clipping");
    expect(result.restored).toBe(true);
  });
  it.each([".12em", ".2em"])("accepts inline-important spacing at or above the test threshold: %s", async (spacing) => {
    const result = await scan(`<p style="letter-spacing:${spacing}!important">Readable paragraph</p>`);
    expect(result.issues).toEqual([]);
    expect(result.restored).toBe(true);
  });
  it("does not attribute an inherited inline-important declaration to its child", async () => {
    const result = await scan('<div style="letter-spacing:0!important"><h2>Inherits but can override spacing</h2></div>');
    expect(result.issues).toEqual([]);
    expect(result.restored).toBe(true);
  });
  it("preserves applicability in normal scans and respects explicit rule selection", async () => {
    const html = '<p style="letter-spacing:0!important">Review this authored declaration</p>';
    expect((await scan(html, null)).issues).toHaveLength(1);
    expect((await scan(html, ["ACT-R114"])).issues).toEqual([]);
  });
});
