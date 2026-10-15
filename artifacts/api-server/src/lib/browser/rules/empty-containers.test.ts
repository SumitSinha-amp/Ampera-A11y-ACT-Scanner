import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real DOM/style coverage, using system Chromium or Puppeteer's installed copy.
// Environments without a browser skip this integration suite explicitly.
let chromium = process.env.TEST_CHROMIUM_PATH || "";
if (!chromium) {
  try { chromium = execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
  catch { chromium = puppeteer.executablePath(); }
}

describe.skipIf(!existsSync(chromium))("ACT-R68 browser regressions", () => {
  let browser: Browser;
  let bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("./empty-containers.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife", globalName: "R68",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, setup?: string) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<style>main,nav,aside,header,footer,article,section,div{min-height:32px;min-width:32px}</style>${html}`);
      if (setup) await page.addScriptTag({ content: setup });
      await page.addScriptTag({ content: bundle });
      return await page.evaluate(() => {
        const result: { ruleId: string; type: string; selector: string }[] = [];
        (window as unknown as { R68: { runEmptyContainerRule: (rows: unknown[]) => void } }).R68.runEmptyContainerRule(result);
        return result;
      });
    } finally { await page.close(); }
  }

  it("excludes all thirteen scan-424-shaped background/gallery/layout/control findings", async () => {
    const backgrounds = Array.from({ length: 7 }, (_, n) =>
      `<div id="bgMedia_${n}" data-motion-part="BG_MEDIA ${n}"></div>`).join("");
    expect(await scan(`${backgrounds}
      <div class="gallery-item-hover" data-hook="item-hover-0">
        <div class="gallery-item-hover-inner"><div data-hook="info-element">
          <div class="hover-info-element" data-hook="hover-info-element"></div>
        </div></div>
      </div>
      <div data-testid="inline-content"><div data-testid="mesh-container-content"></div></div>
      <div id="comp-jtsl39o4"><label for="message"></label><textarea id="message" placeholder="Type your message here..."></textarea></div>`)).toEqual([]);
  });
  it.each([
    ["textarea", "<textarea></textarea>"], ["select", "<select></select>"],
    ["SVG", '<svg width="32" height="32"><path d="M0 0L32 32"/></svg>'],
    ["image", '<img alt="" width="32" height="32">'], ["canvas", "<canvas></canvas>"],
    ["button", "<button></button>"], ["input", "<input>"],
    ["editable content", '<div contenteditable="true"></div>'],
    ["meter", "<meter></meter>"], ["progress", "<progress></progress>"],
  ])("does not call a semantic region empty when it contains %s", async (_, content) => {
    expect(await scan(`<main>${content}</main>`)).toEqual([]);
  });
  it("ignores plain generic layout even without recognizable framework names", async () => {
    expect(await scan("<div><div><div></div></div></div><section></section>")).toEqual([]);
  });
  it("keeps meaningful text", async () => {
    expect(await scan("<nav>Navigation is loading</nav>")).toEqual([]);
  });
  it("does not report hidden/aria-hidden/inert semantic regions", async () => {
    expect(await scan('<main hidden></main><nav aria-hidden="true"></nav><aside inert></aside>')).toEqual([]);
  });
  it("does not report live-region placeholders or their descendants", async () => {
    expect(await scan('<div aria-live="polite"><nav></nav></div><div role="status"><main></main></div>')).toEqual([]);
  });
  it("does not report a role-overridden presentational landmark", async () => {
    expect(await scan('<main role="presentation"></main>')).toEqual([]);
  });
  it("accepts generated pseudo-element content", async () => {
    expect(await scan('<style>nav::before{content:"Navigation"}</style><nav></nav>')).toEqual([]);
  });
  it("accepts CSS background content including on a descendant", async () => {
    expect(await scan('<nav style="background-image:linear-gradient(red,blue)"></nav><main><div style="background-image:url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)"></div></main>')).toEqual([]);
  });
  it("does not apply to landmarks without required children, even named ones", async () => {
    expect(await scan('<nav aria-label="Primary"></nav><main></main><aside></aside>')).toEqual([]);
  });
  it("does not apply merely because an empty generic container is focusable", async () => {
    expect(await scan('<div id="stop" tabindex="0"></div>')).toEqual([]);
  });
  // Passing and failing structures from upstream sia-r68/rule.spec.tsx.
  it.each([
    ['<div role="list"><span role="listitem">Item 1</span><span role="listitem">Item 2</span></div>'],
    ['<div role="table"><span role="row"><span role="cell">Cell 1</span></span><div role="rowgroup"><span role="row"><span role="cell">Cell 2</span></span></div></div>'],
    ['<div role="table"><span role="caption">Caption</span><span role="row"><span role="cell">Cell</span></span></div>'],
    ['<div role="table"><span role="caption">Caption</span><span role="row"><span role="cell">Cell</span></span><span role="row"><span role="cell">Cell 2</span></span></div>'],
    ['<div role="radiogroup"><span role="radio" aria-labelledby="label"></span><label id="label">Label</label></div>'],
    ['<div role="list"><span role="listitem">Item 1</span>Item 2</div>'],
    ['<ul role="menu" aria-busy="true">Loading</ul>'],
  ])("matches upstream passing or inapplicable structure: %s", async (html) => {
    expect(await scan(html)).toEqual([]);
  });
  it("matches upstream failure: a list with a non-list-item child", async () => {
    const rows = await scan('<div role="list"><span>Item 1</span></div>');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ruleId: "ACT-R68", type: "Issue" });
  });

  const roles = ["feed", "grid", "list", "listbox", "menu", "menubar",
    "radiogroup", "row", "rowgroup", "table", "tablist", "tree", "treegrid"];
  it.each(roles)("reports an empty %s as a confirmed Issue", async (role) => {
    const rows = await scan(`<div role="${role}"></div>`);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("Issue");
  });
  it.each(roles)("does not let text, labels or unrelated content hide a broken %s", async (role) => {
    expect(await scan(`<div role="${role}" aria-label="Named">Text<textarea></textarea><img alt="" width="32" height="32"><button>Click</button></div>`)).toHaveLength(1);
  });
  it.each([
    ["feed", '<article>Story</article>'],
    ["grid", '<div role="row"><div role="gridcell">Cell</div></div>'],
    ["list", '<div role="listitem"></div>'],
    ["listbox", '<div role="group"><div role="option"></div></div>'],
    ["menu", '<div role="group"><div role="menuitemradio"></div></div>'],
    ["menubar", '<div role="menuitemcheckbox"></div>'],
    ["radiogroup", '<input type="radio">'],
    ["row", '<div role="columnheader"></div>'],
    ["rowgroup", '<div role="row"><div role="rowheader"></div></div>'],
    ["table", '<div role="rowgroup"><div role="row"><div role="cell"></div></div></div>'],
    ["tablist", '<div role="tab"></div>'],
    ["tree", '<div role="group"><div role="treeitem"></div></div>'],
    ["treegrid", '<div role="row"><div role="gridcell"></div></div>'],
  ])("accepts valid required children for %s", async (role, content) => {
    expect(await scan(`<div role="${role}">${content}</div>`)).toEqual([]);
  });
  it("supports native lists, tables and multi-selects", async () => {
    expect(await scan('<ul><li>Item</li></ul><ol><li>Item</li></ol><table><tr><th>Header</th><td>Cell</td></tr></table><select multiple><option>Choice</option></select>')).toEqual([]);
    expect(await scan('<ul></ul><select multiple></select><table></table>')).toHaveLength(3);
  });
  it("flattens generic and presentational wrappers, not meaningful boundaries", async () => {
    expect(await scan('<div role="list"><div><div role="none"><span role="listitem">Item</span></div></div></div>')).toEqual([]);
    expect(await scan('<div role="list"><article><span role="listitem">Item</span></article></div>')).toHaveLength(1);
    expect(await scan('<div role="list"><div tabindex="0"><span role="listitem">Item</span></div></div>')).toHaveLength(1);
  });
  it("requires the complete nested role path, not merely a group", async () => {
    const rows = await scan('<div role="table"><div role="rowgroup">No rows</div></div>');
    expect(rows).toHaveLength(2); // Do not deduplicate independent role failures.
    expect(await scan('<div role="listbox"><div role="group">No options</div></div>')).toHaveLength(1);
  });
  it("does not exempt live regions, framework classes, backgrounds or generated content", async () => {
    expect(await scan('<style>#broken::before{content:"Text"}</style><div id="broken" role="list" aria-live="polite" class="gallery-item-hover" data-hook="bgLayers" style="background-image:linear-gradient(red,blue)">Text</div>')).toHaveLength(1);
    expect(await scan('<div role="status"><div role="menu"></div></div>')).toHaveLength(1);
  });
  it("excludes busy ancestors and resumes checking when no longer busy", async () => {
    expect(await scan('<div aria-busy="true"><div role="list"></div></div>')).toEqual([]);
    expect(await scan('<div aria-busy="false"><div role="list"></div></div>')).toHaveLength(1);
  });
  it("ignores hidden targets and does not accept hidden required children", async () => {
    expect(await scan('<div role="list" hidden></div><div role="menu" aria-hidden="true"></div><div role="tree" inert></div><div role="listbox" style="display:none"></div>')).toEqual([]);
    expect(await scan('<div role="list"><div role="listitem" aria-hidden="true">Hidden</div></div>')).toHaveLength(1);
    expect(await scan('<div role="list"><div style="visibility:hidden"><div role="listitem" style="visibility:visible">Visible</div></div></div>')).toEqual([]);
  });
  it("checks zero-sized and transparent accessible containers", async () => {
    expect(await scan('<span role="list"></span><div role="menu" style="opacity:0"></div>')).toHaveLength(2);
  });
  it("supports valid external aria-owns and moves the child away from its DOM parent", async () => {
    expect(await scan('<div role="list" aria-owns="item"></div><div id="item" role="listitem"></div>')).toEqual([]);
    const rows = await scan('<div id="owner" role="list" aria-owns="item"></div><div id="original" role="list"><div id="item" role="listitem"></div></div>');
    expect(rows).toHaveLength(1);
    expect(rows[0].selector).toContain("original");
  });
  it("rejects missing, hidden, self, ancestor, duplicate and cyclic ownership", async () => {
    expect(await scan('<div id="self" role="list" aria-owns="self missing"></div>')).toHaveLength(1);
    expect(await scan('<div role="list" aria-owns="hidden"></div><div id="hidden" role="listitem" hidden></div>')).toHaveLength(1);
    expect(await scan('<div role="list" aria-owns="item"></div><div role="list" aria-owns="item"></div><div id="item" role="listitem"></div>')).toHaveLength(1);
    expect(await scan('<div id="a" role="list" aria-owns="b"></div><div id="b" role="list" aria-owns="a"></div>')).toHaveLength(2);
    expect(await scan('<div id="parent" role="list"><div role="list" aria-owns="parent"></div></div>')).toHaveLength(2);
  });
  it("respects role token fallback and presentational native containers", async () => {
    expect(await scan('<div role="invalid list"></div>')).toHaveLength(1);
    expect(await scan('<ul role="presentation"><li>Item</li></ul>')).toEqual([]);
    expect(await scan('<ul role="none" tabindex="0"></ul>')).toHaveLength(1);
  });
  it("checks slotted/open-shadow content and keeps aria-owns root-scoped", async () => {
    expect(await scan('<div id="host"><div role="listitem">Slotted</div></div>',
      'document.querySelector("#host").attachShadow({mode:"open"}).innerHTML = \'<div role="list"><slot></slot></div>\';')).toEqual([]);
    expect(await scan('<div id="host"></div><div id="item" role="listitem"></div>',
      'document.querySelector("#host").attachShadow({mode:"open"}).innerHTML = \'<div role="list" aria-owns="item"></div>\';')).toHaveLength(1);
  });
});
