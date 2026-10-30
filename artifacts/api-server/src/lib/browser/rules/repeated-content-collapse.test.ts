import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}

describe.skipIf(!existsSync(chromium))("ACT-R97 repeated-content collapsibility", () => {
  let browser: Browser;
  let bundle: string;
  const main = '<main><p>Main content</p></main>';
  const nav = '<nav id="toc"><a href="#chapter">Chapter</a></nav>';
  const script = `<script>function toggleHidden(id) {
    const element = document.getElementById(id);
    element.style.display = element.style.display === "none" ? "" : "none";
  }</script>`;
  const control = '<button onclick="toggleHidden(\'toc\')">Toggle table of contents</button>';

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

  async function scan(
    html: string,
    options: { rules?: string[]; emitManualOnlyRules?: boolean } = { rules: ["ACT-R97"] },
  ) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>R97 fixture</title></head><body>${html}</body></html>`);
      await page.evaluate(bundle);
      return await page.evaluate(options => {
        const before = document.documentElement.outerHTML;
        const result = (window as any).__ampera.runAllRules(options);
        return {
          issues: result.issues.filter((issue: any) => issue.ruleId === "ACT-R97"),
          stats: result.stats.filter((stat: any) => stat.ruleId === "ACT-R97"),
          status: result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R97"),
          unchanged: before === document.documentElement.outerHTML,
          sideEffects: document.body.getAttribute("data-executed"),
        };
      }, options);
    } finally { await page.close(); }
  }

  it("accepts the published display:none toggle example without aria-expanded", async () => {
    const result = await scan(script + control + nav + main);
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([{ ruleId: "ACT-R97", totalChecked: 1, scope: "page" }]);
    expect(result.unchanged).toBe(true);
  });

  it("asks one correct page-level review question for the published no-instrument example", async () => {
    const result = await scan(nav + main);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      type: "Potential Issue", selector: "html",
      displayTitle: "Can repeated content before main content be collapsed?",
    });
    expect(result.issues[0].description).toContain("every node both not visible and excluded");
    expect(result.issues[0].elementContext).toContain("Confirm which blocks repeat");
    expect(result.stats).toEqual([{ ruleId: "ACT-R97", totalChecked: 1, scope: "page" }]);
    expect(result.unchanged).toBe(true);
  });

  it("does not accept the published offscreen-only toggle as a complete mechanism", async () => {
    const html = `<script>function toggleVisibility(id) {
      const element = document.getElementById(id);
      element.className = element.className === "off-screen" ? "" : "off-screen";
    }</script><style>.off-screen {position:absolute;left:-9999px}</style>
    <a href="#" onclick="toggleVisibility('toc')">Toggle navigation</a>${nav}${main}`;
    const result = await scan(html);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Potential Issue");
    expect(result.unchanged).toBe(true);
  });

  it.each([
    '<main><h1>Main content</h1><nav>Only navigation after main starts</nav></main>',
    '<main><p>Main</p></main><nav>Footer navigation</nav>',
    '<main><button aria-expanded="true" aria-controls="missing">Disclosure</button></main>',
    '<main><div aria-expanded="true" tabindex="-1">Custom control</div></main>',
  ])("does not report unrelated disclosures or content after main: %s", async html => {
    const result = await scan(html);
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual([{ ruleId: "ACT-R97", totalChecked: 1, scope: "page" }]);
  });

  it("accepts one instrument covering several blocks and instruments after main", async () => {
    const wrapper = '<div id="toc"><nav>Navigation</nav><aside>Related links</aside></div>';
    expect((await scan(script + control + wrapper + main)).issues).toEqual([]);
    expect((await scan(script + wrapper + main + control)).issues).toEqual([]);
  });

  it("does not accept a mechanism covering only one of several preceding blocks", async () => {
    const result = await scan(script + control + nav + '<aside>Uncovered repeated content</aside>' + main);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].elementContext).toContain("aside");
  });

  it.each(["", "open"])("recognizes native details/summary with no ARIA duplication: %s", async open => {
    const html = `<details ${open}><summary>Toggle navigation</summary>${nav}</details>${main}`;
    const result = await scan(html);
    expect(result.issues).toEqual([]);
    expect(result.unchanged).toBe(true);
  });

  it("does not accept a summary inside the block as hiding the complete block", async () => {
    const result = await scan(`<nav><details open><summary>Toggle</summary><p>Links</p></details></nav>${main}`);
    expect(result.issues).toHaveLength(1);
  });

  it("verifies actual CSS and does not accept display overrides", async () => {
    const result = await scan(`<style>#toc {display:block!important}</style>${script}${control}${nav}${main}`);
    expect(result.issues).toHaveLength(1);
    expect(result.unchanged).toBe(true);
  });

  it.each(["", 'style=""', 'style="color: red; display: block !important;"'])("restores authored styles exactly: %s", async attributes => {
    const result = await scan(script + control + `<nav id="toc" ${attributes}>Links</nav>` + main);
    expect(result.issues).toEqual([]);
    expect(result.unchanged).toBe(true);
  });

  it("does not execute arbitrary functions or activate controls", async () => {
    const html = `<script>function toggleHidden(id) {
      document.body.setAttribute("data-executed", "yes");
      document.getElementById(id).style.display = "none";
    }</script>${control}${nav}${main}`;
    const result = await scan(html);
    expect(result.issues).toHaveLength(1);
    expect(result.sideEffects).toBeNull();
    expect(result.unchanged).toBe(true);
  });

  it("does not confuse aria-controls or aria-hidden alone with full collapse", async () => {
    const result = await scan(`<button aria-expanded="false" aria-controls="toc">Toggle</button>
      <nav id="toc" aria-hidden="true">Still visually present</nav>${main}`);
    expect(result.issues).toHaveLength(1);
  });

  it("supports role=main and flat-tree native collapse in shadow roots", async () => {
    expect((await scan(script + control + nav + '<div role="main">Main</div>')).issues).toEqual([]);
    const html = `<div id="host"></div><script>
      document.getElementById("host").attachShadow({mode:"open"}).innerHTML =
      '<details open><summary>Toggle</summary><nav>Links</nav></details><main>Main</main>';
    </script>`;
    expect((await scan(html)).issues).toEqual([]);
  });

  it("keeps missing main identification undetermined in all scan modes", async () => {
    for (const options of [{}, { rules: ["ACT-R97"] }, { rules: ["ACT-R97"], emitManualOnlyRules: true }]) {
      expect((await scan('<nav>Links</nav><div id="main">Content</div>', options)).issues).toEqual([]);
    }
  });

  it("uses the same detection in standard, explicit, and manual-enabled scans", async () => {
    for (const html of [nav + main, script + control + nav + main]) {
      const normal = await scan(html, {});
      const expected = { issues: normal.issues, stats: normal.stats, status: normal.status };
      expect(await scan(html)).toMatchObject(expected);
      expect(await scan(html, { rules: ["ACT-R97"], emitManualOnlyRules: true })).toMatchObject(expected);
    }
    const excluded = await scan(nav + main, { rules: ["ACT-R98"], emitManualOnlyRules: true });
    expect(excluded.issues).toEqual([]);
    expect(excluded.stats).toEqual([]);
    expect(excluded.status.status).toBe("not-selected");
  });

  it("is inapplicable to standalone SVG documents", async () => {
    const page = await browser.newPage();
    try {
      await page.goto("data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><title>SVG</title></svg>'));
      await page.evaluate(bundle);
      const result = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R97"] }));
      expect(result.issues).toEqual([]);
      expect(result.stats).toEqual([]);
      expect(result.ruleStatuses.find((status: any) => status.ruleId === "ACT-R97").status).toBe("not-applicable");
    } finally { await page.close(); }
  });

  it("keeps client guidance aligned with the actual rule", () => {
    const client = readFileSync(fileURLToPath(new URL("../../../../../accessibility-scanner/src/lib/actRules.ts", import.meta.url)), "utf8");
    const entry = client.slice(client.indexOf('  "ACT-R97": {'), client.indexOf('  "ACT-R98": {'));
    expect(entry).toContain("Every repeated-content block before main content");
    expect(entry).not.toContain("must use aria-expanded");
  });
});
