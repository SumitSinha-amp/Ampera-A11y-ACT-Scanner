import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nonDescriptiveTitleReason } from "./page-title";

describe("R114 placeholder title recognition", () => {
  it.each([
    "[INSERT TITLE HERE]", " [ insert  title here ] ", "INSERT TITLE HERE",
    "Enter your page title here", "[Add a title]", "{replace document title}",
    "{{title}}", "{{ page_title }}", "${pageTitle}", "<%= documentTitle %>",
  ])("recognizes the authoring placeholder %s", title => {
    expect(nonDescriptiveTitleReason(title)).toBe("placeholder");
  });
  it.each(["Home", "INDEX", "Untitled", "New Page", "Welcome"])("retains generic title coverage for %s", title => {
    expect(nonDescriptiveTitleReason(title)).toBe("generic");
  });
  it.each([
    "", " ", "Recipe Dashboard", "Home | Awesome Recipes", "Welcome to Awesome Recipes",
    "How to insert title here in a template", "Insert Title Here: A Novel",
    "Title", "Document management", "東京のレシピ", "Recipe [Title] Guide",
  ])("does not invent a failure for %s", title => {
    expect(nonDescriptiveTitleReason(title)).toBeNull();
  });
});

let chromium = "";
try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium = puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("R114 browser rule integration", () => {
  let browser: Browser;
  let engine: string;
  beforeAll(async () => {
    engine = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function scan(title: string, rules?: string[]) {
    const page = await browser.newPage();
    try {
      await page.setContent("<!doctype html><html lang=en><head></head><body><h1>Recipe Dashboard (with intentional a11y issues)</h1></body></html>");
      await page.evaluate(title => { document.title = title; }, title);
      await page.evaluate(engine);
      return await page.evaluate(rules =>
        (window as any).__ampera.runAllRules({ rules }).issues, rules);
    } finally { await page.close(); }
  }
  it("finds the exact workshop placeholder in explicit and standard scans", async () => {
    for (const rules of [["ACT-R114"], undefined]) {
      const issues = await scan("[INSERT TITLE HERE]", rules);
      expect(issues.filter((issue: any) => issue.ruleId === "ACT-R114")).toEqual([
        expect.objectContaining({ type: "Issue", selector: "head > title",
          element: "<title>[INSERT TITLE HERE]</title>",
          description: expect.stringContaining("unreplaced placeholder") }),
      ]);
    }
  });
  it("keeps missing titles in R1 rather than duplicating R114", async () => {
    const issues = await scan("", ["ACT-R1", "ACT-R114"]);
    expect(issues.map((issue: any) => issue.ruleId)).toEqual(["ACT-R1"]);
  });
  it("honors explicit rule exclusion", async () => {
    expect(await scan("[INSERT TITLE HERE]", ["ACT-R1"])).toEqual([]);
  });
  it("does not mistake a valid descriptive title for a failure", async () => {
    expect(await scan("Awesome Recipes — Recipe Dashboard", ["ACT-R114"])).toEqual([]);
  });
  it("escapes title markup in the recorded HTML evidence", async () => {
    const issues = await scan("<insert title here>", ["ACT-R114"]);
    expect(issues[0]?.element).toBe("<title>&lt;insert title here&gt;</title>");
  });
});
