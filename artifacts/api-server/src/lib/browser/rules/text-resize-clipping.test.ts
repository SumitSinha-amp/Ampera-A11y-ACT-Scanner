import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULE_REGISTRY } from "../registry";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}

describe("ACT-R83 active product policy", () => {
  it("automatically executes without a manual-only gate", () => {
    expect(RULE_REGISTRY.find(rule => rule.id === "ACT-R83")).toMatchObject({
      executionTier: "automatic", manual: false,
    });
  });

  it("keeps client and server metadata active, regardless of upstream deprecation", () => {
    const server = readFileSync(fileURLToPath(new URL("../../scanner.ts", import.meta.url)), "utf8");
    const client = readFileSync(fileURLToPath(new URL("../../../../../accessibility-scanner/src/lib/actRules.ts", import.meta.url)), "utf8");
    for (const source of [server, client]) {
      const entry = source.match(/"ACT-R83": \{\s*\n[\s\S]*?\n  \},/)?.[0] ?? "";
      expect(entry).toContain("Text is clipped when resized");
      expect(entry).not.toContain("deprecated:");
      expect(entry).not.toContain("deprecatedReason:");
    }
  });

  it("does not hide R83 from Smart Analysis or label its reports and picker deprecated", () => {
    for (const filename of ["scan-detail", "page-report", "site-rule-page-report"]) {
      const source = readFileSync(fileURLToPath(new URL(`../../../../../accessibility-scanner/src/pages/${filename}.tsx`, import.meta.url)), "utf8");
      const deprecatedSet = source.match(/const DEPRECATED_RULES = new Set\(([^;]+)\)/)?.[1];
      expect(deprecatedSet).toBeDefined();
      expect(deprecatedSet).not.toContain("ACT-R83");
    }
    const home = readFileSync(fileURLToPath(new URL("../../../../../accessibility-scanner/src/pages/home.tsx", import.meta.url)), "utf8");
    expect(home.match(/id: "ACT-R83",\s*label: "([^"]+)"/)?.[1]).not.toContain("DEPRECATED");
  });
});

describe.skipIf(!existsSync(chromium))("ACT-R83 scan-mode parity", () => {
  let browser: Browser;
  let bundle: string;
  const fixture = `<style>
    #r83-fail-box {height:50px;overflow:hidden;border:1px solid;padding:6px;font-size:16px}
    #r83-fail-box.zoomed {font-size:32px}
  </style><main><div id="r83-fail-box"><p>This text will be clipped once the container is zoomed, because the box height is fixed.</p></div></main>`;

  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, options: { rules?: string[]; emitManualOnlyRules?: boolean }) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Resize fixture</title></head><body>${html}</body></html>`);
      await page.evaluate(bundle);
      return await page.evaluate(options => {
        const box = document.getElementById("r83-fail-box");
        const before = box?.textContent;
        const result = (window as any).__ampera.runAllRules(options);
        return {
          issues: result.issues.filter((issue: any) => issue.ruleId === "ACT-R83"),
          status: result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R83"),
          unchanged: box?.textContent === before,
        };
      }, options);
    } finally { await page.close(); }
  }

  it("reports the supplied fixed-height fixture in normal and explicit scans identically", async () => {
    const normal = await scan(fixture, {});
    expect(normal.issues).toEqual([expect.objectContaining({
      selector: "div#r83-fail-box", type: "Potential Issue",
    })]);
    expect(normal.status).toMatchObject({ status: "executed", executionTier: "automatic" });
    expect(normal.unchanged).toBe(true);
    for (const options of [
      { rules: ["ACT-R83"] },
      { rules: ["ACT-R83"], emitManualOnlyRules: false },
      { rules: ["ACT-R83"], emitManualOnlyRules: true },
    ]) expect(await scan(fixture, options)).toEqual(normal);
  });

  it("also reports the fixture with doubled font size without altering the page", async () => {
    const result = await scan(fixture.replace('id="r83-fail-box"', 'id="r83-fail-box" class="zoomed"'), {});
    expect(result.issues).toHaveLength(1);
    expect(result.unchanged).toBe(true);
  });

  it.each([
    '<main><div style="overflow:hidden"><p>Automatic height grows to fit this text.</p></div></main>',
    '<main><div style="height:50px;overflow:auto"><p>Content is available through scrolling.</p></div></main>',
    '<main><div style="display:none;height:50px;overflow:hidden">Inactive hidden text is not a resize failure.</div></main>',
  ])("does not report non-clipping or inactive containers: %s", async html => {
    expect((await scan(html, {})).issues).toEqual([]);
  });

  it("honors explicit exclusion of R83", async () => {
    const result = await scan(fixture, { rules: ["ACT-R98"] });
    expect(result.issues).toEqual([]);
    expect(result.status.status).toBe("not-selected");
  });
});
