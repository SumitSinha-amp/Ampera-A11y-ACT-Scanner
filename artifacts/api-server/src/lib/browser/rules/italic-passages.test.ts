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
describe.skipIf(!existsSync(chromium))("ACT-R85 italic passages", () => {
  let browser: Browser, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  const words = (count: number) => Array(count).fill("reading").join(" ");
  async function scan(html: string, options: { rules?: string[] } = { rules: ["ACT-R85"] }) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Italic fixture</title></head><body>${html}</body></html>`);
      await page.evaluate(bundle);
      return await page.evaluate(options => {
        const before = document.documentElement.outerHTML;
        const result = (window as any).__ampera.runAllRules(options);
        return {
          issues: result.issues.filter((issue: any) => issue.ruleId === "ACT-R85"),
          unchanged: before === document.documentElement.outerHTML,
        };
      }, options);
    } finally { await page.close(); }
  }

  it("does not flag the Mars Special Offers paragraph label", async () => {
    expect((await scan('<p class="carousel-title" style="font-style:italic">Special Offers</p>')).issues).toEqual([]);
  });
  it("excludes short italic titles and emphasis", async () => {
    expect((await scan('<p style="font-style:italic">A short title with emphasis</p>')).issues).toEqual([]);
  });
  it("uses a conservative 20-word floor and preserves Best Practice classification", async () => {
    expect((await scan(`<p style="font-style:italic">${words(19)}</p>`)).issues).toEqual([]);
    const result = await scan(`<p style="font-style:italic">${words(20)}</p>`);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ type: "Best Practice", impact: "minor" });
    expect(result.unchanged).toBe(true);
  });
  it("does not count hidden child text toward the long passage threshold", async () => {
    expect((await scan(`<p style="font-style:italic">Special Offers<span hidden>${words(30)}</span></p>`)).issues).toEqual([]);
  });
  it("does not flag hidden long paragraphs", async () => {
    expect((await scan(`<p hidden style="font-style:italic">${words(30)}</p>`)).issues).toEqual([]);
  });
  it("does not claim mixed normal and italic text is fully italic", async () => {
    expect((await scan(`<p style="font-style:italic">${words(20)}<span style="font-style:normal">Normal text</span></p>`)).issues).toEqual([]);
  });
  it("detects inherited italic styling across inline markup", async () => {
    expect((await scan(`<div style="font-style:italic"><p>${words(10)} <span>${words(10)}</span></p></div>`)).issues).toHaveLength(1);
  });
  it("supports explicit paragraph roles", async () => {
    expect((await scan(`<div role="paragraph" style="font-style:italic">${words(20)}</div>`)).issues).toHaveLength(1);
  });
  it("keeps standard and explicit scans consistent", async () => {
    const html = `<p style="font-style:italic">${words(20)}</p>`;
    expect((await scan(html, {})).issues).toHaveLength(1);
    expect((await scan(html, { rules: ["ACT-R80"] })).issues).toEqual([]);
  });
});
