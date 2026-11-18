import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
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
  let discover: (page: Page) => Promise<{ selector: string; label: string }[]>;
  let explore: (...args: any[]) => Promise<any>;
  const scannerTestModule = fileURLToPath(new URL(`../../../../dist/r113-interactions-${process.pid}.mjs`, import.meta.url));
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
    // Bundle the real scanner functions, not hand-written copies of exploration.
    // This also uses the production browser bundle rather than tsx transforms.
    const scannerPath = fileURLToPath(new URL("../../scanner.ts", import.meta.url));
    buildSync({
      stdin: {
        contents: readFileSync(scannerPath, "utf8") + "\nexport { discoverSafeInteractionTriggers, exploreInteractiveStates };",
        resolveDir: fileURLToPath(new URL("../../", import.meta.url)), loader: "ts",
      },
      outfile: scannerTestModule, bundle: true, platform: "node", format: "esm", packages: "external",
      define: { __AMPERA_BROWSER_BUNDLE__: JSON.stringify(engine) },
      banner: { js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);' },
    });
    const scanner = await import(scannerTestModule);
    discover = scanner.discoverSafeInteractionTriggers;
    explore = scanner.exploreInteractiveStates;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    rmSync(scannerTestModule, { force: true });
  });

  async function scan(html: string, full = false) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Target test</title>
        <style>body{margin:0} .small{display:inline-block;width:16px;height:16px;padding:0;border:0;margin:0}
        .large{display:inline-block;width:40px;height:40px} .close{cursor:pointer}</style>
        </head><body>${html}</body></html>`);
      await page.evaluate(engine);
      return await page.evaluate((full) => (window as any).__ampera
        .runAllRules(full ? {} : { rules: ["ACT-R113"] }).issues
        .filter((issue: any) => issue.ruleId === "ACT-R113"), full);
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

  const shortRow = (top: number, prefix: string) =>
    [0, 1, 2].map(index => `<button id="${prefix}${index}" style="position:absolute;left:${index * 48}px;top:${top}px;width:48px;height:16px;padding:0;border:0">Go</button>`).join("");

  it.each([false, true])("passes a single row of wide short buttons in full=%s scans", async (full) => {
    expect(await scan(shortRow(0, "single"), full)).toEqual([]);
  });

  it.each([false, true])("confirms failures for closely stacked short rows in full=%s scans", async (full) => {
    const result = await scan(shortRow(0, "top") + shortRow(17, "bottom"), full);
    expect(result.map((issue: any) => issue.selector).sort()).toEqual([
      "button#bottom0", "button#bottom1", "button#bottom2",
      "button#top0", "button#top1", "button#top2",
    ]);
    expect(result.every((issue: any) => issue.type === "Issue")).toBe(true);
  });

  it("passes stacked rows at exactly 24px center distance", async () => {
    expect(await scan(shortRow(0, "top") + shortRow(24, "bottom"))).toEqual([]);
  });

  it("passes 20px controls separated by exactly 4px, without demanding a 24px edge gap", async () => {
    expect(await scan('<button class="small" style="width:20px;height:20px">A</button><button class="small" style="width:20px;height:20px;margin-left:4px">B</button>')).toEqual([]);
  });

  it("checks circle-to-circle overlap even when neither circle overlaps the other target", async () => {
    const result = await scan('<button class="small" style="width:4px;height:4px">A</button><button class="small" style="width:4px;height:4px;margin-left:16px">B</button>');
    expect(result).toHaveLength(2);
    expect(result.every((issue: any) => issue.type === "Issue")).toBe(true);
  });

  it("checks a short target's circle against a sufficiently sized neighboring target", async () => {
    const result = await scan('<button id="small" class="small">A</button><button id="large" class="large" style="vertical-align:top">B</button>');
    expect(result.map((issue: any) => issue.selector)).toEqual(["button#small"]);
  });

  it("does not stop at a safely spaced neighbor and miss a later crowded row", async () => {
    const result = await scan(shortRow(0, "top") + shortRow(80, "safe") + shortRow(17, "bottom"));
    expect(result).toHaveLength(6);
    expect(result.some((issue: any) => issue.selector.includes("safe"))).toBe(false);
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

  it("exempts sentence-inline links but not standalone crowded icon links", async () => {
    const result = await scan(`<p>Read <a id="policy" href="#">our cookie policy</a> before continuing.</p>
      <a id="icon" href="#" class="small">?</a><button class="small">B</button>`);
    expect(result.some((issue: any) => issue.selector === "a#policy")).toBe(false);
    expect(result.some((issue: any) => issue.selector === "a#icon")).toBe(true);
  });

  it("ignores the covered portion of a background target beneath an overlay", async () => {
    const result = await scan(`<a href="#" style="position:absolute;left:0;top:0;width:200px;height:200px">Background</a>
      <div style="position:absolute;left:0;top:0;width:200px;height:40px;background:white">
        <button id="overlay" class="small" style="position:absolute;left:60px;top:10px">?</button>
      </div>`);
    expect(result.some((issue: any) => issue.selector === "button#overlay")).toBe(false);
  });

  it("still detects a real crowded neighbor in the foreground overlay", async () => {
    const result = await scan(`<a href="#" style="position:absolute;width:200px;height:200px">Background</a>
      <div style="position:absolute;width:200px;height:40px;background:white">
        <button id="overlay" class="small">?</button><button class="small">B</button>
      </div>`);
    expect(result.some((issue: any) => issue.selector === "button#overlay")).toBe(true);
  });

  it("does not report fully covered small targets while preserving off-screen geometry checks", async () => {
    const result = await scan(`<button id="covered" class="small" style="position:absolute;left:0;top:0">A</button>
      <button class="small" style="position:absolute;left:16px;top:0">B</button>
      <div style="position:absolute;left:0;top:0;width:100px;height:50px;background:white"></div>
      <button id="offscreen" class="small" style="position:absolute;left:0;top:2000px">A</button>
      <button class="small" style="position:absolute;left:16px;top:2000px">B</button>`);
    expect(result.some((issue: any) => issue.selector === "button#covered")).toBe(false);
    expect(result.some((issue: any) => issue.selector === "button#offscreen")).toBe(true);
  });

  it("keeps failed authored font geometry reviewable, including icon pseudo-elements", async () => {
    const result = await scan(`<style>
      @font-face{font-family:MissingIcon;src:url(data:font/woff2;base64,AAAA)}
      #font::before{font-family:MissingIcon;content:"x"}
      </style><button id="font" class="small"></button><button class="small">B</button>`);
    const finding = result.find((issue: any) => issue.selector === "button#font");
    expect(finding).toMatchObject({ type: "Potential Issue" });
    expect(finding.description).toContain("fonts did not load");
  });

  it("discovers nested safe states before closing their parent and retains matching evidence", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<button type="button" id="show" aria-expanded="false"
        onclick="document.querySelector('#types').hidden=false;this.setAttribute('aria-expanded','true')">Show passenger types</button>
        <div id="types" hidden>
          <input id="count" type="number" value="0">
          <button type="button" id="add" aria-label="Add passenger" aria-controls="count"
            onclick="document.querySelector('#age').hidden=false;document.querySelector('#count').value++">+</button>
          <button type="button" id="remove" onclick="window.unsafeClicked=true">Remove passenger</button>
          <button type="submit" id="submit" onclick="window.unsafeClicked=true">Show results</button>
          <div id="age" hidden><a id="ageHelp" href="#" onclick="return false"
            style="display:inline-block;width:16px;height:16px">?</a><input aria-label="Age" style="width:80px;height:30px"></div>
        </div>`);
      const triggers = await discover(page);
      expect(triggers.map(trigger => trigger.selector)).toEqual(["#show"]);
      const result = await explore(page, triggers, new Map(), ["ACT-R113"]);
      const finding = result.issues.find((issue: any) => issue.selector === "a#ageHelp");
      expect(finding).toMatchObject({ ruleId: "ACT-R113", type: "Issue" });
      const state = result.states.find((state: any) => state.key === finding.interactionStateKey);
      expect(state.triggerSelector).toBe("#add");
      expect(state.screenshot.length).toBeGreaterThan(0);
      expect(state.pageHtml).toContain('id="ageHelp"');
      expect(await page.evaluate(() => (window as any).unsafeClicked)).toBeUndefined();
      expect(await page.$eval("#count", el => (el as HTMLInputElement).value)).toBe("1");
    } finally { await page.close(); }
  }, 30000);
});
