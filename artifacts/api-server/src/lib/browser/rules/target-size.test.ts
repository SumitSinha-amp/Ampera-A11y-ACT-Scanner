import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}

describe.skipIf(!existsSync(chromium))("ACT-R113 rendered target geometry", () => {
  let browser: Browser;
  let engine: string;
  let hydrate: (page: Page, urls: Set<string>, timeout?: number) => Promise<void>;
  beforeAll(async () => {
    engine = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    const hydrationModule = buildSync({
      entryPoints: [fileURLToPath(new URL("../../target-image-hydration.ts", import.meta.url))],
      bundle: true, write: false, platform: "node", format: "esm",
    }).outputFiles[0].text;
    hydrate = (await import(`data:text/javascript;base64,${Buffer.from(hydrationModule).toString("base64")}`)).hydrateTargetImages;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Target test</title>
        <style>body{margin:0} .small{display:inline-block;width:16px;height:16px;padding:0;border:0;margin:0}
        .large{display:inline-block;width:40px;height:40px} .close{cursor:pointer}</style>
        </head><body>${html}</body></html>`);
      await page.evaluate(engine);
      return await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R113"] }).issues);
    } finally { await page.close(); }
  }

  it("reports undersized, crowded native targets and keeps sufficient-size targets passing", async () => {
    const result = await scan('<button id="a" class="small">A</button><button id="b" class="small">B</button><button id="large" class="large">OK</button>');
    expect(result.map((issue: any) => issue.selector)).toEqual(["button#a", "button#b"]);
    expect(result.every((issue: any) => issue.type === "Issue")).toBe(true);
  });

  it("does not flag isolated undersized controls that have enough spacing", async () => {
    expect(await scan('<button class="small">A</button><button class="small" style="margin-left:60px">B</button>')).toEqual([]);
  });

  it("includes a delegated pointer-only close anchor without href or tabindex", async () => {
    const result = await scan('<a id="close" class="close small" title="Close"></a><button class="small">B</button>');
    expect(result.some((issue: any) => issue.selector === "a#close")).toBe(true);
  });

  it("includes direct onclick controls and listener-tracked custom buttons", async () => {
    const result = await scan(`<div id="custom-button" class="small" onclick="window.clicked=true"></div><button class="small">B</button>
      <div id="next-button" class="small"></div><script>
      window.__amperaClickTargets__=new WeakSet([document.getElementById('next-button')]);
      </script>`);
    expect(result.map((issue: any) => issue.selector)).toContain("div#custom-button");
    expect(result.map((issue: any) => issue.selector)).toContain("div#next-button");
  });

  it("excludes decorative, disabled, hidden, and pointer-disabled pseudo-controls", async () => {
    const result = await scan(`<a class="small close" title="Close" style="display:none"></a>
      <div class="small button">Not interactive</div><div class="small button" onclick="" aria-disabled="true"></div>
      <a class="small close" title="Close" style="pointer-events:none"></a><button disabled class="small">B</button>`);
    expect(result).toEqual([]);
  });

  it("uses descendant image artwork rather than only a short inline parent box", async () => {
    const result = await scan('<a href="#" id="badge"><svg width="130" height="38"></svg></a><button class="small">B</button>');
    expect(result.some((issue: any) => issue.selector === "a#badge")).toBe(false);
  });

  it("does not label unresolved image fallback geometry as a confirmed failure", async () => {
    const result = await scan('<a id="broken" href="#"><img src="data:image/png,invalid"></a><button class="small">B</button>');
    const finding = result.find((issue: any) => issue.selector === "a#broken");
    expect(finding).toMatchObject({ type: "Potential Issue" });
    expect(finding.description).toContain("artwork did not load");
  });

  it("retries only control artwork before evaluating targets, including redirected and responsive images", async () => {
    const page = await browser.newPage();
    const allowed = new Set<string>();
    const requests: string[] = [];
    const artwork = '<svg xmlns="http://www.w3.org/2000/svg" width="130" height="38"><rect width="130" height="38"/></svg>';
    try {
      await page.setRequestInterception(true);
      page.on("request", request => {
        requests.push(request.url());
        if (request.resourceType() === "image" && !allowed.has(request.url()) &&
          !request.redirectChain().some(previous => allowed.has(previous.url()))) {
          void request.abort(); return;
        }
        if (request.url().endsWith("/redirect.svg")) {
          void request.respond({ status: 302, headers: { location: "https://target.test/final.svg" } }); return;
        }
        void request.respond({ status: 200, contentType: "image/svg+xml", body: artwork });
      });
      await page.setContent(`<a href="#" id="badge"><picture><source srcset="https://target.test/redirect.svg 1x">
        <img src="https://target.test/fallback.svg"></picture></a>
        <img src="https://target.test/unrelated.svg"><button style="width:16px;height:16px">B</button>`);
      expect(await page.$eval("#badge img", img => img.naturalWidth)).toBe(0);
      await hydrate(page, allowed, 1500);
      expect(await page.$eval("#badge img", img => img.naturalWidth)).toBe(130);
      expect(await page.$eval("body > img", img => img.naturalWidth)).toBe(0);
      expect(allowed.has("https://target.test/unrelated.svg")).toBe(false);
      expect(requests).toContain("https://target.test/final.svg");
      await page.evaluate(engine);
      const result = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R113"] }).issues);
      expect(result.some((issue: any) => issue.selector === "a#badge")).toBe(false);
    } finally { await page.close(); }
  });

  it("bounds failed artwork retries and leaves them reviewable", async () => {
    const page = await browser.newPage();
    try {
      await page.setRequestInterception(true);
      page.on("request", request => { void request.abort(); });
      await page.setContent('<a href="#"><img src="https://target.test/broken.png"></a>');
      await hydrate(page, new Set(), 100);
      expect(await page.$eval("img", img => img.naturalWidth)).toBe(0);
    } finally { await page.close(); }
  });
});
