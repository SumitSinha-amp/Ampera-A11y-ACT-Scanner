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
  <div class="overlay-mask" style="display:none">
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

  it("keeps Journey Type excluded and reports the dormant Railcard group as potential", async () => {
    const result = await scan(dreamGroups);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].selector).toContain("#railcard");
    expect(result.issues[0].type).toBe("Potential Issue");
    expect(result.checked).toBe(1);
  });
  it("preserves exposed/potential classification with R60-only selection and all rules", async () => {
    for (const onlyR60 of [true, false]) {
      const hidden = await scan(dreamGroups, true, onlyR60);
      expect(hidden.issues).toHaveLength(1);
      expect(hidden.issues[0].type).toBe("Potential Issue");
    }
    const visible = dreamGroups.replace('class="overlay-mask" style="display:none"', 'class="overlay-mask"');
    for (const onlyR60 of [true, false]) {
      const result = await scan(visible, true, onlyR60);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].selector).toContain("#railcard");
      expect(result.issues[0].type).toBe("Best Practice");
    }
  });
  it.each([
    '<div role="dialog" style="display:none">',
    '<div role="dialog" aria-hidden="true">',
    '<div class="popup" hidden>',
    '<div class="modal" inert>',
    '<div class="overlay-mask" style="visibility:hidden">',
    '<div popover>',
    '<dialog>',
  ])("reports hidden semantic groups as potential in popup content: %s", async (start) => {
    const end = start.startsWith("<dialog") ? "</dialog>" : "</div>";
    const result = await scan(`${start}<fieldset id="target"><input><input></fieldset>${end}`);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].selector).toContain("#target");
    expect(result.issues[0].type).toBe("Potential Issue");
  });
  it("recognizes popup panels associated with disclosure triggers", async () => {
    const result = await scan('<button aria-haspopup="dialog" aria-controls="panel">Open</button><div id="panel" hidden><fieldset><input><input></fieldset></div>');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Potential Issue");
  });
  it.each([
    '<fieldset><legend>Railcard selection</legend><select></select><select></select></fieldset>',
    '<div role="group" aria-label="Journey"><input><input></div>',
    '<div role="group" aria-labelledby="name"><input><input></div><span id="name">Journey</span>',
    '<fieldset><legend><span hidden>Not a label</span></legend><input><input style="display:none"></fieldset>',
    '<fieldset><input><input hidden></fieldset>',
    '<fieldset><input><input aria-hidden="true"></fieldset>',
    '<fieldset><input type="hidden"><input></fieldset>',
    '<div><input name="journey" type="radio"><input name="journey" type="radio"></div>',
    '<template><fieldset><input><input></fieldset></template>',
    '<fieldset><fieldset aria-label="Inner"><input><input></fieldset></fieldset>',
  ])("does not invent hidden-popup failures for named, inactive, or non-group content: %s", async (content) => {
    expect((await scan(`<div class="overlay" style="display:none">${content}</div>`)).issues).toEqual([]);
  });
  it("does not use independently hidden legend text as a group name", async () => {
    const result = await scan('<div class="popup" hidden><fieldset><legend hidden>Railcard</legend><input><input></fieldset></div>');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("Potential Issue");
  });
  it.each([
    '<fieldset><legend>Railcard selection</legend><select><option>1</option></select><select><option>Senior</option></select></fieldset>',
    '<fieldset style="display:none"><legend>Railcard selection</legend><select></select><select></select></fieldset>',
    '<div role="group" aria-label="Social Security Number"><input><input><input></div>',
    '<div role="radiogroup" aria-labelledby="question"><p id="question">Journey type</p><input type="radio"><input type="radio"></div>',
    '<div role="group" aria-labelledby="hidden-title"><input><input></div><span id="hidden-title" hidden>Passenger</span>',
    '<fieldset title="Passenger"><input><input></fieldset>',
    '<details open><summary>Passenger information</summary><input><input></details>',
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
    '<fieldset style="display:none"><input><input></fieldset>',
    '<fieldset style="visibility:hidden"><input><input></fieldset>',
    '<fieldset><input><input style="display:none"></fieldset>',
    '<fieldset><input><input style="visibility:hidden"></fieldset>',
    '<fieldset><input><input style="content-visibility:hidden"></fieldset>',
    '<details><summary>Passenger</summary><fieldset><input><input></fieldset></details>',
    '<fieldset><input type="hidden"><input></fieldset>',
    '<template><fieldset><input><input></fieldset></template>',
    '<form><input name="same" type="radio"></form><form><input name="same" type="radio"></form>',
    '<form id="a"></form><form id="b"></form><input name="same" type="radio" form="a"><input name="same" type="radio" form="b">',
    '<input type="radio"><input type="radio">',
    '<form><input name="first"><input name="second"></form>',
    '<div><h2>Currency</h2><label><input name="currency" type="radio">GBP</label><label><input name="currency" type="radio">USD</label></div>',
    '<div aria-label="Journey"><input name="same" type="radio"><input name="same" type="radio"></div>',
    '<svg><g role="group"><foreignObject><input xmlns="http://www.w3.org/1999/xhtml"><input xmlns="http://www.w3.org/1999/xhtml"></foreignObject></g></svg>',
  ])("avoids inactive, single-control, unrelated-field and cross-form false positives: %s", async (html) => {
    expect((await scan(html)).issues).toEqual([]);
  });
  it("recognizes custom input roles and does not confuse action buttons with form inputs", async () => {
    expect((await scan('<div role="radiogroup"><div role="radio"></div><div role="radio"></div></div>')).issues).toHaveLength(1);
    expect((await scan('<div role="group"><button>First</button><button>Second</button></div>')).issues).toEqual([]);
  });
  it("never infers groups from same-name radios in plain wrappers", async () => {
    expect((await scan('<div><input name="a" type="radio"><input name="a" type="radio"><input name="b" type="radio"><input name="b" type="radio"></div>')).issues).toEqual([]);
  });
  it("does not exclude off-screen or transparent controls that remain in the accessibility tree", async () => {
    for (const style of ["opacity:0", "position:absolute;left:-10000px", "width:0;height:0"]) {
      const result = await scan(`<fieldset style="${style}"><input><input></fieldset>`);
      expect(result.issues).toHaveLength(1);
      expect(result.checked).toBe(1);
    }
  });
});
