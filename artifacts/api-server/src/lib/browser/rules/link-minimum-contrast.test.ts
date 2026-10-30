import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rewriteLinkStateSelector } from "./link-minimum-contrast";

describe("R88 state selector rewriting", () => {
  it.each([
    ["a:hover", "a[data-ampera-r88-hover]"],
    ["a:visited:focus", "a[data-ampera-r88-visited][data-ampera-r88-focus]"],
    [":not(a:link):focus-visible", ":not(a[data-ampera-r88-link])[data-ampera-r88-focus-visible]"],
    ['a[href=":visited"]:hover', 'a[href=":visited"][data-ampera-r88-hover]'],
    ["a::focus,a:focusable", "a::focus,a:focusable"],
    ["a\\:hover:focus-within", "a\\:hover[data-ampera-r88-focus-within]"],
  ])("rewrites %s without changing specificity or strings", (source, expected) => {
    expect(rewriteLinkStateSelector(source)).toBe(expected);
  });
});

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("R88 specification and browser integration", () => {
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

  async function scan(html: string, rules?: string[]) {
    await page.setContent(`<!doctype html><html lang="en"><head><title>Contrast</title></head><body>${html}</body></html>`);
    await page.evaluate(bundle);
    return page.evaluate(rules => {
      const r = (window as any).__ampera.runAllRules({ rules });
      return { issues: r.issues.filter((i: any) => i.ruleId === "ACT-R88"), stats: r.stats.filter((s: any) => s.ruleId === "ACT-R88") };
    }, rules);
  }

  it.each(["#333", "#666"])("passes official %s on white fixture", async color => {
    expect((await scan(`<a href="#" style="color:${color};background:white">Some link</a>`, ["ACT-R88"])).issues).toEqual([]);
  });
  it("passes official 18pt large text fixture", async () => {
    expect((await scan('<a href="#" style="color:black;font-size:18pt;background:#777">Some link</a>', ["ACT-R88"])).issues).toEqual([]);
  });
  it("fails official light-grey fixture", async () => {
    const r = await scan('<a href="#" style="color:#aaa;background:white">Some link</a>', ["ACT-R88"]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ type: "Issue" });
    expect(r.issues[0].description).toContain("2.32:1");
    expect(r.issues[0].element).not.toContain("data-ampera");
    expect(r.issues[0].elementContext).not.toContain("data-ampera");
  });
  it.each(["hover", "focus", "visited"])("fails the official %s-only fixture", async state => {
    const r = await scan(`<style>a{color:#333;background:white}a:${state}{color:#aaa}</style><a href="#">Some link</a>`, ["ACT-R88"]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].type).toBe("Issue");
    expect(r.issues[0].description).toContain(state);
  });
  it("checks the combined visited + hover + focus state", async () => {
    const r = await scan('<style>a{color:#333;background:white}a:visited:hover:focus{color:#aaa}</style><a href="#">Combined</a>', ["ACT-R88"]);
    expect(r.issues[0].description).toContain("visited, hovered, focused");
    expect(r.issues[0].description).not.toContain("unvisited");
  });
  it("preserves :link specificity and cascade against :visited", async () => {
    const r = await scan('<style>a:link{color:#333}a:visited{color:#aaa}a{background:white}</style><a href="#">States</a>', ["ACT-R88"]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].description).toContain("2.32:1");
    expect(r.issues[0].description).not.toContain("unvisited");
  });
  it("matches official inapplicable examples", async () => {
    const r = await scan('<a href="#" style="display:none;color:#aaa">Hidden</a><button>Button</button><span role="link">Repurposed</span><a>No href</a><a href="#" aria-disabled="true">Disabled</a>', ["ACT-R88"]);
    expect(r.issues).toEqual([]);
    expect(r.stats[0].totalChecked).toBe(0);
  });
  it("checks each text node, including one-character and punctuation text", async () => {
    const r = await scan('<a href="#" style="color:#aaa;background:white">X<span>!</span>tail</a>', ["ACT-R88"]);
    expect(r.issues).toHaveLength(3);
    expect(r.stats[0].totalChecked).toBe(3);
  });
  it("checks visually visible aria-hidden text", async () => {
    const r = await scan('<a href="#" aria-hidden="true" style="color:#aaa;background:white">Visible text</a>', ["ACT-R88"]);
    expect(r.issues[0].type).toBe("Issue");
  });
  it("composites transparent foreground colour", async () => {
    const r = await scan('<a href="#" style="color:rgba(0,0,0,.2);background:white">Transparent foreground</a>', ["ACT-R88"]);
    expect(r.issues[0].type).toBe("Issue");
    expect(r.issues[0].description).toContain("1.61:1");
  });
  it("resolves modern computed colour syntax rather than treating it as background", async () => {
    const r = await scan('<a href="#" style="color:color(srgb 0 0 0);background:white">Modern black</a>', ["ACT-R88"]);
    expect(r.issues).toEqual([]);
  });
  it("uses the exact 14pt bold large-text boundary", async () => {
    const r = await scan('<a href="#" style="color:#888;background:white;font-size:14pt;font-weight:700">Large bold</a>', ["ACT-R88"]);
    expect(r.issues).toEqual([]);
  });
  it.each([
    "background-image:linear-gradient(white,black)",
    "background-image:url(data:image/png;base64,broken)",
  ])("does not confirm a failure from an unresolved background: %s", async style => {
    const r = await scan(`<a href="#" style="color:white;${style}">Image link</a>`, ["ACT-R88"]);
    expect(r.issues[0].type).toBe("Potential Issue");
  });
  it("does not mistake a sibling photograph backdrop for ancestor white", async () => {
    const r = await scan('<div style="position:relative;width:600px;height:100px"><div style="position:absolute;inset:0;background-image:linear-gradient(black,#333)"></div><a href="#" style="position:absolute;color:white">Header link</a></div>', ["ACT-R88"]);
    expect(r.issues[0].type).toBe("Potential Issue");
    expect(r.issues[0].description).toContain("non-ancestor");
  });
  it("excludes text hidden by opacity, but evaluates hover-revealed text", async () => {
    const r = await scan('<style>a span{opacity:0}a:hover span{opacity:1}</style><a href="#" style="color:#aaa;background:white"><span>Revealed</span></a>', ["ACT-R88"]);
    expect(r.issues[0].type).toBe("Issue");
    expect(r.issues[0].description).toContain("hovered");
    expect(r.issues[0].description).not.toContain("not hovered");
  });
  it("restores styles, attributes and focus without dispatching events", async () => {
    await scan('<style>a:hover{color:#aaa}a{color:#333;background:white}</style><a id="link" data-ampera-r88-hover="original" href="#">Safe</a>', ["ACT-R88"]);
    expect(await page.evaluate(() => ({
      selector: document.styleSheets[0].cssRules[0].cssText,
      attributes: [...document.querySelector("#link")!.attributes].filter(a => a.name.startsWith("data-ampera")).map(a => [a.name, a.value]),
      focus: document.activeElement?.tagName,
    }))).toEqual({ selector: "a:hover { color: rgb(170, 170, 170); }", attributes: [["data-ampera-r88-hover", "original"]], focus: "BODY" });
  });
  it("has normal/explicit parity and honors exclusion", async () => {
    const html = '<a href="#" style="color:#aaa;background:white">Bad contrast</a>';
    const explicit = await scan(html, ["ACT-R88"]);
    expect(await scan(html)).toEqual(explicit);
    expect((await scan(html, ["ACT-R47"])).issues).toEqual([]);
  });
  it("traverses slotted text once and shadow-root link styles", async () => {
    await page.setContent('<div id="host"><span slot="label">Slotted</span></div>');
    await page.evaluate(() => {
      document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML =
        '<style>a{color:#aaa;background:white}</style><a href="#"><slot name="label"></slot></a>';
    });
    await page.evaluate(bundle);
    const r = await page.evaluate(() => (window as any).__ampera.runAllRules({ rules: ["ACT-R88"] }));
    expect(r.issues.filter((i: any) => i.type === "Issue")).toHaveLength(1);
  });
});
