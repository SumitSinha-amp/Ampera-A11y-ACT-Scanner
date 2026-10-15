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

const dreamGroups = `
<form>
  <div id="language" style="visibility:hidden">
    <div class="title">Language</div>
    <label><input type="radio" name="locale" checked>English</label>
    <label><input type="radio" name="locale">Deutsch</label>
  </div>
  <div id="currency" style="display:none">
    <div class="title">Currency</div>
    <label><input type="radio" name="currency">GBP</label>
    <label><input type="radio" name="currency">USD</label>
  </div>
</form>
<form>
  <div id="journey">
    <input id="oneway" name="journey-type" type="radio" style="display:none">
    <label for="oneway" tabindex="0">One-way</label>
    <input id="return" name="journey-type" type="radio" style="display:none">
    <label for="return" tabindex="0">Return</label>
  </div>
  <div style="display:none">
    <h1>Add a railcard</h1>
    <fieldset id="railcard">
      <ol><li>
        <select><option>1</option><option>2</option></select>
        <select><option>Select a railcard</option><optgroup label="UK"><option>Senior Railcard</option></optgroup></select>
      </li></ol>
    </fieldset>
  </div>
</form>`;

describe.skipIf(!existsSync(chromium))("ACT-R60 group-name regressions", () => {
  let browser: Browser;
  let bundle: string;
  let fullBundle: string;
  beforeAll(async () => {
    const compile = (path: string, globalName: string) => buildSync({
      entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife", globalName,
    }).outputFiles[0].text;
    bundle = compile("./control-group-names.ts", "R60");
    fullBundle = compile("../index.ts", "Scanner");
    browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, full = false, onlyR60 = true) {
    const page = await browser.newPage();
    try {
      await page.setContent(html);
      await page.addScriptTag({ content: full ? fullBundle : bundle });
      return await page.evaluate(({ full, onlyR60 }) => {
        const globals = window as unknown as {
          R60: { runControlGroupNameRule: (rows: unknown[], stat: (...args: unknown[]) => void) => void };
          __ampera: { runAllRules: (options: { rules?: string[] }) => {
            issues: { ruleId: string; selector: string; type: string }[];
            stats: { ruleId: string; totalChecked: number }[];
          } };
        };
        if (full) {
          const report = globals.__ampera.runAllRules(onlyR60 ? { rules: ["ACT-R60"] } : {});
          return { issues: report.issues.filter((row) => row.ruleId === "ACT-R60"),
            checked: report.stats.find((row) => row.ruleId === "ACT-R60")?.totalChecked };
        }
        const issues: { ruleId: string; selector: string; type: string }[] = [];
        let checked = 0;
        globals.R60.runControlGroupNameRule(issues, (_, total) => { checked = total as number; });
        return { issues, checked };
      }, { full, onlyR60 });
    } finally { await page.close(); }
  }

  it("detects the four Dream Destination-shaped unnamed groups, including dormant UI", async () => {
    const result = await scan(dreamGroups);
    expect(result.issues).toHaveLength(4);
    expect(result.checked).toBe(4);
    for (const id of ["language", "currency", "journey", "railcard"]) {
      expect(result.issues.some((row) => row.selector.includes(`#${id}`))).toBe(true);
    }
    expect(result.issues.every((row) => row.type === "Issue")).toBe(true);
  });
  it("detects the same four with R60-only selection and without duplicate all-rule findings", async () => {
    expect((await scan(dreamGroups, true)).issues).toHaveLength(4);
    expect((await scan(dreamGroups, true, false)).issues).toHaveLength(4);
  });
  it.each([
    '<fieldset><legend>Railcard selection</legend><select><option>1</option></select><select><option>Senior</option></select></fieldset>',
    '<fieldset style="display:none"><legend>Railcard selection</legend><select></select><select></select></fieldset>',
    '<div role="group" aria-label="Social Security Number"><input><input><input></div>',
    '<div role="radiogroup" aria-labelledby="question"><p id="question">Journey type</p><input type="radio"><input type="radio"></div>',
    '<div role="group" aria-labelledby="hidden-title"><input><input></div><span id="hidden-title" hidden>Passenger</span>',
    '<fieldset title="Passenger"><input><input></fieldset>',
    '<table><tr aria-labelledby="ssn"><th id="ssn">Social Security Number</th><td><input></td><td><input></td><td><input></td></tr></table>',
  ])("accepts legitimate programmatic group names: %s", async (html) => {
    expect((await scan(html)).issues).toEqual([]);
  });
  it.each([
    '<fieldset><input aria-label="First"><input aria-label="Second"></fieldset>',
    '<fieldset><select><option>Count</option></select><select><option>Railcard</option></select></fieldset>',
    '<div role="group"><span>Social Security Number</span><input title="First"><input title="Second"></div>',
    '<div role="radiogroup"><label><input type="radio">One-way</label><label><input type="radio">Return</label></div>',
    '<fieldset><legend> </legend><input><input></fieldset>',
    '<div role="group" aria-labelledby="missing" aria-label=" "><input><input></div>',
    '<div><h2>Currency</h2><label><input name="currency" type="radio">GBP</label><label><input name="currency" type="radio">USD</label></div>',
  ])("does not mistake child labels, text, options or broken references for a group name: %s", async (html) => {
    expect((await scan(html)).issues).toHaveLength(1);
  });
  it("counts nearest groups without counting their controls again in ancestors", async () => {
    expect((await scan('<fieldset><div role="radiogroup" aria-label="Journey"><input type="radio"><input type="radio"></div><div role="group" aria-label="Passenger"><input><input></div></fieldset>')).issues).toEqual([]);
    expect((await scan('<fieldset><fieldset><input><input></fieldset></fieldset>')).issues).toHaveLength(1);
  });
  it.each([
    '<div role="group"></div>',
    '<div role="group"><input><input aria-hidden="true"><input aria-hidden="true"></div>',
    '<fieldset hidden><input><input></fieldset>',
    '<fieldset aria-hidden="true"><input><input></fieldset>',
    '<fieldset inert><input><input></fieldset>',
    '<fieldset><input type="hidden"><input></fieldset>',
    '<template><fieldset><input><input></fieldset></template>',
    '<form><input name="same" type="radio"></form><form><input name="same" type="radio"></form>',
    '<form id="a"></form><form id="b"></form><input name="same" type="radio" form="a"><input name="same" type="radio" form="b">',
    '<input type="radio"><input type="radio">',
    '<form><input name="first"><input name="second"></form>',
  ])("avoids inactive, single-control, unrelated-field and cross-form false positives: %s", async (html) => {
    expect((await scan(html)).issues).toEqual([]);
  });
  it("recognizes custom input roles and does not confuse action buttons with form inputs", async () => {
    expect((await scan('<div role="radiogroup"><div role="radio"></div><div role="radio"></div></div>')).issues).toHaveLength(1);
    expect((await scan('<div role="group"><button>First</button><button>Second</button></div>')).issues).toEqual([]);
  });
  it("keeps independently named radio sets even when they share a wrapper", async () => {
    expect((await scan('<div><input name="a" type="radio"><input name="a" type="radio"><input name="b" type="radio"><input name="b" type="radio"></div>')).issues).toHaveLength(2);
  });
});
