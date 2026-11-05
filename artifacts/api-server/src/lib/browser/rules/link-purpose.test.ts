import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R81 contextual link purpose", () => {
  let browser: Browser, page: Page, bundle: string;
  let fixture = "";
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
      void request.respond({ status: 200, contentType: "text/html", body: fixture });
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });
  async function scan(html: string, rules: string[] | null = ["ACT-R81"]) {
    fixture = `<!doctype html><html lang="en"><head><title>Links</title></head><body>${html}</body></html>`;
    await page.goto("https://example.com/au/before.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(bundle);
    return page.evaluate(rules => {
      const r = (window as any).__ampera.runAllRules({ rules: rules ?? undefined });
      return { issues: r.issues.filter((i: any) => i.ruleId === "ACT-R81"), stats: r.stats.filter((s: any) => s.ruleId === "ACT-R81") };
    }, rules);
  }
  it("keeps the three repeated links and excludes the unique Info navigation link", async () => {
    const r = await scan('<nav><a href="info.html">Info</a></nav><p>Known issues <a href="info.html">click here</a>. Accessible version <a href="after.html">click here</a>. Cheat sheet <a href="cheatsheet.html">click here</a>.</p>');
    expect(r.issues).toHaveLength(3);
    expect(r.issues.every((i: any) => i.type === "Potential Issue" && i.description.includes('"click here"'))).toBe(true);
    expect(r.stats).toEqual([{ ruleId: "ACT-R81", totalChecked: 4, scope: "element" }]);
  });
  it.each(["Info", "click here", "Download", "A descriptive name"])("does not flag a single %s link", async name => {
    expect((await scan(`<a href="/one">${name}</a>`)).issues).toEqual([]);
  });
  it("finds repeated descriptive names too, not only blacklisted words", async () => {
    expect((await scan('<a href="/one">Annual Report</a><a href="/two">Annual Report</a>')).issues).toHaveLength(2);
  });
  it("resolves equivalent relative and absolute URL syntax", async () => {
    expect((await scan('<a href="info.html">Info</a><a href="https://example.com/au/info.html">Info</a>')).issues).toEqual([]);
  });
  it("uses accessible names rather than identical visible labels", async () => {
    expect((await scan('<p><a href="/one" aria-label="Admissions details">Info</a><a href="/two" aria-label="Library details">Info</a></p>')).issues).toEqual([]);
  });
  it("resolves aria-labelledby and excludes hidden matching links", async () => {
    const r = await scan('<span id="label">Details</span><a href="/one" aria-labelledby="label">One</a><a href="/two" aria-label="Details">Two</a><a href="/three" hidden>Details</a><a href="/four" aria-hidden="true">Details</a>');
    expect(r.issues).toHaveLength(2);
  });
  it("does not merge links in different programmatic contexts", async () => {
    expect((await scan('<p>Admissions: <a href="/one">Details</a></p><p>Library: <a href="/two">Details</a></p>')).issues).toEqual([]);
  });
  it("keeps distinct paragraph nodes separate even when their text is identical", async () => {
    expect((await scan('<p>Report: <a href="/one">Details</a></p><p>Report: <a href="/two">Details</a></p>')).issues).toEqual([]);
  });
  it("does not collide matching-name groups in different paragraphs", async () => {
    const r = await scan('<p><a href="/one">Foo</a><a href="/two">Foo</a></p><p><a href="/one">Foo</a><a href="/one">Foo</a></p>');
    expect(r.issues).toHaveLength(2);
    expect(r.issues.every((i: any) => i.description.startsWith("2 links"))).toBe(true);
  });
  it("includes all ancestor list items as well as the nearest paragraph", async () => {
    expect((await scan('<ul><li><a href="/one">Details</a><ul><li><a href="/two">Details</a></li></ul></li></ul>')).issues).toEqual([]);
    expect((await scan('<ul><li><p><a href="/one">Details</a><a href="/two">Details</a></p></li></ul>')).issues).toHaveLength(2);
  });
  it("groups by the nearest cell node, not its text", async () => {
    expect((await scan('<table><tr><td><a href="/one">Details</a></td><td><a href="/two">Details</a></td></tr></table>')).issues).toEqual([]);
    expect((await scan('<table><tr><td><a href="/one">Details</a><a href="/two">Details</a></td></tr></table>')).issues).toHaveLength(2);
  });
  it("includes aria-describedby node identity, ignoring missing and duplicate references", async () => {
    expect((await scan('<span id="a">Same</span><span id="b">Same</span><a href="/one" aria-describedby="a">Details</a><a href="/two" aria-describedby="b">Details</a>')).issues).toEqual([]);
    expect((await scan('<span id="a">Same</span><span id="b">Other</span><a href="/one" aria-describedby="a b a absent">Details</a><a href="/two" aria-describedby="b a">Details</a>')).issues).toHaveLength(2);
  });
  it("does not equate compatibility Unicode characters that upstream keeps distinct", async () => {
    expect((await scan('<a href="/one">Ｆｏｏ</a><a href="/two">Foo</a>')).issues).toEqual([]);
  });
  it("uses the response URL rather than a base element for the same-resource shortcut", async () => {
    expect((await scan('<base href="https://other.example/"><a href="info.html">Info</a><a href="https://example.com/au/info.html">Info</a>')).issues).toEqual([]);
  });
  it("resolves empty href attributes to the response URL", async () => {
    expect((await scan('<a href="">Info</a><a href="https://example.com/au/before.html">Info</a>')).issues).toEqual([]);
  });
  it("does not apply the native href shortcut to scripted elements", async () => {
    expect((await scan('<span role="link" href="/one">Info</span><span role="link" href="/one">Info</span>')).issues).toHaveLength(2);
  });
  it("matches the official relative-URL variants", async () => {
    expect((await scan(['https://example.com/au/foo.html', 'foo.html', './foo.html', '/au/foo.html', 'down/../foo.html', '../au/foo.html'].map(href => `<a href="${href}">Foo</a>`).join(""))).issues).toEqual([]);
  });
  it("keeps shadow-root describedby references scoped to their actual root", async () => {
    const r = await scan(`<span id="description">Outside</span><div id="host"></div><script>
      document.getElementById("host").attachShadow({mode:"open"}).innerHTML =
        '<span id="description">Inside</span><a href="/one" aria-describedby="description">Details</a><a href="/two" aria-describedby="description">Details</a>';
    </script>`);
    expect(r.issues).toHaveLength(2);
  });
  it("checks SVG link elements alongside HTML links", async () => {
    expect((await scan('<svg width="500" height="50"><a href="/one" aria-label="Details"><text y="20">One</text></a><a href="/two" aria-label="Details"><text x="100" y="20">Two</text></a></svg>')).issues).toHaveLength(2);
  });
  it("excludes placeholder anchors and role-overridden native anchors", async () => {
    expect((await scan('<a>Info</a><a href="/one" role="button">Info</a><a href="/two">Info</a>')).issues).toEqual([]);
  });
  it("keeps unknown scripted destinations for review without activating them", async () => {
    expect((await scan('<span role="link" tabindex="0" aria-label="Details">One</span><span role="link" tabindex="0" aria-label="Details">Two</span>')).issues).toHaveLength(2);
  });
  it("normalizes case and whitespace when comparing names", async () => {
    expect((await scan('<a href="/one">Read   more</a><a href="/two">READ MORE</a>')).issues).toHaveLength(2);
  });
  it("has the same findings in normal and explicit scans, with statistics counted once", async () => {
    const html = '<p><a href="/one">Details</a><a href="/two">Details</a></p>';
    const explicit = await scan(html);
    expect(await scan(html, null)).toEqual(explicit);
    expect((await scan(html, ["ACT-R39"])).issues).toEqual([]);
  });
});
