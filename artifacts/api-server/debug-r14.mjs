import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
import { fileURLToPath } from "url";

puppeteerExtra.use(StealthPlugin());

const CHROME_PROFILE_DIR = path.join(process.cwd(), ".chrome-profile-debug");
const URL = "https://www.keysight.com/us/en/products/services/keysightcare-service-and-support.html";

const browser = await puppeteerExtra.launch({
  headless: true,
  executablePath: "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
  userDataDir: CHROME_PROFILE_DIR,
  args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--window-size=1440,900"],
});

const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
try { await page.waitForNetworkIdle({ idleTime: 500, timeout: 12000 }); } catch {}

const debug = await page.evaluate(() => {
  // Check all interactive elements with aria-label or aria-labelledby
  const results = [];
  document.querySelectorAll("a[href], button, [role='button'], [role='link'], [role='tab'], input, select, textarea").forEach(el => {
    const hasLabel = el.hasAttribute("aria-label");
    const hasLabelledBy = el.hasAttribute("aria-labelledby");
    if (!hasLabel && !hasLabelledBy) return;
    const visibleText = el.textContent?.trim().replace(/\s+/g,' ').substring(0,60) || '';
    const ariaLabel = el.getAttribute("aria-label") || "";
    const ariaLabelledby = el.getAttribute("aria-labelledby") || "";
    let accName = ariaLabel;
    if (!accName && ariaLabelledby) {
      accName = ariaLabelledby.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim();
    }
    results.push({
      tag: el.tagName.toLowerCase(),
      visibleText: visibleText.substring(0,60),
      ariaLabel: ariaLabel.substring(0,60),
      ariaLabelledby,
      accName: accName.substring(0,60),
      mismatch: visibleText.length > 1 && accName && !accName.toLowerCase().includes(visibleText.toLowerCase()),
      type: el.getAttribute("type") || ""
    });
  });
  return results;
});

console.log(`Total interactive elements with aria-label/labelledby: ${debug.length}`);
const mismatches = debug.filter(d => d.mismatch);
console.log(`\nMISMATCHES (visible text not in accName): ${mismatches.length}`);
mismatches.slice(0,20).forEach(d => {
  console.log(`  [${d.tag}${d.type ? ' type='+d.type : ''}] visible="${d.visibleText}" | accName="${d.accName}"`);
  if (d.ariaLabelledby) console.log(`    aria-labelledby="${d.ariaLabelledby}"`);
});

console.log(`\nAll elements (first 15):`);
debug.slice(0,15).forEach(d => {
  console.log(`  [${d.tag}] v="${d.visibleText}" | acc="${d.accName}" | mismatch=${d.mismatch}`);
});

await browser.close();
