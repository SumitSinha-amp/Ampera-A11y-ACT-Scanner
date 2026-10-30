import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium = puppeteer.executablePath(); }

type CellSnapshot = {
  id: string; x: number; y: number; width: number; height: number;
  headers: string[]; headerPositions: number[][];
};

describe.skipIf(!existsSync(chromium))("Ampera native table helper", () => {
  let browser: Browser, page: Page, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("./table-model.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife", globalName: "TableModel",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    page = await browser.newPage();
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function model(html: string): Promise<{ unchanged: boolean; cells: CellSnapshot[] }> {
    await page.setContent(html);
    await page.evaluate(bundle);
    return page.evaluate(() => {
      const table = document.querySelector("table")!;
      const before = table.outerHTML;
      const result = (window as any).TableModel.modelNativeTable(table);
      return {
        unchanged: before === table.outerHTML,
        cells: result.cells.map((c: any) => ({
          id: c.element.id, x: c.x, y: c.y, width: c.width, height: c.height,
          headers: Array.from(c.headers as Set<any>).map(h => h.element.id).sort(),
          headerPositions: Array.from(c.headers as Set<any>).map(h => [h.x, h.y]),
        })),
      };
    });
  }
  it("supports automatic headers in both directions when data cells are empty", async () => {
    const r = await model('<table><tr><th id="h" rowspan="3">Header</th><td id="empty"></td></tr></table>');
    expect(r.cells.find(c => c.id === "empty")?.headers).toEqual(["h"]);
    expect(r.unchanged).toBe(true);
  });
  it("preserves header-slot insertion order across row spans", async () => {
    const r = await model(`<table><tfoot>
      <tr><th colspan="2">A</th><th id="group" rowspan="3" scope="rowgroup">G</th><th id="auto" rowspan="3">H</th><td id="target" rowspan="3">D</td></tr>
      <tr><th scope="col">B</th><td>E</td></tr>
      <tr><th rowspan="3" scope="col"></th><th id="row" rowspan="3" scope="row">R</th><td rowspan="3"></td></tr>
      <tr><td>F</td><th rowspan="3" scope="col">C</th><th rowspan="3">I</th><td rowspan="3">J</td><th>K</th></tr>
      </tfoot></table>`);
    expect(r.cells.find(c => c.id === "target")?.headers).toEqual(["auto", "row"]);
  });
  it("moves footer rows after body rows even when tfoot appears first", async () => {
    const r = await model('<table><tfoot><tr><td id="footer">F</td></tr></tfoot><tbody><tr><th id="header">H</th></tr><tr><td id="body">B</td></tr></tbody></table>');
    expect(r.cells.map(c => [c.id, c.y])).toEqual([["header", 0], ["body", 1], ["footer", 2]]);
    expect(r.cells.find(c => c.id === "footer")?.headers).toEqual(["header"]);
  });
  it("does not extend rowspan=0 beyond its row group", async () => {
    const r = await model('<table><tbody><tr><th id="h" rowspan="0" scope="row">H</th><td>A</td></tr><tr><td>B</td></tr></tbody><tbody><tr><td id="next">C</td></tr></tbody></table>');
    expect(r.cells.find(c => c.id === "h")?.height).toBe(2);
    expect(r.cells.find(c => c.id === "next")?.headers).toEqual([]);
  });
  it("uses the last same-table duplicate ID like the reference model", async () => {
    const r = await model('<table><tr><th id="h">First</th><th id="h">Second</th></tr><tr><td headers="h" id="target">D</td></tr></table>');
    expect(r.cells.find(c => c.id === "target")?.headers).toEqual(["h"]);
    expect(r.cells.find(c => c.id === "target")?.headerPositions).toEqual([[1, 0]]);
    expect(r.unchanged).toBe(true);
  });
  it("treats child elements as nonempty, but comments and whitespace as empty", async () => {
    const r = await model('<table><tr><th id="image"><img alt="Header"></th><th id="blank"> <!--comment--> </th></tr><tr><td id="a" headers="image">A</td><td id="b" headers="blank">B</td></tr></table>');
    expect(r.cells.find(c => c.id === "a")?.headers).toEqual(["image"]);
    expect(r.cells.find(c => c.id === "b")?.headers).toEqual([]);
  });
  it("keeps large spans sparse instead of allocating a dense grid", async () => {
    const r = await model('<table><tr><th id="large" colspan="1000" rowspan="65534">H</th></tr></table>');
    expect(r.cells).toHaveLength(1);
    expect(r.cells[0]).toMatchObject({ width: 1000, height: 65534 });
  });
  it("ignores nested-table cells in the outer model", async () => {
    const r = await model('<table><tr><th id="outer">H</th></tr><tr><td id="data"><table><tr><th id="inner">Inner</th></tr></table></td></tr></table>');
    expect(r.cells.map(c => c.id)).toEqual(["outer", "data"]);
  });
});
