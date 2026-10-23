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

describe.skipIf(!existsSync(chromium))("ACT-R80 automatic line-height detection", () => {
  let browser: Browser;
  let bundle: string;
  let engine: string;
  beforeAll(async () => {
    const compile = (entry: string, globalName: string) => buildSync({
      entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife", globalName,
    }).outputFiles[0].text;
    bundle = compile("./text-style.ts", "TextStyle");
    engine = compile("../index.ts", "Scanner");
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, options: { full?: boolean; rules?: string[] } = {}) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Line-height regression</title>
        <style>body {font:16px/normal Arial}.tight-text{font-size:34px;line-height:18px}</style>
        </head><body>${html}</body></html>`);
      await page.addScriptTag({ content: options.full ? engine : bundle });
      return await page.evaluate(({ full, rules }) => {
        type Finding = { ruleId: string; type: string; selector: string; description: string };
        const globals = window as unknown as {
          TextStyle: { runTextStyleRules: (rows: Finding[], manual: boolean, stat: () => void) => void };
          __ampera: { runAllRules: (options: { rules?: string[] }) => {
            issues: Finding[]; ruleStatuses: { ruleId: string; status: string; executionTier: string }[];
          } };
        };
        const target = document.querySelector("p");
        const before = target?.getAttribute("style");
        let issues: Finding[] = [];
        let statuses: { ruleId: string; status: string; executionTier: string }[] = [];
        if (full) {
          const result = globals.__ampera.runAllRules({ rules });
          issues = result.issues;
          statuses = result.ruleStatuses;
        } else {
          globals.TextStyle.runTextStyleRules(issues, false, () => {});
        }
        return {
          issues: issues.filter((row) => row.ruleId === "ACT-R80"),
          status: statuses.find((row) => row.ruleId === "ACT-R80"),
          before, after: target?.getAttribute("style"),
        };
      }, options);
    } finally { await page.close(); }
  }

  const fixed = '<p class="tight-text">This paragraph has a large font and a fixed line height that does not scale.</p>';
  it("emits a measured Best Practice finding without manual-rule opt-in", async () => {
    const result = await scan(fixed);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ type: "Best Practice", selector: "p.tight-text" });
    expect(result.issues[0].description).toContain("34.0px to 68.0px");
    expect(result.issues[0].description).toContain("18.0px to 18.0px");
  });
  it("includes ACT-R80 in a standard all-rules scan", async () => {
    const result = await scan(fixed, { full: true });
    expect(result.issues).toHaveLength(1);
    expect(result.status).toMatchObject({ status: "executed", executionTier: "automatic" });
  });
  it("still honors explicit rule selection without broadening it", async () => {
    expect((await scan(fixed, { full: true, rules: ["ACT-R80"] })).issues).toHaveLength(1);
    expect((await scan(fixed, { full: true, rules: ["ACT-R85"] })).issues).toEqual([]);
  });
  it.each(["normal", "1.5", "1.5em", "150%"])("does not flag scalable/normal line-height: %s", async (lineHeight) => {
    expect((await scan(`<p style="font-size:34px;line-height:${lineHeight}">Readable paragraph text</p>`)).issues).toEqual([]);
  });
  it("excludes hidden and empty paragraphs", async () => {
    expect((await scan('<p class="tight-text" hidden>Hidden text</p><p class="tight-text"> </p>')).issues).toEqual([]);
  });
  it.each([null, "", "color: red; --authored: 2;"])("restores the exact authored style attribute: %s", async (style) => {
    const attribute = style === null ? "" : ` style="${style}"`;
    const result = await scan(`<p class="tight-text"${attribute}>Paragraph with authored styles</p>`);
    expect(result.issues).toHaveLength(1);
    expect(result.before).toBe(style);
    expect(result.after).toBe(style);
  });
});
