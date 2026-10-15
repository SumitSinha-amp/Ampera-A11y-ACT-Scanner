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

describe.skipIf(!existsSync(chromium))("ACT-R55 landmark group review", () => {
  let browser: Browser;
  let bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, rules = ["ACT-R55", "ACT-R56"]) {
    const page = await browser.newPage();
    try {
      await page.setContent(html);
      await page.addScriptTag({ content: bundle });
      return await page.evaluate((rules) => (window as unknown as {
        __ampera: { runAllRules: (options: { rules: string[] }) => { issues: {
          ruleId: string; type: string; description: string; elementContext: string; selector: string;
        }[] } };
      }).__ampera.runAllRules({ rules }).issues, rules);
    } finally { await page.close(); }
  }

  it("reports one Mars-shaped unnamed navigation group while preserving R56 findings", async () => {
    const html = '<nav id="trips"><a href="/trips">Add a trip</a></nav><nav id="account"><a href="/account">My account</a></nav><nav id="main"><a href="/destinations">Destinations</a></nav>';
    const issues = await scan(html);
    const review = issues.filter((row) => row.ruleId === "ACT-R55");
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({ type: "Potential Issue", selector: "nav#trips" });
    expect(review[0].description).toContain('3 "navigation" landmarks with no accessible name');
    expect(review[0].elementContext).toContain("nav#trips");
    expect(review[0].elementContext).toContain("nav#account");
    expect(review[0].elementContext).toContain("nav#main");
    expect(issues.filter((row) => row.ruleId === "ACT-R56")).toHaveLength(3);
    expect(await scan(html, ["ACT-R55"])).toHaveLength(1);
  });
  it("does not claim differing content when identical markup still needs equivalent-purpose review", async () => {
    const issues = await scan('<nav aria-label="Primary"><a href="/">Home</a></nav><nav aria-label="Primary"><a href="/">Home</a></nav>', ["ACT-R55"]);
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain("have the same or equivalent content?");
    expect(issues[0].description).not.toContain("but contain different content");
  });
  it("keeps empty landmarks eligible, just as upstream's unanswered manual question does", async () => {
    expect(await scan('<aside aria-label="More information"></aside><aside aria-label="More information"></aside>', ["ACT-R55"])).toHaveLength(1);
  });
  it("does not suppress groups because of carousel names/classes or nearby widgets", async () => {
    expect(await scan('<div class="carousel"><section aria-label="Slide"><p>One</p></section><section aria-label="Slide"><p>Two</p></section></div>', ["ACT-R55"])).toHaveLength(1);
    expect(await scan('<div><div role="tablist"></div><nav>First</nav><nav>Second</nav></div>', ["ACT-R55"])).toHaveLength(1);
  });
  it("keeps same-role/name groups separate and normalizes whitespace", async () => {
    const issues = await scan('<nav aria-label=" Main Menu ">One</nav><nav aria-label="main   menu">Two</nav><nav aria-label="Footer">Three</nav><nav aria-label="Footer">Four</nav><aside aria-label="Footer">Aside</aside>', ["ACT-R55"]);
    expect(issues).toHaveLength(2);
  });
  it("treats missing and whitespace-only names as the same unnamed group", async () => {
    expect(await scan('<nav>One</nav><div role="navigation" aria-label=" ">Two</div>', ["ACT-R55"])).toHaveLength(1);
  });
  it.each([
    '<nav>One navigation</nav>',
    '<nav>Navigation</nav><aside>Aside</aside>',
    '<nav aria-label="Primary">One</nav><nav aria-label="Account">Two</nav>',
    '<nav>One</nav><nav hidden>Hidden</nav>',
    '<nav>One</nav><nav aria-hidden="true">Hidden</nav>',
    '<nav>One</nav><div inert><nav>Inactive</nav></div>',
    '<nav>One</nav><nav style="display:none">Closed</nav>',
    '<nav>One</nav><nav style="visibility:hidden">Hidden</nav>',
    '<form aria-label=""><input></form><form aria-label=""><input></form>',
    '<section aria-label="">First</section><section aria-label="">Second</section>',
  ])("avoids single, distinct, hidden and non-landmark false positives: %s", async (html) => {
    expect(await scan(html, ["ACT-R55"])).toEqual([]);
  });
  it("preserves the two unnamed-region R56 findings alongside a single R55 review", async () => {
    const issues = await scan('<div role="region">First</div><div role="region">Second</div>');
    expect(issues.filter((row) => row.ruleId === "ACT-R55")).toHaveLength(1);
    expect(issues.filter((row) => row.ruleId === "ACT-R56")).toHaveLength(2);
  });
});
