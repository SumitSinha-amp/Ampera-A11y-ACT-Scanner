import puppeteer, { Browser, Page } from "puppeteer";
import { execSync } from "child_process";
import { logger } from "./logger";

function getChromiumPath(): string | undefined {
  if (process.env["PUPPETEER_EXECUTABLE_PATH"]) {
    return process.env["PUPPETEER_EXECUTABLE_PATH"];
  }
  try {
    return execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null").toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface ScanIssue {
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  element: string | null;
  wcagCriteria: string | null;
  wcagLevel: string | null;
  selector: string | null;
  remediation: string | null;
}

export interface PageScanResult {
  url: string;
  issues: ScanIssue[];
  error?: string;
}

const WCAG_MAPPING: Record<string, { sc: string[]; level: string }> = {
  "SIA-R1":   { sc: ["2.4.2"], level: "A" },
  "SIA-R2":   { sc: ["1.1.1"], level: "A" },
  "SIA-R3":   { sc: ["4.1.1"], level: "A" },
  "SIA-R4":   { sc: ["3.1.1"], level: "A" },
  "SIA-R8":   { sc: ["1.3.1", "4.1.2"], level: "A" },
  "SIA-R9":   { sc: ["2.2.1"], level: "A" },
  "SIA-R10":  { sc: ["1.3.5"], level: "AA" },
  "SIA-R11":  { sc: ["2.4.4"], level: "A" },
  "SIA-R12":  { sc: ["4.1.2"], level: "A" },
  "SIA-R14":  { sc: ["2.5.3"], level: "A" },
  "SIA-R16":  { sc: ["4.1.2"], level: "A" },
  "SIA-R17":  { sc: ["4.1.2"], level: "A" },
  "SIA-R21":  { sc: ["4.1.2"], level: "A" },
  "SIA-R22":  { sc: ["1.2.2"], level: "A" },
  "SIA-R40":  { sc: ["1.3.1"], level: "A" },
  "SIA-R41":  { sc: ["2.4.4"], level: "AA" },
  "SIA-R42":  { sc: ["1.3.1"], level: "A" },
  "SIA-R43":  { sc: ["1.1.1"], level: "A" },
  "SIA-R44":  { sc: ["1.3.4"], level: "AA" },
  "SIA-R47":  { sc: ["1.4.4"], level: "AA" },
  "SIA-R48":  { sc: ["1.4.2"], level: "A" },
  "SIA-R58":  { sc: ["2.4.1"], level: "A" },
  "SIA-R59":  { sc: ["2.4.6"], level: "AA" },
  "SIA-R62":  { sc: ["1.4.1"], level: "A" },
  "SIA-R64":  { sc: ["2.4.6"], level: "AA" },
  "SIA-R65":  { sc: ["2.4.7"], level: "AA" },
  "SIA-R69":  { sc: ["1.4.3"], level: "AA" },
  "SIA-R74":  { sc: ["1.4.4"], level: "AA" },
  "SIA-R82":  { sc: ["3.3.1"], level: "A" },
  "SIA-R84":  { sc: ["2.1.1"], level: "A" },
  "SIA-R87":  { sc: ["2.4.1"], level: "A" },
  "SIA-R88":  { sc: ["1.4.3"], level: "AA" },
  "SIA-R91":  { sc: ["1.4.12"], level: "AA" },
  "SIA-R92":  { sc: ["1.4.12"], level: "AA" },
  "SIA-R93":  { sc: ["1.4.12"], level: "AA" },
  "SIA-R94":  { sc: ["4.1.2"], level: "A" },
  "SIA-R110": { sc: ["4.1.2"], level: "A" },
  "SIA-R114": { sc: ["2.4.2"], level: "A" },
  "SIA-R115": { sc: ["2.4.6"], level: "AA" },
  "SIA-R116": { sc: ["4.1.2"], level: "A" },
  "SIA-R117": { sc: ["1.1.1"], level: "A" },
  // Extended rules
  "SIA-R25":  { sc: ["2.5.3"], level: "A" },
  "SIA-R30":  { sc: ["1.4.6"], level: "AAA" },
  "SIA-R31":  { sc: ["1.4.8"], level: "AAA" },
  "SIA-R32":  { sc: ["2.5.5"], level: "AAA" },
  "SIA-R33":  { sc: ["1.3.1"], level: "A" },
  "SIA-R34":  { sc: ["1.3.1"], level: "A" },
  "SIA-R35":  { sc: ["2.4.1"], level: "A" },
  "SIA-R36":  { sc: ["4.1.2"], level: "A" },
};

const RULE_DESCRIPTIONS: Record<string, { description: string; remediation: string }> = {
  "SIA-R1":   { description: "Page is missing a title element", remediation: "Add a descriptive <title> element to the <head> of the document" },
  "SIA-R2":   { description: "Image is missing alt text", remediation: "Add an alt attribute to all img elements. Use empty alt='' for decorative images" },
  "SIA-R3":   { description: "Duplicate ID found", remediation: "Ensure all id attributes on the page are unique" },
  "SIA-R4":   { description: "HTML lang attribute is missing", remediation: "Add a lang attribute to the <html> element, e.g. lang='en'" },
  "SIA-R8":   { description: "Form field has no accessible name", remediation: "Associate a <label> element with each form field using for/id attributes or aria-label" },
  "SIA-R11":  { description: "Link has no accessible name", remediation: "Add descriptive text content, aria-label, or aria-labelledby to all links" },
  "SIA-R12":  { description: "Button has no accessible name", remediation: "Add descriptive text content or aria-label to all buttons" },
  "SIA-R14":  { description: "Visible label and accessible name do not match", remediation: "Ensure the accessible name of an interactive element contains the visible label text" },
  "SIA-R16":  { description: "Required ARIA attribute is missing", remediation: "Ensure all ARIA roles have their required states and properties" },
  "SIA-R21":  { description: "Invalid ARIA role", remediation: "Use only valid ARIA role values as defined in the ARIA specification" },
  "SIA-R22":  { description: "Video element may be missing captions", remediation: "Add a <track kind='captions'> element to all video elements" },
  "SIA-R40":  { description: "Data table is missing header cells", remediation: "Add <th> elements to table rows/columns or use scope attributes" },
  "SIA-R42":  { description: "List item is not inside a list element", remediation: "Ensure <li> elements are always inside <ul> or <ol> elements" },
  "SIA-R44":  { description: "Page may be restricting screen orientation", remediation: "Remove CSS that restricts screen orientation unless essential to functionality" },
  "SIA-R47":  { description: "Viewport zoom is disabled via meta tag", remediation: "Remove user-scalable=no or maximum-scale=1 from the viewport meta tag" },
  "SIA-R48":  { description: "Media element is autoplaying with audio", remediation: "Do not autoplay audio; provide user controls to start playback" },
  "SIA-R58":  { description: "Page may be missing a skip navigation link", remediation: "Add a skip-to-content link as the first focusable element" },
  "SIA-R65":  { description: "CSS may be removing focus indicators", remediation: "Ensure all focusable elements have a visible focus indicator; avoid outline: none without replacement" },
  "SIA-R69":  { description: "Text contrast ratio is below AA minimum (4.5:1 normal, 3:1 large)", remediation: "Ensure text has a contrast ratio of at least 4.5:1 (3:1 for large text) against its background" },
  "SIA-R87":  { description: "Page is missing landmark regions", remediation: "Add ARIA landmarks (main, nav, header, footer) or HTML5 sectioning elements to the page" },
  "SIA-R91":  { description: "Line height may be too low", remediation: "Set line-height to at least 1.5 times the font size" },
  "SIA-R92":  { description: "Letter spacing may be too low", remediation: "Ensure letter-spacing is at least 0.12 times the font size" },
  "SIA-R93":  { description: "Word spacing may be too low", remediation: "Ensure word-spacing is at least 0.16 times the font size" },
  "SIA-R114": { description: "Iframe is missing a title attribute", remediation: "Add a title attribute to all <iframe> elements describing their purpose" },
  "SIA-R116": { description: "Select element has no accessible name", remediation: "Add a <label> or aria-label to all <select> elements" },
  "SIA-R117": { description: "SVG is missing an accessible name", remediation: "Add a <title> or aria-label to meaningful SVG elements. Use aria-hidden for decorative SVGs" },
  // Extended
  "SIA-R25":  { description: "Visible label and accessible name do not match (Label in Name)", remediation: "Ensure the accessible name starts with or contains the visible label text verbatim" },
  "SIA-R30":  { description: "Text contrast ratio is below AAA enhanced minimum (7:1 normal, 4.5:1 large)", remediation: "Increase contrast ratio to at least 7:1 for normal text and 4.5:1 for large text" },
  "SIA-R31":  { description: "Line height is below minimum value (1.4.8 Visual Presentation)", remediation: "Set line-height to at least 1.5× the font-size for body text" },
  "SIA-R32":  { description: "Interactive element does not meet enhanced target size (2.5.5)", remediation: "Ensure interactive elements have a target size of at least 24×24 CSS pixels" },
  "SIA-R33":  { description: "Container element is empty", remediation: "Remove empty container elements or add meaningful content; empty elements confuse screen readers" },
  "SIA-R34":  { description: "Content missing after heading", remediation: "Ensure headings are followed by content; avoid using consecutive headings without intervening text" },
  "SIA-R35":  { description: "Text content is not included in an ARIA landmark", remediation: "Wrap all significant text content within a landmark region (main, nav, aside, footer, etc.)" },
  "SIA-R36":  { description: "ARIA attribute is unsupported or prohibited on this element", remediation: "Remove ARIA attributes that are not permitted on the element's role or native element type" },
};

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  logger.info("Launching browser for accessibility scanning");
  browserInstance = await puppeteer.launch({
    headless: true,
    executablePath: getChromiumPath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--allow-running-insecure-content",
      "--ignore-certificate-errors",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  browserInstance.on("disconnected", () => {
    logger.warn("Browser disconnected");
    browserInstance = null;
  });

  return browserInstance;
}

async function applyStealthMeasures(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return "Intel Inc.";
      if (parameter === 37446) return "Intel Iris OpenGL Engine";
      return getParameter.call(this, parameter);
    };
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  );

  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  });
}

/**
 * Scroll through the entire page to trigger lazy-loaded content, then wait
 * for the DOM to stabilise (no new nodes for 800ms or max 8s).
 */
async function fullyRenderPage(page: Page, timeout: number): Promise<void> {
  // Get total page height
  const totalHeight: number = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = 900;
  const scrollStep = Math.max(viewportHeight, 400);

  for (let scrolled = 0; scrolled < totalHeight; scrolled += scrollStep) {
    await page.evaluate((y: number) => window.scrollTo(0, y), scrolled);
    // Short pause between scroll steps so lazy loaders can fire
    await new Promise(r => setTimeout(r, 300));
  }

  // Scroll back to top so layout is representative of what a user sees
  await page.evaluate(() => window.scrollTo(0, 0));

  // Wait for DOM to stabilise: poll node count every 500ms until stable
  const stabiliseDeadline = Date.now() + Math.min(timeout * 0.4, 8000);
  let prevCount = -1;
  while (Date.now() < stabiliseDeadline) {
    const count: number = await page.evaluate(() => document.querySelectorAll("*").length);
    if (count === prevCount) break;
    prevCount = count;
    await new Promise(r => setTimeout(r, 500));
  }

  // Final pause to let any post-render JS finish
  await new Promise(r => setTimeout(r, 1000));
}

export async function scanPage(url: string, options: {
  timeout?: number;
  waitForNetworkIdle?: boolean;
  bypassCSP?: boolean;
} = {}): Promise<PageScanResult> {
  const { timeout = 60000, waitForNetworkIdle = true, bypassCSP = true } = options;

  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    if (bypassCSP) {
      await page.setBypassCSP(true);
    }

    await applyStealthMeasures(page);
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultNavigationTimeout(timeout);

    logger.info({ url }, "Navigating to page");
    await page.goto(url, {
      waitUntil: waitForNetworkIdle ? "networkidle2" : "domcontentloaded",
      timeout,
    });

    logger.info({ url }, "Scrolling page to trigger lazy-loaded content");
    await fullyRenderPage(page, timeout);

    logger.info({ url }, "Running SIA accessibility rules on fully-rendered DOM");
    const issues = await runSIARules(page);
    logger.info({ url, issueCount: issues.length }, "SIA rules completed");

    return { url, issues };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ url, error: msg }, "Failed to scan page");
    return { url, issues: [], error: msg };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

async function runSIARules(page: Page): Promise<ScanIssue[]> {
  const results = await page.evaluate(() => {
    const results: Array<{
      ruleId: string;
      impact: string;
      description: string;
      element: string | null;
      selector: string | null;
    }> = [];

    // ─── Helpers ────────────────────────────────────────────────────────────

    function getSelector(el: Element): string {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body) {
        let sel = current.tagName.toLowerCase();
        if (current.id) {
          sel += `#${CSS.escape(current.id)}`;
          parts.unshift(sel);
          break;
        }
        if (current.className && typeof current.className === "string") {
          const cls = current.className.trim().split(/\s+/).slice(0, 2).join(".");
          if (cls) sel += `.${cls}`;
        }
        parts.unshift(sel);
        current = current.parentElement;
      }
      return parts.join(" > ");
    }

    function outerHtmlSnippet(el: Element): string {
      const clone = el.cloneNode(false) as Element;
      return clone.outerHTML.substring(0, 200);
    }

    function isVisible(el: Element): boolean {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hasAttribute("hidden")) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    }

    function getAccessibleName(el: Element): string {
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        return labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim();
      }
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        if (el.id) {
          const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (label) return label.textContent?.trim() || "";
        }
        const parentLabel = el.closest("label");
        if (parentLabel) return parentLabel.textContent?.trim() || "";
        const placeholder = (el as HTMLInputElement).placeholder;
        if (placeholder) return placeholder;
      }
      if (el instanceof HTMLImageElement) return el.alt?.trim() || "";
      const title = el.getAttribute("title");
      if (title) return title.trim();
      return el.textContent?.trim() || "";
    }

    function getVisibleLabel(el: Element): string {
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        if (el.id) {
          const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (label) return label.textContent?.trim() || "";
        }
        const parentLabel = el.closest("label");
        if (parentLabel) {
          // Return label text minus the control's own text
          const clone = parentLabel.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("input,select,textarea").forEach(c => c.remove());
          return clone.textContent?.trim() || "";
        }
      }
      return el.textContent?.trim() || "";
    }

    function isInsideLandmark(el: Element): boolean {
      const landmarkRoles = ["main", "navigation", "complementary", "contentinfo", "banner", "search", "form", "region"];
      const landmarkTags = ["main", "nav", "aside", "footer", "header", "form", "section"];
      let node: Element | null = el.parentElement;
      while (node && node !== document.body) {
        const tag = node.tagName.toLowerCase();
        if (landmarkTags.includes(tag)) return true;
        const role = node.getAttribute("role");
        if (role && landmarkRoles.includes(role)) return true;
        node = node.parentElement;
      }
      return false;
    }

    function getLuminance(color: string): number | null {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      const rgb = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])].map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }

    function getEffectiveBackground(el: HTMLElement): string {
      let bgColor = window.getComputedStyle(el).backgroundColor;
      let parent: HTMLElement | null = el.parentElement as HTMLElement | null;
      while ((bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") && parent) {
        bgColor = window.getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement as HTMLElement | null;
      }
      if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") bgColor = "rgb(255,255,255)";
      return bgColor;
    }

    // ─── ARIA prohibited attributes lookup ──────────────────────────────────
    // Attributes prohibited on specific roles (subset of WAI-ARIA spec)
    const ARIA_PROHIBITED: Record<string, string[]> = {
      "presentation": ["aria-label", "aria-labelledby"],
      "none": ["aria-label", "aria-labelledby"],
      "caption": ["aria-label", "aria-labelledby"],
      "code": ["aria-label", "aria-labelledby"],
      "deletion": ["aria-label", "aria-labelledby"],
      "emphasis": ["aria-label", "aria-labelledby"],
      "generic": ["aria-label", "aria-labelledby"],
      "insertion": ["aria-label", "aria-labelledby"],
      "mark": ["aria-label", "aria-labelledby"],
      "paragraph": ["aria-label", "aria-labelledby"],
      "strong": ["aria-label", "aria-labelledby"],
      "subscript": ["aria-label", "aria-labelledby"],
      "superscript": ["aria-label", "aria-labelledby"],
      "time": ["aria-label", "aria-labelledby"],
    };
    // Native elements with prohibited ARIA attrs
    const NATIVE_PROHIBITED: Record<string, string[]> = {
      "input[type=hidden]": ["aria-*"],
      "meta": ["aria-*"],
      "html": ["aria-*"],
      "script": ["aria-*"],
      "style": ["aria-*"],
    };

    const ALL_ARIA_ATTRS = [
      "aria-activedescendant","aria-atomic","aria-autocomplete","aria-busy","aria-checked",
      "aria-colcount","aria-colindex","aria-colspan","aria-controls","aria-current",
      "aria-describedby","aria-description","aria-details","aria-disabled","aria-dropeffect",
      "aria-errormessage","aria-expanded","aria-flowto","aria-grabbed","aria-haspopup",
      "aria-hidden","aria-invalid","aria-keyshortcuts","aria-label","aria-labelledby",
      "aria-level","aria-live","aria-modal","aria-multiline","aria-multiselectable",
      "aria-orientation","aria-owns","aria-placeholder","aria-posinset","aria-pressed",
      "aria-readonly","aria-relevant","aria-required","aria-roledescription","aria-rowcount",
      "aria-rowindex","aria-rowspan","aria-selected","aria-setsize","aria-sort",
      "aria-valuemax","aria-valuemin","aria-valuenow","aria-valuetext"
    ];

    // ─── Rules ──────────────────────────────────────────────────────────────

    // SIA-R1: Page title
    if (!document.title || document.title.trim() === "") {
      results.push({ ruleId: "SIA-R1", impact: "serious", description: "Page is missing a title element", element: "<title>", selector: "head > title" });
    }

    // SIA-R4: HTML lang
    const htmlEl = document.documentElement;
    if (!htmlEl.getAttribute("lang") || htmlEl.getAttribute("lang")?.trim() === "") {
      results.push({ ruleId: "SIA-R4", impact: "serious", description: "HTML element is missing lang attribute", element: "<html>", selector: "html" });
    }

    // SIA-R3: Duplicate IDs
    const allIds = Array.from(document.querySelectorAll("[id]")).map(el => el.id);
    const seenIds = new Set<string>();
    const dupIds = new Set<string>();
    for (const id of allIds) {
      if (seenIds.has(id)) dupIds.add(id);
      seenIds.add(id);
    }
    for (const id of dupIds) {
      results.push({ ruleId: "SIA-R3", impact: "critical", description: `Duplicate ID: "${id}"`, element: `#${id}`, selector: `[id="${id}"]` });
    }

    // SIA-R2: Images without alt
    document.querySelectorAll("img").forEach(img => {
      if (!img.hasAttribute("alt") && isVisible(img)) {
        results.push({ ruleId: "SIA-R2", impact: "critical", description: "Image is missing alt attribute", element: outerHtmlSnippet(img), selector: getSelector(img) });
      }
    });

    // SIA-R117: SVG without accessible name
    document.querySelectorAll("svg").forEach(svg => {
      if (svg.getAttribute("aria-hidden") === "true") return;
      if (svg.closest('[aria-hidden="true"]')) return;
      if (!svg.getAttribute("aria-label") && !svg.getAttribute("aria-labelledby") && !svg.querySelector("title")) {
        // Only flag SVGs with meaningful size (not icon sprites)
        const rect = svg.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 20 && isVisible(svg)) {
          results.push({ ruleId: "SIA-R117", impact: "moderate", description: "SVG is missing an accessible name", element: outerHtmlSnippet(svg), selector: getSelector(svg) });
        }
      }
    });

    // SIA-R8: Form fields without labels
    document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']), textarea").forEach(el => {
      if (!isVisible(el)) return;
      if (!getAccessibleName(el)) {
        results.push({ ruleId: "SIA-R8", impact: "critical", description: "Form field has no accessible name", element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // SIA-R116: Select without accessible name
    document.querySelectorAll("select").forEach(sel => {
      if (!isVisible(sel)) return;
      if (!getAccessibleName(sel)) {
        results.push({ ruleId: "SIA-R116", impact: "serious", description: "Select element has no accessible name", element: outerHtmlSnippet(sel), selector: getSelector(sel) });
      }
    });

    // SIA-R14 / SIA-R25: Label in Name — visible label not in accessible name
    document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']), select, textarea, [role='textbox'], [role='combobox'], [role='listbox']").forEach(el => {
      if (!isVisible(el)) return;
      const visibleLabel = getVisibleLabel(el);
      if (!visibleLabel) return;
      const accName = getAccessibleName(el);
      if (!accName) return;
      // The accessible name must contain the visible label text (case-insensitive)
      if (!accName.toLowerCase().includes(visibleLabel.toLowerCase())) {
        results.push({ ruleId: "SIA-R14", impact: "moderate", description: `Visible label "${visibleLabel.substring(0, 60)}" is not included in accessible name "${accName.substring(0, 60)}"`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // Also check buttons and links for label-in-name
    document.querySelectorAll("a[href], button, [role='button'], [role='link']").forEach(el => {
      if (!isVisible(el)) return;
      const visibleText = el.textContent?.trim() || "";
      if (!visibleText) return;
      const ariaLabel = el.getAttribute("aria-label") || "";
      if (!ariaLabel) return;
      if (!ariaLabel.toLowerCase().includes(visibleText.toLowerCase())) {
        results.push({ ruleId: "SIA-R14", impact: "moderate", description: `Visible text "${visibleText.substring(0, 60)}" is not included in aria-label "${ariaLabel.substring(0, 60)}"`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // SIA-R11: Links without accessible names
    document.querySelectorAll("a[href]").forEach(link => {
      if (!isVisible(link)) return;
      const name = getAccessibleName(link);
      if (!name) {
        results.push({ ruleId: "SIA-R11", impact: "serious", description: "Link has no accessible name", element: outerHtmlSnippet(link), selector: getSelector(link) });
      }
    });

    // SIA-R12: Buttons without accessible names
    document.querySelectorAll("button, [role='button']").forEach(btn => {
      if (!isVisible(btn)) return;
      if (!getAccessibleName(btn)) {
        results.push({ ruleId: "SIA-R12", impact: "critical", description: "Button has no accessible name", element: outerHtmlSnippet(btn), selector: getSelector(btn) });
      }
    });

    // SIA-R32: Interactive element does not meet enhanced target size (2.5.5 AAA - 24×24px)
    let targetSizeFailCount = 0;
    document.querySelectorAll("a, button, [role='button'], [role='link'], input[type='checkbox'], input[type='radio'], select").forEach(el => {
      if (!isVisible(el)) return;
      if (targetSizeFailCount >= 20) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) {
        targetSizeFailCount++;
        results.push({ ruleId: "SIA-R32", impact: "minor", description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px, below the 24×24px enhanced target size`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // SIA-R33: Container element is empty
    const containerTags = ["div", "section", "article", "aside", "main", "header", "footer", "nav", "li", "td", "th", "p", "span"];
    let emptyContainerCount = 0;
    containerTags.forEach(tag => {
      if (emptyContainerCount >= 10) return;
      document.querySelectorAll(tag).forEach(el => {
        if (emptyContainerCount >= 10) return;
        if (!isVisible(el)) return;
        // Element is truly empty: no text content, no child elements with content
        const text = el.textContent?.trim() || "";
        const hasChildren = el.children.length > 0;
        if (!text && !hasChildren) {
          emptyContainerCount++;
          results.push({ ruleId: "SIA-R33", impact: "minor", description: `Empty <${tag}> container element`, element: outerHtmlSnippet(el), selector: getSelector(el) });
        }
      });
    });

    // SIA-R34: Content missing after heading (heading followed immediately by another heading)
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    headings.forEach((h, i) => {
      if (!isVisible(h)) return;
      const next = h.nextElementSibling;
      if (!next) return;
      const nextTag = next.tagName.toLowerCase();
      if (["h1","h2","h3","h4","h5","h6"].includes(nextTag)) {
        results.push({ ruleId: "SIA-R34", impact: "minor", description: `<${h.tagName.toLowerCase()}> heading "${(h.textContent || "").substring(0,60)}" is immediately followed by another heading with no content between`, element: outerHtmlSnippet(h), selector: getSelector(h) });
      }
    });

    // SIA-R35: Text content not inside a landmark
    // Check direct text nodes in body that are not inside any landmark
    let textOutsideLandmarkCount = 0;
    function checkTextNodes(node: Node): void {
      if (textOutsideLandmarkCount >= 15) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() || "";
        if (text.length < 20) return; // ignore short text fragments
        const parent = node.parentElement;
        if (!parent) return;
        if (!isVisible(parent)) return;
        if (!isInsideLandmark(parent)) {
          textOutsideLandmarkCount++;
          results.push({ ruleId: "SIA-R35", impact: "minor", description: `Text "${text.substring(0, 80)}" is not contained within a landmark region`, element: outerHtmlSnippet(parent), selector: getSelector(parent) });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName?.toLowerCase();
        // Don't descend into landmark elements (they're fine), scripts, styles
        if (["script","style","noscript","template"].includes(tag)) return;
        const role = el.getAttribute("role");
        const landmarkRoles = ["main","navigation","complementary","contentinfo","banner","search","form","region"];
        const landmarkTags = ["main","nav","aside","footer","header","form","section"];
        if (landmarkTags.includes(tag) || (role && landmarkRoles.includes(role))) return;
        node.childNodes.forEach(child => checkTextNodes(child));
      }
    }
    document.body.childNodes.forEach(child => checkTextNodes(child));

    // SIA-R36: ARIA attribute unsupported or prohibited
    document.querySelectorAll("[role]").forEach(el => {
      const roles = (el.getAttribute("role") || "").split(/\s+/);
      for (const role of roles) {
        const prohibited = ARIA_PROHIBITED[role] || [];
        for (const attr of prohibited) {
          if (el.hasAttribute(attr)) {
            results.push({ ruleId: "SIA-R36", impact: "moderate", description: `aria-attribute "${attr}" is prohibited on role="${role}"`, element: outerHtmlSnippet(el), selector: getSelector(el) });
          }
        }
      }
    });
    // Check for ARIA attributes on elements where aria is prohibited (e.g., input[type=hidden])
    document.querySelectorAll("input[type='hidden'], meta, html, script, style").forEach(el => {
      ALL_ARIA_ATTRS.forEach(attr => {
        if (el.hasAttribute(attr)) {
          results.push({ ruleId: "SIA-R36", impact: "moderate", description: `ARIA attribute "${attr}" is not permitted on <${el.tagName.toLowerCase()}>`, element: outerHtmlSnippet(el), selector: getSelector(el) });
        }
      });
    });

    // SIA-R42: List items outside lists
    document.querySelectorAll("li").forEach(li => {
      const parent = li.parentElement;
      if (parent && !["ul","ol","menu"].includes(parent.tagName.toLowerCase())) {
        results.push({ ruleId: "SIA-R42", impact: "moderate", description: "List item is not inside a list element", element: outerHtmlSnippet(li), selector: getSelector(li) });
      }
    });

    // SIA-R47: Viewport zoom disabled
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      const content = viewportMeta.getAttribute("content") || "";
      if (content.includes("user-scalable=no") || /maximum-scale\s*=\s*1(?![\d.])/.test(content)) {
        results.push({ ruleId: "SIA-R47", impact: "serious", description: "Viewport zoom is disabled via meta tag", element: outerHtmlSnippet(viewportMeta), selector: 'meta[name="viewport"]' });
      }
    }

    // SIA-R22: Video without captions
    document.querySelectorAll("video").forEach(video => {
      const hasCaptions = video.querySelector('track[kind="captions"], track[kind="subtitles"]');
      if (!hasCaptions) {
        results.push({ ruleId: "SIA-R22", impact: "serious", description: "Video element may be missing captions", element: outerHtmlSnippet(video), selector: getSelector(video) });
      }
    });

    // SIA-R48: Audio autoplay
    document.querySelectorAll("audio[autoplay], video[autoplay]").forEach(el => {
      if (!el.hasAttribute("muted")) {
        results.push({ ruleId: "SIA-R48", impact: "serious", description: "Media element is autoplaying with audio", element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // SIA-R40: Tables without headers
    document.querySelectorAll("table").forEach(table => {
      const headers = table.querySelectorAll("th");
      if (headers.length === 0 && !table.getAttribute("role")) {
        results.push({ ruleId: "SIA-R40", impact: "serious", description: "Data table is missing header cells", element: outerHtmlSnippet(table), selector: getSelector(table) });
      }
    });

    // SIA-R114: Iframes without title
    document.querySelectorAll("iframe").forEach(iframe => {
      if (!iframe.getAttribute("title")) {
        results.push({ ruleId: "SIA-R114", impact: "serious", description: "Iframe is missing a title attribute", element: outerHtmlSnippet(iframe), selector: getSelector(iframe) });
      }
    });

    // SIA-R21: Invalid ARIA roles
    const validRoles = ["alert","alertdialog","application","article","banner","button","cell","checkbox","columnheader","combobox","complementary","contentinfo","definition","dialog","directory","document","feed","figure","form","grid","gridcell","group","heading","img","link","list","listbox","listitem","log","main","marquee","math","menu","menubar","menuitem","menuitemcheckbox","menuitemradio","navigation","none","note","option","presentation","progressbar","radio","radiogroup","region","row","rowgroup","rowheader","scrollbar","search","searchbox","separator","slider","spinbutton","status","switch","tab","table","tablist","tabpanel","term","textbox","timer","toolbar","tooltip","tree","treegrid","treeitem"];
    document.querySelectorAll("[role]").forEach(el => {
      const roles = (el.getAttribute("role") || "").split(/\s+/);
      for (const role of roles) {
        if (role && !validRoles.includes(role)) {
          results.push({ ruleId: "SIA-R21", impact: "serious", description: `Invalid ARIA role: "${role}"`, element: outerHtmlSnippet(el), selector: getSelector(el) });
        }
      }
    });

    // SIA-R16: Missing required ARIA attrs
    const requiredAttrs: Record<string, string[]> = {
      checkbox: ["aria-checked"],
      combobox: ["aria-expanded"],
      slider: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
      spinbutton: ["aria-valuenow"],
      scrollbar: ["aria-valuenow", "aria-valuemin", "aria-valuemax", "aria-controls"],
    };
    for (const [role, attrs] of Object.entries(requiredAttrs)) {
      document.querySelectorAll(`[role="${role}"]`).forEach(el => {
        for (const attr of attrs) {
          if (!el.hasAttribute(attr)) {
            results.push({ ruleId: "SIA-R16", impact: "serious", description: `Element with role="${role}" is missing required attribute: ${attr}`, element: outerHtmlSnippet(el), selector: getSelector(el) });
          }
        }
      });
    }

    // SIA-R87: Landmark regions
    const hasMain = document.querySelector("main, [role='main']");
    if (!hasMain) {
      results.push({ ruleId: "SIA-R87", impact: "moderate", description: "Page is missing a <main> landmark region", element: "<body>", selector: "body" });
    }
    const hasNav = document.querySelector("nav, [role='navigation']");
    if (!hasNav && document.querySelectorAll("a[href]").length > 3) {
      results.push({ ruleId: "SIA-R87", impact: "minor", description: "Page is missing a <nav> landmark region", element: "<body>", selector: "body" });
    }

    // SIA-R58: Skip to content link
    const firstLink = document.querySelector("a");
    if (firstLink) {
      const href = firstLink.getAttribute("href") || "";
      if (!href.startsWith("#")) {
        results.push({ ruleId: "SIA-R58", impact: "moderate", description: "Page may be missing a skip navigation link (first link should target an anchor)", element: outerHtmlSnippet(firstLink), selector: getSelector(firstLink) });
      }
    }

    // SIA-R65: Focus visible — check for outline:none without replacement
    let hasFocusHidden = false;
    try {
      Array.from(document.styleSheets).forEach(sheet => {
        try {
          Array.from(sheet.cssRules || []).forEach(rule => {
            const text = rule.cssText || "";
            if ((text.includes(":focus") || text.includes(":focus-visible")) &&
               (text.includes("outline: none") || text.includes("outline:none") || text.includes("outline: 0") || text.includes("outline:0"))) {
              hasFocusHidden = true;
            }
          });
        } catch { /* cross-origin */ }
      });
    } catch { /* ignore */ }
    if (hasFocusHidden) {
      results.push({ ruleId: "SIA-R65", impact: "serious", description: "CSS removes focus outline without providing a visible replacement focus indicator", element: null, selector: null });
    }

    // SIA-R69: AA Contrast (4.5:1 normal / 3:1 large text)
    // SIA-R30: AAA Enhanced Contrast (7:1 normal / 4.5:1 large text)
    let contrastAAFails = 0;
    let contrastAAAFails = 0;
    const textEls = Array.from(document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, span, a, button, label, li, td, th, div")).slice(0, 200);
    for (const el of textEls) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisible(el)) continue;
      const text = el.textContent?.trim();
      if (!text || text.length < 2) continue;
      // Skip elements that are mostly container elements with block children
      const blockChildren = Array.from(el.children).filter(c => {
        const cs = window.getComputedStyle(c as HTMLElement).display;
        return cs === "block" || cs === "flex" || cs === "grid";
      });
      if (blockChildren.length > 0 && el.tagName.toLowerCase() === "div") continue;

      const style = window.getComputedStyle(el);
      const color = style.color;
      const bgColor = getEffectiveBackground(el);
      const l1 = getLuminance(color);
      const l2 = getLuminance(bgColor);
      if (l1 === null || l2 === null) continue;
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      const ratio = (lighter + 0.05) / (darker + 0.05);
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseFloat(style.fontWeight);
      const isLarge = fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700);

      const aaMin = isLarge ? 3 : 4.5;
      const aaaMin = isLarge ? 4.5 : 7;

      if (ratio < aaMin && contrastAAFails < 10) {
        contrastAAFails++;
        results.push({ ruleId: "SIA-R69", impact: "serious", description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AA minimum (${aaMin}:1)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      } else if (ratio < aaaMin && ratio >= aaMin && contrastAAAFails < 15) {
        contrastAAAFails++;
        results.push({ ruleId: "SIA-R30", impact: "minor", description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AAA enhanced minimum (${aaaMin}:1)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    }

    // SIA-R91 / SIA-R31: Line height (1.4.12 AA / 1.4.8 AAA)
    let lineHeightAAFails = 0;
    let lineHeightAAAFails = 0;
    const bodyTextEls = Array.from(document.querySelectorAll("p, li, td, th, blockquote, article, section > div")).slice(0, 100);
    for (const el of bodyTextEls) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisible(el)) continue;
      const text = el.textContent?.trim() || "";
      if (text.length < 10) continue;
      const style = window.getComputedStyle(el);
      const lineHeight = parseFloat(style.lineHeight);
      const fontSize = parseFloat(style.fontSize);
      if (isNaN(lineHeight) || isNaN(fontSize) || fontSize === 0) continue;
      const ratio = lineHeight / fontSize;
      // AA (1.4.12): 1.5x; AAA (1.4.8): stricter but 1.5x is the WCAG floor
      if (ratio < 1.5 && lineHeightAAFails < 5) {
        lineHeightAAFails++;
        results.push({ ruleId: "SIA-R31", impact: "moderate", description: `Line height ${ratio.toFixed(2)}× is below the minimum 1.5× (font-size: ${Math.round(fontSize)}px)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    }

    return results;
  });

  const issues: ScanIssue[] = [];
  for (const r of results) {
    const wcag = WCAG_MAPPING[r.ruleId];
    const desc = RULE_DESCRIPTIONS[r.ruleId];
    issues.push({
      ruleId: r.ruleId,
      impact: r.impact as ScanIssue["impact"],
      description: desc?.description ? `${desc.description}: ${r.description}` : r.description,
      element: r.element,
      wcagCriteria: wcag ? wcag.sc.join(", ") : null,
      wcagLevel: wcag ? wcag.level : null,
      selector: r.selector,
      remediation: desc?.remediation || null,
    });
  }

  return issues;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
