import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { outcomeWcag } from "../../outcome-wcag";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R8 placeholder-only field reviews", () => {
  let browser: Browser, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function scan(html: string, rules: string[] = ["ACT-R8"]) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<html lang="en"><head><title>Fields</title></head><body>${html}</body></html>`);
      await page.addScriptTag({ content: bundle });
      return await page.evaluate(selected => (window as any).__ampera.runAllRules({ rules: selected }).issues, rules);
    } finally { await page.close(); }
  }
  it.each([
    '<input placeholder="Where from?">',
    '<input type="text" placeholder="Where to?">',
    '<input type="number" placeholder="Enter mobile number">',
    '<textarea placeholder="Message"></textarea>',
    '<input type="email" value="person@example.org" placeholder="Email">',
  ])("reports placeholder-only fields as review questions, not missing names: %s", async html => {
    const issues = await scan(html);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: "ACT-R8", type: "Potential Issue", impact: "moderate" });
    expect(issues[0].description).toContain("not a confirmed missing accessible name");
    expect(outcomeWcag(issues[0].ruleId, issues[0].type, null)).toEqual({ sc: ["3.3.2"], level: ["A"] });
  });
  it.each([
    '<label for="f">Origin</label><input id="f" placeholder="Where from?">',
    '<label>Origin<input placeholder="Where from?"></label>',
    '<input aria-label="Origin" placeholder="Where from?">',
    '<span id="name">Origin</span><input aria-labelledby="name" placeholder="Where from?">',
    '<input title="Origin" placeholder="Where from?">',
  ])("does not reclassify fields with an independent name: %s", async html => {
    expect(await scan(html)).toHaveLength(0);
  });
  it("keeps genuinely unnamed fields and checkboxes as confirmed issues", async () => {
    const issues = await scan('<input><input placeholder="   "><input type="checkbox" placeholder="Ignore">');
    expect(issues).toHaveLength(3);
    expect(issues.every((issue: any) => issue.type === "Issue")).toBe(true);
  });
  it("keeps dormant native fields but excludes semantically inactive controls", async () => {
    const issues = await scan(`
      <div style="display:none"><input placeholder="Dormant"></div>
      <div hidden><input placeholder="Hidden"></div>
      <div inert><input placeholder="Inert"></div>
      <div aria-hidden="true"><input placeholder="Hidden from AT"></div>
      <input type="hidden" placeholder="Value">
    `);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("Potential Issue");
  });
  it("preserves mixed outcomes without leaking into unrelated selections", async () => {
    const html = '<input placeholder="Origin"><input>';
    expect((await scan(html)).map((issue: any) => issue.type)).toEqual(["Potential Issue", "Issue"]);
    expect(await scan(html, ["ACT-R12"])).toHaveLength(0);
  });
});
