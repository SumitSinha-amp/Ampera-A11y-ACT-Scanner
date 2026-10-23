import { createServer, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { scanEmbeddedFrames, mergeEmbeddedResults, getEmbeddedFrameBoxes, type BrowserRuleResult } from "./embedded-frame-scanner";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}
const emptyResult = (): BrowserRuleResult => ({ issues: [], stats: [], ruleStatuses: [] });

describe("embedded result aggregation", () => {
  it("sums document checks and preserves explicit exclusions", () => {
    const main: BrowserRuleResult = {
      ...emptyResult(),
      stats: [{ ruleId: "ACT-R18", totalChecked: 2, scope: "element" }],
      ruleStatuses: [
        { ruleId: "ACT-R18", status: "not-applicable", executionTier: "automatic" },
        { ruleId: "ACT-R110", status: "not-selected", executionTier: "automatic" },
      ],
    };
    const embedded: BrowserRuleResult = {
      ...emptyResult(),
      stats: [{ ruleId: "ACT-R18", totalChecked: 3, scope: "element" }],
      ruleStatuses: [
        { ruleId: "ACT-R18", status: "executed", executionTier: "automatic" },
        { ruleId: "ACT-R110", status: "executed", executionTier: "automatic" },
      ],
    };
    const merged = mergeEmbeddedResults(main, embedded);
    expect(merged.stats).toEqual([{ ruleId: "ACT-R18", totalChecked: 5, scope: "element" }]);
    expect(merged.ruleStatuses).toContainEqual({ ruleId: "ACT-R18", status: "executed", executionTier: "automatic" });
    expect(merged.ruleStatuses).toContainEqual({ ruleId: "ACT-R110", status: "not-selected", executionTier: "automatic" });
  });
});

describe.skipIf(!existsSync(chromium))("embedded document scanning", () => {
  let browser: Browser;
  let mainServer: Server;
  let childServer: Server;
  let childOrigin: string;
  let mainOrigin: string;
  let bundle: string;
  const listen = (server: Server) => new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
    });
  });

  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("./browser/index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    childServer = createServer((req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Security-Policy", "require-trusted-types-for 'script'; trusted-types 'none'");
      res.end(`<!doctype html><html lang="en"><head><title>Child fixture</title><style>
        body{margin:0}#movie_player{position:absolute;left:12px;top:20px;width:160px;height:40px}
        iframe{position:absolute;left:25px;top:30px;width:250px;height:120px;border:0}
        </style></head><body>${req.url === "/nested"
          ? `<iframe id="inner" src="${childOrigin}/child"></iframe>`
          : '<div id="movie_player" aria-label="YouTube Video Player">Player controls</div><div role="not-a-role">Invalid role fixture</div>'
        }</body></html>`);
    });
    childOrigin = await listen(childServer);
    mainServer = createServer((req, res) => {
      res.setHeader("Content-Type", "text/html");
      const nested = req.url === "/nested";
      const second = req.url === "/two";
      res.end(`<!doctype html><html lang="en"><head><title>Host fixture</title><style>
        body{margin:0;min-height:1800px}iframe{position:absolute;left:100px;top:160px;width:400px;height:200px;border:0}
        #second{left:550px}#tracking{width:0;height:0}#hidden{display:none}
        </style></head><body>
        <div id="movie_player" role="group" aria-label="Main document player">Different main-document element</div>
        <iframe id="external" src="${childOrigin}/${nested ? "nested" : "child?token=fixture-token"}"></iframe>
        ${second ? `<iframe id="second" src="${childOrigin}/child"></iframe>` : ""}
        <iframe id="hidden" src="${childOrigin}/child"></iframe>
        <iframe id="tracking" src="${childOrigin}/child"></iframe>
        </body></html>`);
    });
    mainOrigin = await listen(mainServer);
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await Promise.all([mainServer, childServer].filter(Boolean).map((server) =>
      new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  async function open(route = "/") {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.goto(`${mainOrigin}${route}`, { waitUntil: "load" });
    return page;
  }

  it("finds the real generic-label defect across origins despite Trusted Types", async () => {
    const page = await open();
    try {
      const frame = page.frames().find((candidate) => candidate.url().startsWith(childOrigin))!;
      await expect(frame.addScriptTag({ content: "window.injectionTest=true" })).rejects.toThrow();
      const result = await scanEmbeddedFrames(page, bundle, { emitManualOnlyRules: false, rules: ["ACT-R18"] });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        ruleId: "ACT-R18", type: "Issue",
        selector: "iframe#external >>> div#movie_player",
      });
      expect(result.issues[0].description).toContain('role "generic"');
      expect(result.issues[0].elementContext).toContain("Embedded document:");
      expect(result.issues[0].elementContext).not.toContain("fixture-token");
      expect(result.ruleStatuses?.find((status) => status.ruleId === "ACT-R110")?.status).toBe("not-selected");
    } finally { await page.close(); }
  });
  it("keeps identical selectors in separate frames as separate occurrences", async () => {
    const page = await open("/two");
    try {
      const result = await scanEmbeddedFrames(page, bundle, { emitManualOnlyRules: false, rules: ["ACT-R18"] });
      expect(result.issues.map((issue) => issue.selector)).toEqual([
        "iframe#external >>> div#movie_player", "iframe#second >>> div#movie_player",
      ]);
    } finally { await page.close(); }
  });
  it("uses page-relative frame highlights instead of a same-named root element", async () => {
    const page = await open();
    try {
      await page.evaluate(() => window.scrollTo(0, 100));
      const boxes = await getEmbeddedFrameBoxes(page, [
        "iframe#external >>> div#movie_player",
        "iframe#external >>> div#missing",
      ]);
      expect(boxes.get(0)).toEqual({ x: 112, y: 180, width: 160, height: 40 });
      expect(boxes.has(1)).toBe(false);
    } finally { await page.close(); }
  });
  it("scans and locates nested frames, respecting the depth bound", async () => {
    const page = await open("/nested");
    try {
      const result = await scanEmbeddedFrames(page, bundle, { emitManualOnlyRules: false, rules: ["ACT-R18"] });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].selector).toBe("iframe#external >>> iframe#inner >>> div#movie_player");
      const boxes = await getEmbeddedFrameBoxes(page, result.issues.map((issue) => issue.selector));
      expect(boxes.get(0)).toEqual({ x: 137, y: 210, width: 160, height: 40 });
      const limited = await scanEmbeddedFrames(page, bundle, { emitManualOnlyRules: false, rules: ["ACT-R18"] }, { maxDepth: 1 });
      expect(limited.issues).toEqual([]);
    } finally { await page.close(); }
  });
  it("bounds work and preserves results when another frame detaches or fails", async () => {
    const page = await open("/two");
    try {
      const limited = await scanEmbeddedFrames(page, bundle, { emitManualOnlyRules: false, rules: ["ACT-R18"] }, { maxFrames: 1 });
      expect(limited.issues).toHaveLength(1);
      const failing = page.frames().find((candidate) => candidate.url().startsWith(childOrigin))!;
      const spy = vi.spyOn(failing, "evaluate").mockRejectedValueOnce(new Error("Frame detached during evaluation"));
      const skipped = vi.fn();
      const result = await scanEmbeddedFrames(page, bundle, { emitManualOnlyRules: false, rules: ["ACT-R18"] }, { onSkipped: skipped });
      spy.mockRestore();
      expect(skipped).toHaveBeenCalled();
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].selector).toBe("iframe#second >>> div#movie_player");
    } finally { await page.close(); }
  });
});
