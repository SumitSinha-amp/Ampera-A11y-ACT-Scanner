import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyScrollTargets } from "./scroll-target-verification";

let chromium = "";
try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium = puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("scroll-revealed R113 controls", () => {
  let browser: Browser;
  let engine: string;
  beforeAll(async () => {
    engine = buildSync({
      entryPoints: [fileURLToPath(new URL("./browser/index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  const scan = (page: Page) => page.evaluate(() =>
    (window as any).__ampera.runAllRules({ rules: ["ACT-R113"] }));
  async function fixture() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 800 });
    await page.setContent(`<!doctype html><style>
      body {margin:0;height:3500px} .row {position:absolute;left:100px;opacity:0}
      button {width:12px;height:12px;margin:0 8px 0 0;padding:0;border:0;border-radius:50%}
      #first {top:1200px} #second {top:2400px} #hidden {top:1220px}
    </style>
    <div class="row" id="first"><button id="a" aria-label="Slide 1"></button><button id="b" aria-label="Slide 2"></button></div>
    <div class="row" id="second"><button id="c" aria-label="Slide 1"></button><button id="d" aria-label="Slide 2"></button></div>
    <div class="row" id="hidden"><button id="never" aria-label="Hidden"></button></div>
    <script>addEventListener('scroll', () => {
      for (const id of ['first','second']) {
        const el=document.getElementById(id), r=el.getBoundingClientRect();
        el.style.opacity=r.top>=0&&r.bottom<innerHeight?'1':'0';
      }
    });</script>`);
    await page.evaluate(engine);
    return page;
  }
  it("finds crowded carousel dots at both scroll positions and preserves viewport evidence", async () => {
    const page = await fixture();
    try {
      expect((await scan(page)).issues).toEqual([]);
      const result = await verifyScrollTargets(page, {
        scan: () => scan(page),
        captureEvidence: async () => ({
          screenshot: Buffer.from(await page.screenshot()).toString("base64"),
          pageHtml: await page.content(),
        }),
      });
      expect(result.complete).toBe(true);
      expect(result.issues.map(issue => issue.selector).sort()).toEqual(["button#a", "button#b", "button#c", "button#d"]);
      expect(result.issues.every(issue => issue.type === "Issue" &&
        issue.bboxY! >= 0 && issue.bboxY! < 800 &&
        result.states.some(state => state.key === issue.interactionStateKey))).toBe(true);
      expect(result.states).toHaveLength(2);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(await page.$eval("#hidden", el => getComputedStyle(el).opacity)).toBe("0");
    } finally { await page.close(); }
  }, 15000);
  it("reports truncated coverage instead of a clean pass", async () => {
    const page = await fixture();
    try {
      const result = await verifyScrollTargets(page, {
        scan: () => scan(page), maxStates: 0,
        captureEvidence: async () => ({ screenshot: "", pageHtml: "" }),
      });
      expect(result.complete).toBe(false);
      expect(result.issues).toEqual([]);
    } finally { await page.close(); }
  });
  it("restores the original scroll position if evidence capture fails", async () => {
    const page = await fixture();
    try {
      await expect(verifyScrollTargets(page, {
        scan: () => scan(page),
        captureEvidence: async () => { throw new Error("capture failed"); },
      })).rejects.toThrow("capture failed");
      expect(await page.evaluate(() => scrollY)).toBe(0);
    } finally { await page.close(); }
  });
  it("does not classify empty CSS dots as uncertain because of unused web fonts", async () => {
    const page = await fixture();
    try {
      await page.evaluate(() => {
        document.fonts.add(new FontFace("Unused", 'url("https://unused.invalid/font.woff2")'));
        document.getElementById("first")!.style.fontFamily = "Unused";
        scrollTo(0, 1000);
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      const result = await scan(page);
      expect(result.issues).toHaveLength(2);
      expect(result.issues.every((issue: any) => issue.type === "Issue")).toBe(true);
    } finally { await page.close(); }
  });
});
