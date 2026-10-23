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

describe.skipIf(!existsSync(chromium))("ACT-R107 custom keyboard controls", () => {
  let browser: Browser;
  let engine: string;
  beforeAll(async () => {
    engine = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  const popup = '<div id="choices" class="dropdown-menu"><label><input type="radio" name="language" checked>English</label><label><input type="radio" name="language">Deutsch</label></div>';
  const dropdown = (attributes = "", content = "English") =>
    `<div class="dropdown-button"><div id="language" class="dropdown-toggle" ${attributes}>${content}</div>${popup}</div>`;
  async function scan(html: string, rules: string[] | null = ["ACT-R107"]) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html lang="en"><head><title>Keyboard test</title><style>
        .dropdown-menu{visibility:hidden;opacity:0}
        .dropdown-button:hover>.dropdown-menu{visibility:visible;opacity:1}
        </style></head><body>${html}</body></html>`);
      await page.evaluate(engine);
      return await page.evaluate((rules) => {
        const w = window as unknown as {
          __ampera: { runAllRules: (options: { rules?: string[] }) => {
            issues: { ruleId: string; type: string; selector: string; elementContext: string }[];
            stats: { ruleId: string; totalChecked: number }[];
            ruleStatuses: { ruleId: string; status: string }[];
          } };
        };
        const before = document.body.innerHTML;
        const result = w.__ampera.runAllRules({ rules: rules ?? undefined });
        return {
          issues: result.issues.filter((issue) => issue.ruleId === "ACT-R107"),
          stats: result.stats.filter((stat) => stat.ruleId === "ACT-R107"),
          status: result.ruleStatuses.find((status) => status.ruleId === "ACT-R107"),
          unchanged: before === document.body.innerHTML,
        };
      }, rules);
    } finally { await page.close(); }
  }

  it.each(["", 'tabindex="-1"', 'tabindex="-2"'])("finds a hover dropdown without a keyboard entry: %s", async (attributes) => {
    const result = await scan(dropdown(attributes));
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ type: "Potential Issue", selector: "div#language" });
    expect(result.issues[0].elementContext).toContain("Associated dropdown: div#choices");
    expect(result.stats).toEqual([{ ruleId: "ACT-R107", totalChecked: 1, scope: "element" }]);
    expect(result.status?.status).toBe("executed");
    expect(result.unchanged).toBe(true);
  });
  it("covers linked popups outside the immediate wrapper", async () => {
    const result = await scan(`<div id="language" aria-haspopup="dialog" aria-controls="choices">English</div>${popup}`);
    expect(result.issues).toHaveLength(1);
  });
  it("does not require a dropdown CSS class for declared data targets", async () => {
    expect((await scan(`<div data-bs-toggle="dropdown" data-bs-target="#choices">English</div>${popup}`)).issues).toHaveLength(1);
  });
  it.each([
    `<button class="dropdown-toggle">English</button>${popup}`,
    `<a href="#choices" class="dropdown-toggle">English</a>${popup}`,
    dropdown('tabindex="0" role="button" onkeydown="void 0"'),
    dropdown('tabindex="0" role="button"'),
    dropdown("", '<button aria-controls="choices">English</button>'),
    `<div class="dropdown-button"><div class="dropdown-toggle" tabindex="-1">English</div>${popup}<button aria-controls="choices">Choose language</button></div>`,
    `<div class="dropdown-button"><div class="dropdown-toggle" tabindex="-1">English</div>${popup}<button data-bs-target="#choices">Choose language</button></div>`,
    `<div role="menubar"><div role="menuitem" tabindex="0">First</div>${dropdown('role="menuitem" tabindex="-1"')}</div>`,
    `<button>${dropdown()}</button>`,
  ])("does not flag an existing keyboard entry (%#)", async (html) => {
    expect((await scan(html)).issues).toEqual([]);
  });
  it.each([
    '<div class="dropdown-toggle">Decoration only</div>',
    '<div class="dropdown-toggle">English</div><div class="dropdown-menu">Informational text</div>',
    `<div hidden>${dropdown()}</div>`,
    `<div inert>${dropdown()}</div>`,
    `<div aria-hidden="true">${dropdown()}</div>`,
    dropdown('aria-disabled="true"'),
    `<div class="dropdown-toggle">Unrelated</div><section>${popup}</section>`,
    '<div aria-haspopup="true" data-bs-target="#[invalid">Invalid reference</div>',
  ])("ignores inactive or unproven interaction candidates (%#)", async (html) => {
    expect((await scan(html)).issues).toEqual([]);
  });
  it("preserves the inline-handler detector and deduplicates overlapping dropdown evidence", async () => {
    const result = await scan(dropdown('onclick="void 0"'));
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Issue");
    expect((await scan('<div onclick="void 0" tabindex="0" onkeydown="void 0">Custom action</div>')).issues).toEqual([]);
    expect((await scan('<div ondblclick="void 0">Custom action</div>')).issues).toHaveLength(1);
  });
  it("includes inferred findings in standard scans and respects explicit exclusions", async () => {
    expect((await scan(dropdown(), null)).issues).toHaveLength(1);
    const excluded = await scan(dropdown(), ["ACT-R90"]);
    expect(excluded.issues).toEqual([]);
    expect(excluded.status?.status).toBe("not-selected");
  });
});
