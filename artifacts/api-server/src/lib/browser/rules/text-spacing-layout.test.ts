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
const overflowing = `<div id="card" style="width:180px;height:40px;overflow:hidden;font:16px/20px Arial"><p style="margin:0">Alpha beta gamma delta epsilon zeta</p></div>`;

describe.skipIf(!existsSync(chromium))("ACT-R129 custom text-spacing layout", () => {
  let browser: Browser;
  let bundle: string;
  let fullBundle: string;
  beforeAll(async () => {
    const compile = (path: string, globalName: string) => buildSync({
      entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife", globalName,
    }).outputFiles[0].text;
    bundle = compile("./text-spacing-layout.ts", "R129");
    fullBundle = compile("../index.ts", "Scanner");
    browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, options: { full?: boolean; rules?: string[]; fail?: boolean } = {}) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><html><head><style>body{font:16px/20px Arial}</style></head><body>${html}</body></html>`);
      await page.addScriptTag({ content: options.full ? fullBundle : bundle });
      return await page.evaluate(({ full, rules, fail }) => {
        const globals = window as unknown as {
          R129: { runTextSpacingLayoutRule: (rows: unknown[], stat: (...args: unknown[]) => void) => void };
          __ampera: { runAllRules: (options: { rules?: string[] }) => {
            issues: { ruleId: string; selector: string; type: string; element: string; description: string }[];
            stats: { ruleId: string; totalChecked: number }[];
            ruleStatuses: { ruleId: string; status: string }[];
          } };
        };
        document.querySelector("#shadow-host")?.attachShadow({ mode: "open" }).appendChild(
          Object.assign(document.createElement("div"), { innerHTML:
            '<div id="shadow-card" style="width:180px;height:40px;overflow:hidden;font:16px/20px Arial">Alpha beta gamma delta epsilon zeta</div>' }),
        );
        const snapshot = () => Array.from(document.querySelectorAll("*")).map((e) => [e.tagName, e.getAttribute("style")]);
        const before = snapshot();
        const originalRange = Range.prototype.getClientRects;
        if (fail) Range.prototype.getClientRects = function () {
          if (document.body.style.getPropertyPriority("letter-spacing") === "important") throw new Error("forced layout failure");
          return originalRange.call(this);
        };
        let checked = 0;
        const issues: { ruleId: string; selector: string; type: string; element: string; description: string }[] = [];
        let statuses: { ruleId: string; status: string }[] = [];
        let error = "";
        try {
          if (full) {
            const result = globals.__ampera.runAllRules({ rules });
            issues.push(...result.issues);
            checked = result.stats.find((r) => r.ruleId === "ACT-R129")?.totalChecked || 0;
            statuses = result.ruleStatuses;
          } else {
            globals.R129.runTextSpacingLayoutRule(issues, (_, count) => { checked = count as number; });
          }
        } catch (failure) { error = (failure as Error).message; }
        finally { Range.prototype.getClientRects = originalRange; }
        return { issues, checked, statuses, restored: JSON.stringify(before) === JSON.stringify(snapshot()), error };
      }, options);
    } finally { await page.close(); }
  }

  it("detects newly clipped text and groups it by the clipping container", async () => {
    const result = await scan(overflowing);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ ruleId: "ACT-R129", type: "Issue", selector: "div#card" });
    expect(result.issues[0].description).toContain("WCAG 1.4.12");
    expect(result.restored).toBe(true);
    expect(result.error).toBe("");
    expect(result.checked).toBeGreaterThan(0);
  });
  it.each(["auto", "scroll", "visible"])("does not equate overflow:%s with information loss", async (overflow) => {
    const result = await scan(overflowing.replace("overflow:hidden", `overflow:${overflow}`));
    expect(result.issues).toEqual([]);
    expect(result.restored).toBe(true);
  });
  it.each(["hidden", "clip"])("checks overflow:%s containers", async (overflow) => {
    expect((await scan(overflowing.replace("overflow:hidden", `overflow:${overflow}`))).issues.some((r) => r.type === "Issue")).toBe(true);
  });
  it("accepts a flexible wrapping layout", async () => {
    expect((await scan(overflowing.replace("height:40px;", ""))).issues).toEqual([]);
  });
  it("does not report a low default line-height alone", async () => {
    expect((await scan('<p style="line-height:1">Text with a low default line height but flexible layout.</p>')).issues).toEqual([]);
  });
  it("does not reduce already wider spacing or report its existing clipping", async () => {
    const result = await scan('<div style="height:20px;width:100px;overflow:hidden"><p style="line-height:2;letter-spacing:.2em;word-spacing:.3em;margin-bottom:3em">Existing clipping already present in the baseline.</p></div>');
    expect(result.issues).toEqual([]);
    expect(result.restored).toBe(true);
  });
  it("does not call pre-existing widget truncation newly created clipping", async () => {
    const result = await scan(`<a id="follow" style="display:block;width:125px;height:28px;overflow:hidden;white-space:nowrap;font:700 13px/26px Arial">
      <span style="padding-left:30px">Follow @MarsTrip1</span></a>
      <a id="video-title" style="display:block;width:190px;overflow:hidden;white-space:nowrap;font:18px/26px Arial">NASA: Life on Mars Was a Possibility</a>`);
    expect(result.issues).toEqual([]);
    expect(result.restored).toBe(true);
  });
  it("recognizes a small amount of baseline title truncation rather than reporting it as new", async () => {
    const result = await scan(`<a style="display:block;width:78px;overflow:hidden;white-space:nowrap;font:16px/22px monospace">123456789</a>`);
    expect(result.issues).toEqual([]);
  });
  it("does not re-report already truncated text against a newly clipping ancestor", async () => {
    const result = await scan(`<div style="width:90px;overflow:hidden"><a style="display:block;width:80px;overflow:hidden;white-space:nowrap;font:16px/22px monospace">123456789</a></div>`);
    expect(result.issues).toEqual([]);
    expect(result.restored).toBe(true);
  });
  const graphic = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
  it("detects newly overlapping SVG icons after their text label expands", async () => {
    const result = await scan(`<div style="position:relative;height:60px">
      <span style="white-space:nowrap">Text label${graphic}</span>
      <span style="position:absolute;left:110px;top:0">${graphic}</span></div>`);
    expect(result.issues.some(issue => issue.type === "Potential Issue" && issue.description.includes("another icon"))).toBe(true);
    expect(result.restored).toBe(true);
  });
  it("detects the Mars-style worsening Google image / phone sprite collision", async () => {
    const result = await scan(`<div style="position:relative;height:60px;font:12px/16px Arial">
      <a style="display:inline-block;white-space:nowrap;font:12px/13px Arial">
        <div style="display:inline-block;font-weight:bold;vertical-align:top;margin-right:5px;margin-top:8px">MarsCommuter</div>
        <div style="display:inline-block;vertical-align:top;margin-top:8px">&nbsp;</div>
        <img alt="Google+" width="32" height="32" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32'/%3E%3C/svg%3E"></a>
      <em id="phone" style="position:absolute;left:140px;top:2px;width:25px;height:25px;background-image:url(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)"></em></div>`);
    expect(result.issues.some(issue => issue.type === "Potential Issue" && issue.description.includes("another icon") && issue.description.includes("em#phone"))).toBe(true);
    expect(result.restored).toBe(true);
  });
  it("detects new overlap between an icon and its expanding sibling label", async () => {
    const result = await scan(`<div style="position:relative;height:60px;font:16px/20px Arial">
      <span>Phone</span><span style="position:absolute;left:50px;top:0">${graphic}</span></div>`);
    expect(result.issues.some(issue => issue.type === "Potential Issue" && issue.description.includes("with text"))).toBe(true);
  });
  it("does not flag stable pre-existing icon overlap or common vertical movement", async () => {
    const result = await scan(`<p>Growing paragraph spacing moves the icon row together.</p>
      <div style="position:relative;height:60px">${graphic}<span style="position:absolute;left:10px;top:0">${graphic}</span></div>`);
    expect(result.issues).toEqual([]);
    expect(result.restored).toBe(true);
  });
  it("does not mistake a container background for an overlapping icon", async () => {
    const result = await scan(`<div style="background:linear-gradient(white,gray);width:120px;height:120px"><p>Label text wraps freely</p>${graphic}</div>`);
    expect(result.issues).toEqual([]);
  });
  it("checks generated icon glyphs without modifying their authored markup", async () => {
    const result = await scan(`<style>.glyph:before{content:"☎"}.glyph{display:inline-block;width:24px;height:24px}</style>
      <div style="position:relative;height:60px;font:16px/20px Arial"><span>Phone</span>
      <i class="glyph" style="position:absolute;left:50px;top:0"></i></div>`);
    expect(result.issues.some(issue => issue.type === "Potential Issue" && issue.description.includes("with text"))).toBe(true);
    expect(result.restored).toBe(true);
  });
  it("ignores dormant carousel icons", async () => {
    const result = await scan(`<div class="carousel" style="height:50px;overflow:hidden">
      <div style="position:relative;transform:translateY(200px)">Text label${graphic}
      <span style="position:absolute;left:100px;top:0">${graphic}</span></div></div>`);
    expect(result.issues).toEqual([]);
  });
  it.each(["display:none", "visibility:hidden", "opacity:0"])("ignores inactive text: %s", async (style) => {
    expect((await scan(`<div style="${style}">${overflowing}</div>`)).issues).toEqual([]);
  });
  it("finds paragraph-spacing loss inside a fixed-height container", async () => {
    const result = await scan('<div id="paragraphs" style="height:64px;overflow:hidden"><p style="margin:0">First paragraph</p><p style="margin:0">Second paragraph</p></div>');
    expect(result.issues.some((r) => r.selector === "div#paragraphs" && r.type === "Issue")).toBe(true);
  });
  it("uses potential classification for newly overlapping text bounds", async () => {
    const result = await scan('<div style="position:relative;height:160px"><div id="first" style="width:140px">Alpha beta gamma delta</div><div id="second" style="position:absolute;top:38px">Second text</div></div>');
    expect(result.issues.some((r) => r.type === "Potential Issue" && r.description.includes("overlap"))).toBe(true);
  });
  it("does not duplicate pre-existing overlap", async () => {
    const result = await scan('<div style="position:relative;height:160px"><div style="position:absolute;top:0">Alpha beta</div><div style="position:absolute;top:0">Second text</div></div>');
    expect(result.issues).toEqual([]);
  });
  it("checks clipping within open shadow roots", async () => {
    expect((await scan('<div id="shadow-host"></div>')).issues.some((r) => r.type === "Issue")).toBe(true);
  });
  it("does not treat off-slide carousel content as an exposed failure", async () => {
    const result = await scan(`<div class="carousel" style="height:100px;overflow:hidden"><div style="transform:translateY(200px)">${overflowing}</div></div>`);
    expect(result.issues).toEqual([]);
  });
  it("still checks individual exposed fixed-height cards inside a carousel", async () => {
    const result = await scan(`<div class="carousel" style="height:200px;overflow:hidden">${overflowing}</div>`);
    expect(result.issues.some((r) => r.selector === "div#card" && r.type === "Issue")).toBe(true);
  });
  it("restores page and nested scroller positions", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<div style="height:1800px">Page filler</div><div id="scroller" style="height:80px;overflow:auto"><div style="height:900px">Scrollable text</div></div>${overflowing}`);
      await page.addScriptTag({ content: bundle });
      const result = await page.evaluate(() => {
        window.scrollTo(0, 600);
        const scroller = document.getElementById("scroller")!;
        scroller.scrollTop = 200;
        const before = { page: window.scrollY, inner: scroller.scrollTop };
        (window as unknown as { R129: { runTextSpacingLayoutRule: (rows: unknown[], stat: () => void) => void } })
          .R129.runTextSpacingLayoutRule([], () => {});
        return { before, after: { page: window.scrollY, inner: scroller.scrollTop } };
      });
      expect(result.after).toEqual(result.before);
    } finally { await page.close(); }
  });
  it("restores exact attributes even when measuring the overridden layout fails", async () => {
    const result = await scan(overflowing, { fail: true });
    expect(result.error).toBe("forced layout failure");
    expect(result.restored).toBe(true);
  });
  it("returns original markup rather than injected spacing in evidence", async () => {
    const result = await scan(overflowing);
    expect(result.issues[0].element).not.toContain("letter-spacing");
    expect(result.issues[0].element).not.toContain("!important");
  });
  it("runs as an explicitly selectable automatic rule", async () => {
    const result = await scan(overflowing, { full: true, rules: ["ACT-R129"] });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].ruleId).toBe("ACT-R129");
    expect(result.statuses.find((s) => s.ruleId === "ACT-R129")?.status).toBe("executed");
    expect(result.restored).toBe(true);
  });
  it("does not run or mutate layout when another rule is selected", async () => {
    const result = await scan(overflowing, { full: true, rules: ["ACT-R1"] });
    expect(result.checked).toBe(0);
    expect(result.issues.some((r) => r.ruleId === "ACT-R129")).toBe(false);
    expect(result.statuses.find((s) => s.ruleId === "ACT-R129")?.status).toBe("not-selected");
    expect(result.restored).toBe(true);
  });
  it("runs with all rules and keeps restored layout", async () => {
    const result = await scan(overflowing, { full: true });
    expect(result.issues.some((r) => r.ruleId === "ACT-R129")).toBe(true);
    // Legacy detectors may leave empty style attributes; R129's exact
    // restoration is tested independently and in the R129-only bundle case.
    expect(result.error).toBe("");
  });
});
