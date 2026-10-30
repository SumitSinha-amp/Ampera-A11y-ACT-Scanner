import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("R69 Alfa and W3C afw4f7", () => {
  let browser: Browser, page: Page, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, rules: string[] | undefined = ["ACT-R69"]) {
    await page.setContent(`<!doctype html><html><head><title>Contrast</title></head><body>${html}</body></html>`);
    await page.evaluate(bundle);
    return page.evaluate(rules => {
      const r = (window as any).__ampera.runAllRules({ rules });
      return { issues: r.issues.filter((i: any) => i.ruleId === "ACT-R69"),
        checked: r.stats.find((s: any) => s.ruleId === "ACT-R69")?.totalChecked,
        status: r.ruleStatuses.find((s: any) => s.ruleId === "ACT-R69")?.status };
    }, rules);
  }

  it.each([
    ["Alfa pass 1 / W3C pass 1", '<p style="color:#333;background:#fff">Some text in a human language</p>'],
    ["Alfa pass 2", '<p style="color:#666;background:white">Some text in English</p>'],
    ["W3C pass 5: 18pt", '<p style="color:black;background:#666;font-size:18pt">Large text</p>'],
    ["W3C pass 6: exact 14pt bold", '<p style="color:black;background:#666;font-size:14pt;font-weight:700">Large bold</p>'],
    ["W3C pass 7: punctuation", '<p style="color:#000;background:#666">----=====++++++++</p>'],
    ["W3C pass 8: defaults", "<p>Some text in English</p>"],
    ["W3C pass 10: native link", '<a href="https://w3c.org/">W3C</a>'],
    ["W3C pass 11: semantic button", '<div role="button">My button!</div>'],
  ])("%s", async (_, html) => {
    expect((await scan(html)).issues).toEqual([]);
  });

  it.each([
    ["W3C fail 1 / Alfa fail", '<p style="color:#aaa;background:white">Some text</p>', "2.32"],
    ["W3C fail 2: all gradient stops fail", '<p style="color:#aaa;background:linear-gradient(to right,#fff,#00f);width:300px">Some text</p>', undefined],
    ["W3C fail 4: foreground alpha", '<p style="color:rgba(0,0,0,.3);background:white">Some text</p>', undefined],
    ["W3C fail 5: opacity", '<div style="background:white"><p style="color:black;opacity:.3">Some text</p></div>', undefined],
    ["W3C fail 7: alpha over split background", '<span style="color:rgba(90,90,90,.8);background-image:linear-gradient(90deg,transparent,transparent 3.3em,black 3.3em,black 6em);padding:0 1em">Hello world</span>', undefined],
    ["W3C fail 8: informative font sample", '<p style="font-family:helvetica;background:#eee;color:#777">The quick brown fox</p>', "3.86"],
    ["W3C fail 9: button", '<button style="color:#777;background:#eee">My button!</button>', "3.86"],
    ["W3C fail 10: semantic button", '<div role="button" style="color:#777;background:#eee">My button!</div>', "3.86"],
    ["Link coverage", '<a href="#" style="color:#aaa;background:white">Destination</a>', "2.32"],
    ["Single character", '<span style="color:#aaa;background:white">X</span>', "2.32"],
    ["Visible aria-hidden text", '<span aria-hidden="true" style="color:#aaa;background:white">Visible text</span>', "2.32"],
  ])("%s", async (_, html, measurement) => {
    const r = await scan(html);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].type).toBe("Issue");
    if (measurement) expect(r.issues[0].description).toContain(measurement);
  });

  it.each([
    ["W3C inapplicable 1", '<p style="display:none">Invisible</p>'],
    ["W3C inapplicable 2", '<p style="position:absolute;top:-999em">Invisible</p>'],
    ["W3C inapplicable 3", '<p aria-hidden="true" style="color:white;background:white">Hidden</p>'],
    ["W3C inapplicable 4", '<svg><text x="0" y="15">I love SVG!</text></svg>'],
    ["W3C inapplicable 5", '<p><img alt="example"></p>'],
    ["W3C inapplicable 6", '<label style="color:#888;background:white">My name<input type="text" disabled></label>'],
    ["W3C inapplicable 7", '<label id="label" style="color:#888;background:white">Name</label><div role="textbox" aria-labelledby="label" aria-disabled="true">test</div>'],
    ["W3C inapplicable 8", '<fieldset disabled style="color:#888;background:white"><label>My name<input></label></fieldset>'],
    ["W3C inapplicable 9", '<div role="group" aria-disabled="true" style="color:#888;background:white"><label>Name<input></label></div>'],
    ["W3C inapplicable 10", '<button disabled style="color:#777;background:#eee">My button!</button>'],
    ["W3C inapplicable 11", '<div role="button" aria-disabled="true" style="color:#777;background:#eee">My button!</div>'],
    ["Opacity zero", '<p style="opacity:0;color:#aaa">Hidden</p>'],
    ["Clipped text", '<p style="position:absolute;clip-path:inset(50%);color:#aaa">Hidden</p>'],
    ["Overflow hidden", '<div style="overflow:hidden;width:40px;height:20px;position:relative"><span style="position:absolute;left:100px;color:#aaa">Invisible</span></div>'],
  ])("%s", async (_, html) => {
    const r = await scan(html);
    expect(r.issues).toEqual([]);
    expect(r.checked).toBe(0);
  });

  it.each([
    ["image", '<p style="color:#555;background:black url(https://invalid.test/image.jpg)">Image text</p>'],
    ["W3C pass 3: image and text shadow", '<p style="color:#ccc;background:black url(https://invalid.test/image.jpg);text-shadow:0 0 2px black">Black hole sun</p>'],
    ["W3C pass 4: text shadow", '<p style="color:black;background:#737373;text-shadow:white 0 0 3px">Some text</p>'],
    ["W3C fail 3: image requires review, not invented failure", '<p style="color:#555;background:black url(https://invalid.test/image.jpg)">Black hole sun</p>'],
    ["positioned transparent backdrop", '<p style="position:absolute;color:white">Overlay</p>'],
  ])("keeps unresolved %s for review", async (_, html) => {
    const r = await scan(html);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].type).toBe("Potential Issue");
  });

  it("does not collapse distinct sibling text nodes into their parent", async () => {
    const r = await scan('<p style="color:#aaa;background:white">First <b style="color:black">good</b> last</p>');
    expect(r.issues).toHaveLength(2);
    expect(r.checked).toBe(3);
  });
  it.each([
    '<div style="opacity:.3"><span style="color:black;background:white">Group opacity</span></div>',
    '<p style="opacity:.3;color:black;background:white">Element opacity</p>',
    '<div style="background:white"><div style="opacity:.6"><span style="opacity:.5;color:black">Nested opacity</span></div></div>',
  ])("composites the whole group's opacity in paint order", async html => {
    const r = await scan(html);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].type).toBe("Issue");
    expect(r.issues[0].description).toMatch(/2\.1[01]:1/);
  });
  it("honors the actual text-fill color", async () => {
    const r = await scan('<p style="color:black;-webkit-text-fill-color:#aaa;background:white">Text fill</p>');
    expect(r.issues[0].description).toContain("2.32:1");
  });
  it("does not ignore text merely because a non-control has a disabled attribute", async () => {
    expect((await scan('<p disabled style="color:#aaa;background:white">Not disabled</p>')).issues[0].type).toBe("Issue");
  });
  it("checks every stop, leaving mixed character-level contrast for review", async () => {
    const r = await scan('<p style="color:#aaa;background:linear-gradient(white,#aaa,black)">Gradient</p>');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].type).toBe("Potential Issue");
    expect(r.issues[0].description).toContain("each visible character");
  });
  it("does not fail W3C passed gradient example 2 from a low midpoint", async () => {
    const r = await scan('<p style="color:#333;background:linear-gradient(to right,#fff,#00f);width:500px">Some text in a human language</p>');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].type).toBe("Potential Issue");
  });
  it.each([["#333", 0], ["#aaa", 1]])("W3C shadow-root fixture %s", async (c, count) => {
    await page.setContent('<div id="host"></div>');
    await page.evaluate(c => {
      document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML =
        `<span style="color:${c};background:white">Shadow text</span>`;
    }, c);
    await page.evaluate(bundle);
    const r = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R69"] }));
    expect(r.issues).toHaveLength(count);
    if (count) expect(r.issues[0].type).toBe("Issue");
  });
  it("traverses assigned slots once", async () => {
    await page.setContent('<div id="host"><span slot="label">Slotted</span></div>');
    await page.evaluate(() => {
      document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML =
        '<span style="color:#aaa;background:white"><slot name="label"></slot></span>';
    });
    await page.evaluate(bundle);
    const r = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R69"] }));
    expect(r.issues).toHaveLength(1);
  });
  it("has normal/explicit parity without modifying markup", async () => {
    const html = '<a id="destination" href="#" style="color:#aaa;background:white">Bad contrast</a>';
    const explicit = await scan(html);
    expect(await scan(html, [])).toEqual(explicit);
    expect(explicit.status).toBe("executed");
    expect((await scan(html, ["ACT-R47"])).issues).toEqual([]);
    expect(await page.$eval("#destination", el => el.outerHTML)).toBe(html);
  });
  it("does not cap findings at the old 200-occurrence limit", async () => {
    const r = await scan('<div style="color:#aaa;background:white">' + '<span>X</span>'.repeat(205) + "</div>");
    expect(r.issues).toHaveLength(205);
  });
  it("checks below-fold text within a viewport-sized inner scroller", async () => {
    const r = await scan('<style>html,body{height:100%;margin:0;overflow:hidden}</style><main style="height:100vh;overflow:auto"><div style="height:1800px"></div><a href="#" style="color:#aaa;background:white">Below fold</a></main>');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].type).toBe("Issue");
    expect(await page.$eval("main", el => el.scrollTop)).toBe(0);
  });
});
