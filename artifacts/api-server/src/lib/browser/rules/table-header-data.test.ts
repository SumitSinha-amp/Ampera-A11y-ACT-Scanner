import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R46 Siteimprove header-to-data assignment", () => {
  let browser: Browser, page: Page, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    page = await browser.newPage();
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, rules: string[] = ["ACT-R46"]) {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Header assignments</title></head><body>${html}</body></html>`);
    await page.evaluate(bundle);
    return page.evaluate(rules => {
      const before = document.documentElement.outerHTML;
      const r = (window as any).__ampera.runAllRules({ rules });
      return {
        issues: r.issues.filter((i: any) => i.ruleId === "ACT-R46"),
        checked: r.stats.find((s: any) => s.ruleId === "ACT-R46")?.totalChecked,
        status: r.ruleStatuses.find((s: any) => s.ruleId === "ACT-R46")?.status,
        tableIssues: r.issues.filter((i: any) => ["ACT-R46", "ACT-R76", "ACT-R77"].includes(i.ruleId)),
        unchanged: before === document.documentElement.outerHTML,
      };
    }, rules);
  }
  const table = (rows: string) => `<table>${rows}</table>`;
  const orphan = table('<tr><th>A</th><th id="orphan">B</th></tr><tr><td>Assigned</td></tr>');
  // Table markup from https://www.washington.edu/accesscomputing/AU/before.html.
  // Preserve the empty corner, spans, bold "headers", and all data rows.
  const enrollment = `<table id="enrollment">
    <tr><td class="corner" rowspan="2" style="width:6em"></td>
      <td colspan="5" style="text-align:center"><b>Last Year</b></td>
      <td colspan="5" style="text-align:center"><b>This Year</b></td></tr>
    <tr>${["CS", "Eng", "Eco", "Phy", "Psy", "CS", "Eng", "Eco", "Phy", "Psy"].map(s => `<td><b>${s}</b></td>`).join("")}</tr>
    <tr><td><b>Undergraduate</b></td>${[1481, 400, 727, 747, 1006, 1500, 340, 777, 787, 1112].map(n => `<td>${n}</td>`).join("")}</tr>
    <tr><td><b>Graduate</b></td>${[310, 84, 273, 69, 312, 350, 64, 341, 72, 325].map(n => `<td>${n}</td>`).join("")}</tr>
  </table>`;

  it.each([
    ["implicit row", '<tr><th>Mon-Fri</th><td>8-17</td></tr><tr><th>Sat-Sun</th><td>10-14</td></tr>'],
    ["implicit column", '<tr><th>Mon-Fri</th><th>Sat-Sun</th></tr><tr><td>8-17</td><td>10-14</td></tr>'],
    ["explicit column scope", '<tr><th scope="col">A</th></tr><tr><td>B</td></tr>'],
    ["explicit row scope", '<tr><th scope="row">A</th><td>B</td></tr>'],
    ["colspan", '<tr><th colspan="2" scope="col">A</th></tr><tr><td>B</td><td>C</td></tr>'],
    ["rowspan", '<tr><th rowspan="2" scope="row">A</th><td>B</td></tr><tr><td>C</td></tr>'],
    ["rowspan zero", '<tbody><tr><th rowspan="0" scope="row">A</th><td>B</td></tr><tr><td>C</td></tr></tbody>'],
    ["rowgroup", '<tbody><tr><th scope="rowgroup">A</th><td>B</td></tr><tr><td>C</td></tr></tbody>'],
    ["colgroup", '<colgroup span="2"></colgroup><tr><th colspan="2" scope="colgroup">A</th></tr><tr><td>B</td><td>C</td></tr>'],
    ["empty top-left data cell", '<tr><td></td><th>A</th></tr><tr><th>B</th><td>C</td></tr>'],
    ["non-positional explicit reference", '<tr><td>X</td><th id="h">A</th></tr><tr><td headers="h">B</td></tr>'],
    ["mixed valid/invalid references", '<tr><th id="h">A</th></tr><tr><td headers="missing h">B</td></tr>'],
    ["header assigned to another header (cell subclass)", '<tr><th id="h" scope="col">A</th></tr><tr><th headers="h" scope="row">B</th><td>C</td></tr>'],
    ["gridcell data", '<tr><th>A</th></tr><tr><td role="gridcell">B</td></tr>'],
  ])("accepts %s assignments", async (_, rows) => {
    const r = await scan(table(rows));
    expect(r.issues).toEqual([]);
    expect(r.checked).toBeGreaterThan(0);
    expect(r.unchanged).toBe(true);
  });
  it("reports an orphan header, not a data cell or the whole table", async () => {
    const r = await scan(orphan);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ selector: "th#orphan", type: "Issue", impact: "serious" });
    expect(r.checked).toBe(2);
    expect(r.status).toBe("executed");
    expect(r.unchanged).toBe(true);
  });
  it.each(["", "missing", "self"])("headers='%s' overrides implicit assignment", async headers => {
    const r = await scan(table(`<tr><th id="orphan">A</th></tr><tr><td id="self" headers="${headers}">B</td></tr>`));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].selector).toBe("th#orphan");
  });
  it("does not assign an empty header even through an explicit reference", async () => {
    const r = await scan(table('<tr><th id="orphan"></th></tr><tr><td headers="orphan">B</td></tr>'));
    expect(r.issues).toHaveLength(1);
  });
  it("does not confuse missing data-to-header assignments with orphan headers", async () => {
    const r = await scan(table('<tr><th>A</th></tr><tr><td>B</td><td id="missing">C</td></tr>'), []);
    expect(r.issues).toEqual([]);
    expect(r.tableIssues.filter((i: any) => i.ruleId === "ACT-R77")).toHaveLength(1);
  });
  it.each([
    ["hidden table", '<table hidden><tr><th>A</th></tr></table>'],
    ["aria-hidden table", '<table aria-hidden="true"><tr><th>A</th></tr></table>'],
    ["presentation table", '<table role="presentation"><tr><th>A</th></tr></table>'],
    ["none table", '<table role="none"><tr><th>A</th></tr></table>'],
    ["headerless table", enrollment],
    ["ARIA-only header", '<table><tr><td role="columnheader">A</td></tr></table>'],
    ["ARIA-only table", '<div role="table"><div role="row"><div role="columnheader">A</div></div></div>'],
  ])("is inapplicable to %s", async (_, html) => {
    const r = await scan(html);
    expect(r.issues).toEqual([]);
    expect(r.checked).toBe(0);
    expect(r.status).toBe("not-applicable");
  });
  it.each(["hidden", 'aria-hidden="true"', "inert", 'style="display:none"', 'style="opacity:0"',
    'role="presentation"', 'role="none"', 'role="cell"', 'role="button"'])(
    "excludes non-perceivable or non-header th targets: %s", async attribute => {
      const r = await scan(table(`<tr><th ${attribute}>A</th></tr>`));
      expect(r.issues).toEqual([]);
      expect(r.checked).toBe(0);
    });
  it.each(["rowheader", "columnheader"])("checks explicit %s roles on th", async role => {
    const r = await scan(table(`<tr><th role="${role}" id="orphan">A</th></tr>`));
    expect(r.issues).toHaveLength(1);
    expect(r.checked).toBe(1);
  });
  it.each(['role="none" tabindex="0"', 'role="presentation" aria-label="Header"'])(
    "preserves native semantics when presentation is ignored: %s", async attributes => {
      const r = await scan(table(`<tr><th ${attributes}>A</th></tr>`));
      expect(r.checked).toBe(1);
      expect(r.issues).toHaveLength(1);
    });
  it("does not add a visibility requirement to the assigned data cell", async () => {
    const r = await scan(table('<tr><th>A</th></tr><tr><td style="opacity:0">B</td></tr>'));
    expect(r.issues).toEqual([]);
  });
  it("does not count a reassigned non-cell role as an assignment", async () => {
    const r = await scan(table('<tr><th>A</th></tr><tr><td role="button">B</td></tr>'));
    expect(r.issues).toHaveLength(1);
  });
  it("respects row-group boundaries", async () => {
    const r = await scan(table('<tbody><tr><th scope="rowgroup" id="orphan">A</th></tr></tbody><tbody><tr><td>B</td></tr></tbody>'));
    expect(r.issues).toHaveLength(1);
  });
  it("does not resolve explicit references across tables or to non-cell elements", async () => {
    const r = await scan('<span id="outside">Outside</span>' +
      table('<tr><th id="orphan">A</th></tr>') +
      table('<tr><th id="other">B</th></tr><tr><td headers="orphan outside">C</td></tr>'));
    expect(r.issues.map((i: any) => i.selector).sort()).toEqual(["th#orphan", "th#other"]);
  });
  it("does not borrow nested data cells to satisfy an outer header", async () => {
    const r = await scan(table('<tr><th scope="col" id="orphan">A</th><td><table><tr><td headers="orphan">Inner</td></tr></table></td></tr>'));
    expect(r.issues.map((i: any) => i.selector)).toEqual(["th#orphan"]);
  });
  it("keeps nested headers isolated from the outer table's model", async () => {
    const r = await scan(table('<tr><th>A</th></tr><tr><td><table><tr><th id="orphan">Inner</th></tr></table></td></tr>'));
    expect(r.checked).toBe(2);
    expect(r.issues.map((i: any) => i.selector)).toEqual(["th#orphan"]);
  });
  it("does not cap orphan-header findings", async () => {
    const r = await scan(table('<tr>' + '<th scope="col">Orphan</th>'.repeat(205) + '</tr>'));
    expect(r.checked).toBe(205);
    expect(r.issues).toHaveLength(205);
  });
  it("has normal/explicit parity and honors R46-only and unrelated selections", async () => {
    const explicit = await scan(orphan);
    const normal = await scan(orphan, []);
    const outcomes = (r: typeof explicit) => r.issues.map(({ ruleId, selector, type, impact, description }: any) =>
      ({ ruleId, selector, type, impact, description }));
    expect(outcomes(normal)).toEqual(outcomes(explicit));
    expect(normal.checked).toBe(explicit.checked);
    expect(explicit.tableIssues.every((i: any) => i.ruleId === "ACT-R46")).toBe(true);
    const unrelated = await scan(orphan, ["ACT-R76"]);
    expect(unrelated.issues).toEqual([]);
    expect(unrelated.status).toBe("not-selected");
    expect((await scan(orphan, ["ACT-R77"])).issues).toEqual([]);
  });
  it.each([[], ["ACT-R76"], ["ACT-R46"], ["ACT-R77"]].map(rules => ({ rules })))(
    "retains Accessible University-style enrollment coverage only under selected R76: $rules", async ({ rules }) => {
      const r = await scan(enrollment, rules);
      expect(r.issues).toEqual([]);
      expect(r.tableIssues.map((i: any) => [i.ruleId, i.selector])).toEqual(
        rules.length === 0 || rules.includes("ACT-R76") ? [["ACT-R76", "table#enrollment"]] : [],
      );
    });
  it("retains headerless outer-table detection even when a nested table has headers", async () => {
    const r = await scan('<table id="outer"><tr><td>Outer</td></tr><tr><td>' +
      '<table><tr><th>A</th></tr><tr><td>B</td></tr></table></td></tr></table>', ["ACT-R76"]);
    expect(r.tableIssues.map((i: any) => i.selector)).toEqual(["table#outer"]);
  });
  it("refreshes assignments when table markup changes", async () => {
    await scan(orphan);
    const r = await page.evaluate(() => {
      document.querySelector("tr:last-child")!.insertAdjacentHTML("beforeend", "<td>Now assigned</td>");
      return (window as any).__ampera.runAllRules({ rules: ["ACT-R46"] }).issues;
    });
    expect(r).toEqual([]);
  });
});
