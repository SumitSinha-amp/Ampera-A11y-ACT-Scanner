import { createServer, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanPageListAccesskeyRules, replacePageListAccesskeyResults } from "./page-accesskeys";
import type { BrowserRuleResult } from "./embedded-frame-scanner";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("page-wide custom list/access-key alignment", () => {
  let browser: Browser, server: Server, origin: string, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("./browser/index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    server = createServer((req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Security-Policy", "require-trusted-types-for 'script'; trusted-types 'none'");
      res.end(`<!doctype html><html><head><title>Child</title></head><body>${
        req.url === "/nested" ? `<iframe id="inner" src="${origin}/key"></iframe>` :
        `<button id="same" accesskey="${req.url === "/different" ? "b" : "a"}">Child</button><ul><div>Invalid child</div></ul>`
      }</body></html>`);
    });
    origin = await new Promise<string>(resolve => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as { port: number };
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  });
  async function open(html: string): Promise<Page> {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head><title>Host</title></head><body>${html}</body></html>`, { waitUntil: "load" });
    await page.evaluate(bundle);
    return page;
  }
  it("detects parent/child conflicts across origins under Trusted Types", async () => {
    const page = await open(`<button id="same" accesskey="a">Parent</button><iframe id="frame" src="${origin}/key"></iframe>`);
    try {
      expect(await page.evaluate(() => document.querySelector("iframe")!.contentDocument)).toBeNull();
      const result = await scanPageListAccesskeyRules(page, bundle);
      expect(result.issues).toHaveLength(2);
      expect(result.issues.map(issue => issue.selector)).toEqual(["button#same", "iframe#frame >>> button#same"]);
      expect(result.issues.every(issue => issue.type === "Best Practice")).toBe(true);
      expect(result.stats[0].totalChecked).toBe(2);
    } finally { await page.close(); }
  });
  it("detects sibling-frame conflicts without merging identical inner selectors", async () => {
    const page = await open(`<iframe id="first" src="${origin}/key"></iframe><iframe id="second" src="${origin}/key"></iframe>`);
    try {
      const result = await scanPageListAccesskeyRules(page, bundle);
      expect(result.issues).toHaveLength(2);
      expect(new Set(result.issues.map(issue => issue.selector)).size).toBe(2);
    } finally { await page.close(); }
  });
  it("accepts distinct keys across frames and keeps lists independent", async () => {
    const page = await open(`<button accesskey="a">Parent</button><iframe src="${origin}/different"></iframe>`);
    try {
      const result = await scanPageListAccesskeyRules(page, bundle, { includeLists: true });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].ruleId).toBe("ACT-R130");
      expect(result.stats.find(stat => stat.ruleId === "ACT-R131")?.totalChecked).toBe(2);
    } finally { await page.close(); }
  });
  it("uses rendered rather than visible frame scope, excluding only display:none", async () => {
    const page = await open(`<button accesskey="a">Parent</button>
      <iframe id="hidden" style="display:none" src="${origin}/key"></iframe>
      <iframe id="tiny" style="width:0;height:0;opacity:0" src="${origin}/key"></iframe>
      <iframe id="aria" aria-hidden="true" style="visibility:hidden" src="${origin}/key"></iframe>`);
    try {
      const result = await scanPageListAccesskeyRules(page, bundle, { includeLists: true });
      expect(result.issues.filter(issue => issue.ruleId === "ACT-R131")).toHaveLength(3);
      expect(result.issues.filter(issue => issue.ruleId === "ACT-R130")).toHaveLength(2);
      expect(result.issues.some(issue => issue.selector?.includes("iframe#hidden"))).toBe(false);
    } finally { await page.close(); }
  });
  it("qualifies nested findings and reports incomplete depth/frame/budget coverage", async () => {
    const page = await open(`<button accesskey="a">Parent</button><iframe id="outer" src="${origin}/nested"></iframe>`);
    try {
      const result = await scanPageListAccesskeyRules(page, bundle);
      expect(result.issues.map(issue => issue.selector)).toContain("iframe#outer >>> iframe#inner >>> button#same");
      for (const limits of [{ maxDepth: 1 }, { maxFrames: 1 }, { budgetMs: 0 }]) {
        const skipped: string[] = [];
        const limited = await scanPageListAccesskeyRules(page, bundle, {
          ...limits, onSkipped: detail => skipped.push(detail.reason),
        });
        expect(limited.ruleStatuses![0].status).toBe("failed");
        expect(skipped.length).toBeGreaterThan(0);
      }
    } finally { await page.close(); }
  });
  it("replaces document-local results without duplicates or broadening selection", async () => {
    const page = await open(`<ul><div>Bad</div></ul><button accesskey="a a">Repeat</button><iframe id="child" src="${origin}/key"></iframe>`);
    try {
      const main = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R131"] })) as BrowserRuleResult;
      const keys = await scanPageListAccesskeyRules(page, bundle);
      const merged = replacePageListAccesskeyResults(main, keys);
      expect(merged.issues).toHaveLength(2);
      expect(merged.issues.every(issue => issue.ruleId === "ACT-R131")).toBe(true);
      expect(merged.stats.filter(stat => stat.ruleId === "ACT-R131")).toHaveLength(1);
      expect(merged.stats[0].totalChecked).toBe(2);
      expect(merged.ruleStatuses!.find(status => status.ruleId === "ACT-R130")?.status).toBe("not-selected");
      const lists = await scanPageListAccesskeyRules(page, bundle, { includeLists: true, includeAccesskeys: false });
      expect(lists.issues).toHaveLength(2);
      expect(lists.issues.every(issue => issue.ruleId === "ACT-R130")).toBe(true);
    } finally { await page.close(); }
  });
});
