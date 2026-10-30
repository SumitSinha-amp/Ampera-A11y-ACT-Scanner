import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R77 Siteimprove data-cell header assignment", () => {
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

  async function scan(html: string, rules: string[] = ["ACT-R77"]) {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Table headers</title></head><body>${html}</body></html>`);
    await page.evaluate(bundle);
    return page.evaluate(rules => {
      const before = document.documentElement.outerHTML;
      const r = (window as any).__ampera.runAllRules({ rules });
      return {
        issues: r.issues.filter((i: any) => i.ruleId === "ACT-R77"),
        checked: r.stats.find((s: any) => s.ruleId === "ACT-R77")?.totalChecked,
        status: r.ruleStatuses.find((s: any) => s.ruleId === "ACT-R77")?.status,
        tableIssues: r.issues.filter((i: any) => ["ACT-R46", "ACT-R76"].includes(i.ruleId)),
        unchanged: before === document.documentElement.outerHTML,
      };
    }, rules);
  }
  const table = (rows: string) => `<table>${rows}</table>`;
  const partial = table('<tr><th>A</th></tr><tr><td>Assigned</td><td id="missing">Unassigned</td></tr>');

  it("passes the published implicit row-header example without requiring scope", async () => {
    const r = await scan(table('<caption>Opening hours</caption><tr><th>Mon-Fri</th><td>8-17</td></tr><tr><th>Sat-Sun</th><td>10-14</td></tr>'));
    expect(r.issues).toEqual([]);
    expect(r.checked).toBe(2);
  });
  it("passes the published implicit column-header example without requiring thead", async () => {
    const r = await scan(table('<tr><th>Mon-Fri</th><th>Sat-Sun</th></tr><tr><td>8-17</td><td>10-14</td></tr>'));
    expect(r.issues).toEqual([]);
    expect(r.checked).toBe(2);
  });
  it("detects the published missing-column-header failure", async () => {
    const r = await scan(partial);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ selector: "td#missing", type: "Issue" });
    expect(r.checked).toBe(2);
    expect(r.status).toBe("executed");
    expect(r.unchanged).toBe(true);
  });
  it.each([
    ["hidden table", '<table hidden><tr><th>A</th></tr><tr><td>B</td></tr></table>'],
    ["headerless table", table('<tr><td>8-12</td><td>13-17</td></tr>')],
    ["presentation table", '<table role="presentation"><tr><th>A</th></tr><tr><td>B</td></tr></table>'],
    ["aria-hidden table", '<table aria-hidden="true"><tr><th>A</th></tr><tr><td>B</td></tr></table>'],
    ["ARIA-only table", '<div role="table"><div role="row"><span role="columnheader">A</span></div><div role="row"><span role="cell">B</span></div></div>'],
    ["ARIA headers without native th", table('<tr><td role="columnheader">A</td></tr><tr><td>B</td></tr>')],
  ])("is inapplicable to %s", async (_, html) => {
    const r = await scan(html);
    expect(r.issues).toEqual([]);
    expect(r.checked).toBe(0);
    expect(r.status).toBe("not-applicable");
  });
  it.each(['hidden', 'aria-hidden="true"', 'style="opacity:0"', 'role="presentation"', 'role="button"', 'role="columnheader"'])(
    "excludes non-applicable data cells: %s", async attribute => {
      expect((await scan(table(`<tr><th>A</th></tr><tr><td ${attribute}>B</td></tr>`))).checked).toBe(0);
    });
  it("includes explicit gridcell roles on native td targets", async () => {
    const r = await scan(table('<tr><th>A</th></tr><tr><td>Assigned</td><td role="gridcell" id="missing">Unassigned</td></tr>'));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].selector).toBe("td#missing");
  });
  it.each(["", "missing", "self"])("a present headers='%s' overrides implicit association", async headers => {
    const r = await scan(table(`<tr><th>A</th></tr><tr><td id="self" headers="${headers}">B</td></tr>`));
    expect(r.issues).toHaveLength(1);
  });
  it("accepts at least one resolvable explicit assignment even with invalid extra tokens", async () => {
    const r = await scan(table('<tr><th id="h">A</th></tr><tr><td headers="missing h">B</td></tr>'));
    expect(r.issues).toEqual([]);
  });
  it("accepts non-positional explicit headers", async () => {
    const r = await scan(table('<tr><th id="h">A</th></tr><tr><td>B</td><td headers="h">C</td></tr>'));
    expect(r.issues).toEqual([]);
  });
  it("matches Alfa accepting explicit references to nonempty td cells", async () => {
    const r = await scan(table('<tr><th>A</th></tr><tr><td id="data">B</td><td headers="data">C</td></tr>'));
    expect(r.issues).toEqual([]);
  });
  it("rejects empty header assignments", async () => {
    expect((await scan(table('<tr><th id="h"></th></tr><tr><td headers="h">B</td></tr>'))).issues).toHaveLength(1);
  });
  it("does not resolve IDs from other tables or non-cell elements", async () => {
    const r = await scan('<span id="outside">Outside</span><table><tr><th id="other">Other</th></tr></table>' +
      table('<tr><th>A</th></tr><tr><td headers="other">B</td><td headers="outside">C</td></tr>'));
    expect(r.issues).toHaveLength(2);
  });
  it("handles colspan column headers", async () => {
    expect((await scan(table('<tr><th colspan="2" scope="col">A</th></tr><tr><td>B</td><td>C</td></tr>'))).issues).toEqual([]);
  });
  it("handles rowspan row headers", async () => {
    expect((await scan(table('<tr><th rowspan="2" scope="row">A</th><td>B</td></tr><tr><td>C</td></tr>'))).issues).toEqual([]);
  });
  it("handles downward-growing rowspan=0 headers within row groups", async () => {
    expect((await scan(table('<tbody><tr><th rowspan="0" scope="row">A</th><td>B</td></tr><tr><td>C</td></tr></tbody>'))).issues).toEqual([]);
  });
  it("handles rowgroup headers", async () => {
    expect((await scan(table('<tbody><tr><th scope="rowgroup" colspan="2">A</th></tr><tr><td>B</td><td>C</td></tr></tbody>'))).issues).toEqual([]);
  });
  it("handles colgroup headers", async () => {
    expect((await scan(table('<colgroup span="2"></colgroup><tr><th scope="colgroup" colspan="2">A</th></tr><tr><td>B</td><td>C</td></tr>'))).issues).toEqual([]);
  });
  it("ignores empty data cells when inferring automatic header scope", async () => {
    const r = await scan(table('<tr><td></td><th>A</th></tr><tr><th>B</th><td>C</td></tr>'));
    expect(r.issues).toHaveLength(1); // Empty upper-left data cell itself has no assigned header.
    expect(r.checked).toBe(2);
  });
  it("does not borrow nested table headers for a headerless outer table", async () => {
    const r = await scan(table('<tr><td>Outer</td><td>' +
      '<table><tr><th>Inner header</th></tr><tr><td>Inner data</td><td id="missing">Unassigned</td></tr></table></td></tr>'));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].selector).toBe("td#missing");
    expect(r.checked).toBe(2);
  });
  it("does not borrow outer table headers for a headerless nested table", async () => {
    const r = await scan(table('<tr><th>A</th></tr><tr><td><table><tr><td>Inner</td></tr></table></td></tr>'));
    expect(r.issues).toEqual([]);
    expect(r.checked).toBe(1);
  });
  it("does not cap results", async () => {
    const r = await scan(table('<tr><th>A</th></tr><tr><td>Assigned</td>' + '<td>Unassigned</td>'.repeat(205) + '</tr>'));
    expect(r.issues).toHaveLength(205);
  });
  it("has normal/explicit parity and honors selection", async () => {
    const explicit = await scan(partial);
    const normal = await scan(partial, []);
    // Other all-rules evaluators can serialize a harmless empty style
    // attribute. Compare R77 outcomes rather than their incidental snippets.
    const outcomes = (r: typeof explicit) => r.issues.map(({ ruleId, selector, type, impact, description }: any) =>
      ({ ruleId, selector, type, impact, description }));
    expect(outcomes(normal)).toEqual(outcomes(explicit));
    expect(normal.checked).toBe(explicit.checked);
    expect((await scan(partial, ["ACT-R73"])).issues).toEqual([]);
  });
  it("retains missing-header coverage separately from R77", async () => {
    const r = await scan('<table id="enrollment"><tr><td><b>Course</b></td><td><b>Students</b></td></tr><tr><td>CS</td><td>1500</td></tr></table>', []);
    expect(r.issues).toEqual([]);
    expect(r.checked).toBe(0);
    expect(r.tableIssues.some((i: any) => i.ruleId === "ACT-R76" && i.selector === "table#enrollment")).toBe(true);
  });
  it("refreshes the model after header markup changes", async () => {
    await scan(partial);
    const r = await page.evaluate(() => {
      document.querySelector("tr")!.insertAdjacentHTML("beforeend", "<th>B</th>");
      return (window as any).__ampera.runAllRules({ rules: ["ACT-R77"] }).issues;
    });
    expect(r).toEqual([]);
  });
});
