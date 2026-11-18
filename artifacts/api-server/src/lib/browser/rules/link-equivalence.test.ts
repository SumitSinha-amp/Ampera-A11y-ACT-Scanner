import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R41 link-group review evidence", () => {
  let browser: Browser, page: Page, bundle: string;
  let fixture = "";
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", request => {
      void request.respond({ status: 200, contentType: "text/html", body: fixture });
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(body: string, rules = ["ACT-R41"]) {
    fixture = `<html lang="en"><head><title>Link group evidence</title></head><body>${body}</body></html>`;
    await page.goto("https://fixture.example.test/", { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    return page.evaluate(selected => (window as any).__ampera.runAllRules({ rules: selected }).issues, rules);
  }

  it("emits a selectable occurrence for every member, including repeated destinations", async () => {
    const issues = await scan('<a id="one" href="/one">Details</a><a id="two" href="/two">Details</a><a id="three" href="/two">Details</a>');
    expect(issues).toHaveLength(3);
    expect(issues.map((issue: any) => issue.selector)).toEqual(["a#one", "a#two", "a#three"]);
    for (const [index, issue] of issues.entries()) {
      expect(issue).toMatchObject({ ruleId: "ACT-R41", type: "Potential Issue" });
      expect(issue.description).toContain('3 links share the accessible name "Details"');
      expect(issue.description).toContain("2 different destinations");
      expect(issue.description).toContain("different URLs alone do not prove an accessibility failure");
      expect(issue.description).toContain(`Matching link ${index + 1} of 3:`);
      expect(issue.description).toContain(`Element: ${issue.selector}`);
      expect(issue.elementContext).toContain(`id="${["one", "two", "three"][index]}"`);
    }
    const description = issues.map((issue: any) => issue.description).join("\n");
    expect(description).toContain("Destination: https://fixture.example.test/one");
    expect(description.match(/Destination: https:\/\/fixture.example.test\/two/g)).toHaveLength(2);
  });

  it("gives HTML and page viewers a distinct real target and rectangle for every occurrence", async () => {
    const issues = await scan('<a id="top" href="/one" style="display:block;width:120px;height:30px">Details</a><div style="height:900px"></div><a id="bottom" href="/two" style="display:block;width:120px;height:30px">Details</a>');
    const targets = await page.evaluate((selectors: string[]) => selectors.map(selector => {
      const el = document.querySelector(selector)!;
      const rect = el.getBoundingClientRect();
      return { id: el.id, html: el.outerHTML, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }), issues.map((issue: any) => issue.selector));
    expect(targets.map(target => target.id)).toEqual(["top", "bottom"]);
    expect(targets[0].html).toContain('href="/one"');
    expect(targets[1].html).toContain('href="/two"');
    expect(targets[1].y).toBeGreaterThan(targets[0].y + 800);
    expect(targets.every(target => target.width > 0 && target.height > 0)).toBe(true);
  });

  it("does not infer a group from generic wording alone", async () => {
    expect(await scan('<a href="/offer">Know more</a>')).toEqual([]);
  });

  it("does not group distinct accessible names", async () => {
    expect(await scan('<a href="/one">Offer details</a><a href="/two">Hotel details</a>')).toEqual([]);
  });

  it("shows distinct visible text when explicit accessible names match", async () => {
    const issues = await scan('<a href="/one" aria-label="Offer details">HDFC offer</a><a href="/two" aria-label="Offer details">Axis offer</a>');
    expect(issues).toHaveLength(2);
    const description = issues.map((issue: any) => issue.description).join("\n");
    expect(description.match(/Accessible name: "Offer details"/g)).toHaveLength(2);
    expect(description).toContain('Visible text: "HDFC offer"');
    expect(description).toContain('Visible text: "Axis offer"');
  });

  it("does not group identical visible text when accessible names distinguish the links", async () => {
    expect(await scan('<a href="/one" aria-label="HDFC offer">Know more</a><a href="/two" aria-label="Axis offer">Know more</a>')).toEqual([]);
  });

  it("explains image-only link names instead of presenting different banners as identical visible text", async () => {
    const issues = await scan('<a href="/one"><img alt="img" width="80" height="40"></a><a href="/two"><img alt="img" width="80" height="40"></a>');
    expect(issues).toHaveLength(2);
    const description = issues.map((issue: any) => issue.description).join("\n");
    expect(description.match(/Accessible name: "img"/g)).toHaveLength(2);
    expect(description.match(/Visible text: \(no visible text\)/g)).toHaveLength(2);
  });

  it("preserves the same-resource shortcut for resolved relative URLs and fragment variants", async () => {
    expect(await scan('<a href="/one#top">Details</a><a href="https://fixture.example.test/one#bottom">Details</a>')).toEqual([]);
  });

  it("excludes hidden and inert links from group membership", async () => {
    expect(await scan('<a href="/one">Details</a><a href="/two" hidden>Details</a><a href="/three" style="visibility:hidden">Details</a><div inert><a href="/four">Details</a></div>')).toEqual([]);
  });

  it("keeps settled carousel states separate instead of adding hidden slides to meet a count", async () => {
    expect(await scan('<a id="first" href="/hdfc">Know more</a><a id="second" href="/axis" style="visibility:hidden">Know more</a>')).toEqual([]);
    const issues = await page.evaluate(() => {
      document.getElementById("first")!.style.visibility = "hidden";
      document.getElementById("second")!.style.visibility = "visible";
      return (window as any).__ampera.runAllRules({ rules: ["ACT-R41"] }).issues;
    });
    expect(issues).toEqual([]);
  });

  it("reports six selectable links for Cleartrip-shaped three pairs, but not a lone Know more", async () => {
    const issues = await scan(`
      <a href="/lp/ct-flex">ClearChoice Plus</a><a href="/lp/clearchoice-plus">ClearChoice Plus</a>
      <a href="/hotels/details/st-laurn-koregaon-park-pune-50711">Hotel Willow Banks</a>
      <a href="/hotels/details/hotel-willow-banks-42228">Hotel Willow Banks</a>
      <a href="/hotels/details/hotel-ramada-2044632">Hotel Ramada</a>
      <a href="/hotels/details/hotel-ramada-710120">Hotel Ramada</a>
      <a href="/all-offers/hdfc">Know more</a>`);
    expect(issues).toHaveLength(6);
    expect(new Set(issues.map((issue: any) => issue.selector)).size).toBe(6);
    for (const issue of issues) expect(issue.description).toMatch(/Matching link [12] of 2:/);
    expect(issues.map((issue: any) => issue.description).join("\n")).not.toContain('"Know more"');
  });

  it("redacts sensitive destination evidence without using redacted URLs for matching", async () => {
    const issues = await scan('<a href="https://reader:private-password@offers.example.test/deal?token=first-secret&plan=gold">Details</a><a href="https://reader:private-password@offers.example.test/deal?token=second-secret&plan=gold">Details</a>');
    expect(issues).toHaveLength(2);
    const description = issues.map((issue: any) => issue.description).join("\n");
    expect(description).toContain("2 different destinations");
    for (const secret of ["reader", "private-password", "first-secret", "second-secret"]) {
      expect(description).not.toContain(secret);
    }
    expect(description).toContain("plan=gold");
    expect(description).toContain("%5BREDACTED%5D");
  });

  it("shows resolved destinations for SVG links without treating animated hrefs as strings", async () => {
    const issues = await scan('<svg width="200" height="80"><a href="/one" aria-label="Details"><text x="0" y="20">One</text></a><a href="/two" aria-label="Details"><text x="0" y="50">Two</text></a></svg>');
    expect(issues).toHaveLength(2);
    expect(issues[0].description).toContain("Destination: https://fixture.example.test/one");
    expect(issues[1].description).toContain("Destination: https://fixture.example.test/two");
  });

  it("does not emit group evidence when another rule alone is selected", async () => {
    expect(await scan('<a href="/one">Details</a><a href="/two">Details</a>', ["ACT-R4"])).toEqual([]);
  });
});

describe("ACT-R41 reporting surfaces", () => {
  it("maps the review rule to AAA, without changing contextual R81", async () => {
    const metadata = buildSync({
      entryPoints: [fileURLToPath(new URL("../../../../../accessibility-scanner/src/lib/actRules.ts", import.meta.url))],
      bundle: true, write: false, platform: "node", format: "esm",
    }).outputFiles[0].text;
    const { default: rules } = await import(`data:text/javascript;base64,${Buffer.from(metadata).toString("base64")}`);
    expect(rules["ACT-R41"]).toMatchObject({
      wcagCriteria: ["2.4.9"], wcagLevel: ["AAA"], ruleType: "Potential Issue",
      ada: false, eaa: false,
    });
    expect(rules["ACT-R81"]).toMatchObject({ wcagCriteria: ["2.4.4", "2.4.9"], wcagLevel: ["A", "AAA"] });
    const api = readFileSync(fileURLToPath(new URL("../../scanner.ts", import.meta.url)), "utf8");
    expect(api).toContain('"ACT-R41": { sc: ["2.4.9"], level: ["AAA"] }');
    expect(api).not.toContain('"ACT-R41": { sc: ["2.4.4"], level: ["A"] }');
    const picker = readFileSync(fileURLToPath(new URL("../../../../../accessibility-scanner/src/pages/home.tsx", import.meta.url)), "utf8");
    expect(picker).toContain("Review same-name link destinations (WCAG 2.4.9 AAA)");
  });

  it("keeps comparison evidence wrapped, bounded and keyboard-scrollable in both report views", () => {
    for (const file of ["page-report.tsx", "site-rule-page-report.tsx"]) {
      const source = readFileSync(fileURLToPath(new URL(`../../../../../accessibility-scanner/src/pages/${file}`, import.meta.url)), "utf8");
      expect(source).toContain('selectedIssue.ruleId === "ACT-R41"');
      expect(source).toContain("max-h-48 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]");
      expect(source).toContain('"Matching links and destinations"');
      expect(source).toContain('tabIndex={selectedIssue.ruleId === "ACT-R41" ? 0 : undefined}');
    }
  });
});
