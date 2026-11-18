import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let chromium = process.env.TEST_CHROMIUM_PATH || "";
try { chromium ||= execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(); }
catch { chromium ||= puppeteer.executablePath(); }

describe.skipIf(!existsSync(chromium))("ACT-R16 required ARIA attributes", () => {
  let browser: Browser, bundle: string;
  beforeAll(async () => {
    bundle = buildSync({
      entryPoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
      bundle: true, write: false, platform: "browser", format: "iife",
    }).outputFiles[0].text;
    browser = await puppeteer.launch({
      executablePath: chromium, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  async function scan(html: string, reveal = false) {
    const page = await browser.newPage();
    try {
      await page.setContent(`<html lang="en"><head><title>ARIA</title></head><body>${html}</body></html>`);
      if (reveal) await page.evaluate(() => {
        document.querySelectorAll<HTMLElement>("[data-category]").forEach(el => { el.style.display = "block"; });
      });
      await page.addScriptTag({ content: bundle });
      return await page.evaluate(() =>
        (window as any).__ampera.runAllRules({ rules: ["ACT-R16"] }).issues);
    } finally { await page.close(); }
  }

  const passengers = ["Adult", "Senior", "Youth"].map((category, i) => `
    <section data-category style="${i ? "display:none" : ""}">
      <span id="category_label_${i}">${category}</span>
      <button aria-label="Remove passenger" aria-controls="search[passengers_attributes][${i}][number]" ${i ? "disabled" : ""}>−</button>
      <div id="search[passengers_attributes][${i}][number]" role="alert" aria-live="assertive" aria-labelledby="category_label_${i}">${i ? 0 : 1}</div>
      <button aria-label="Add passenger" aria-controls="search[passengers_attributes][${i}][number]">+</button>
    </section>`).join("");

  it.each([false, true])("does not require expanded state on six passenger steppers, revealed=%s", async reveal => {
    expect(await scan(passengers, reveal)).toHaveLength(0);
  });

  it("does not infer expanded state from aria-controls on buttons, links, or scrollbars", async () => {
    expect(await scan(`
      <div id="target">Controlled content</div>
      <button aria-controls="target">Update</button>
      <span role="button" tabindex="0" aria-controls="target">Update</span>
      <a href="#" aria-controls="target">Update</a>
      <a href="javascript:void(0)" aria-controls="target">Update</a>
      <a href="javascript:;" aria-controls="target">Update</a>
      <div role="scrollbar" aria-controls="target" aria-valuenow="10" aria-valuemin="0" aria-valuemax="100"></div>
    `)).toHaveLength(0);
  });

  it.each([
    ["checkbox", "aria-checked"],
    ["radio", "aria-checked"],
    ["switch", "aria-checked"],
    ["combobox", "aria-expanded"],
    ["spinbutton", "aria-valuenow"],
  ])("still reports required %s state %s", async (role, attr) => {
    const issues = await scan(`<div role="${role}" tabindex="0">Control</div>`);
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain(`missing required attribute: ${attr}`);
  });

  it("preserves required-attribute failures alongside valid passenger controls", async () => {
    const issues = await scan(`${passengers}<div role="checkbox">Accept terms</div>`);
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('role="checkbox"');
  });

  it("checks hidden required-state controls after they enter the accessibility tree", async () => {
    const fixture = '<div data-category style="display:none"><div role="checkbox">Accept</div></div>';
    expect(await scan(fixture)).toHaveLength(0);
    expect(await scan(fixture, true)).toHaveLength(1);
  });
});
