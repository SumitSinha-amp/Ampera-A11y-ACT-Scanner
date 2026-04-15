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
  "SIA-R1": { sc: ["2.4.2"], level: "A" },
  "SIA-R2": { sc: ["1.1.1"], level: "A" },
  "SIA-R3": { sc: ["4.1.1"], level: "A" },
  "SIA-R4": { sc: ["3.1.1"], level: "A" },
  "SIA-R5": { sc: ["3.1.1"], level: "A" },
  "SIA-R8": { sc: ["1.3.1", "4.1.2"], level: "A" },
  "SIA-R9": { sc: ["2.2.1"], level: "A" },
  "SIA-R10": { sc: ["1.3.5"], level: "AA" },
  "SIA-R11": { sc: ["2.4.4"], level: "A" },
  "SIA-R12": { sc: ["4.1.2"], level: "A" },
  "SIA-R14": { sc: ["2.5.3"], level: "A" },
  "SIA-R15": { sc: ["2.4.4"], level: "A" },
  "SIA-R16": { sc: ["4.1.2"], level: "A" },
  "SIA-R17": { sc: ["4.1.2"], level: "A" },
  "SIA-R21": { sc: ["4.1.2"], level: "A" },
  "SIA-R22": { sc: ["1.2.2"], level: "A" },
  "SIA-R40": { sc: ["1.3.1"], level: "A" },
  "SIA-R41": { sc: ["2.4.4"], level: "AA" },
  "SIA-R42": { sc: ["1.3.1"], level: "A" },
  "SIA-R43": { sc: ["1.1.1"], level: "A" },
  "SIA-R44": { sc: ["1.3.4"], level: "AA" },
  "SIA-R47": { sc: ["1.4.4"], level: "AA" },
  "SIA-R48": { sc: ["1.4.2"], level: "A" },
  "SIA-R58": { sc: ["2.4.1"], level: "A" },
  "SIA-R59": { sc: ["2.4.6"], level: "AA" },
  "SIA-R62": { sc: ["1.4.1"], level: "A" },
  "SIA-R64": { sc: ["2.4.6"], level: "AA" },
  "SIA-R65": { sc: ["2.4.7"], level: "AA" },
  "SIA-R69": { sc: ["1.4.3"], level: "AA" },
  "SIA-R74": { sc: ["1.4.4"], level: "AA" },
  "SIA-R82": { sc: ["3.3.1"], level: "A" },
  "SIA-R84": { sc: ["2.1.1"], level: "A" },
  "SIA-R87": { sc: ["2.4.1"], level: "A" },
  "SIA-R88": { sc: ["1.4.3"], level: "AA" },
  "SIA-R91": { sc: ["1.4.12"], level: "AA" },
  "SIA-R92": { sc: ["1.4.12"], level: "AA" },
  "SIA-R93": { sc: ["1.4.12"], level: "AA" },
  "SIA-R94": { sc: ["4.1.2"], level: "A" },
  "SIA-R110": { sc: ["4.1.2"], level: "A" },
  "SIA-R114": { sc: ["2.4.2"], level: "A" },
  "SIA-R115": { sc: ["2.4.6"], level: "AA" },
  "SIA-R116": { sc: ["4.1.2"], level: "A" },
  "SIA-R117": { sc: ["1.1.1"], level: "A" },
};

const RULE_DESCRIPTIONS: Record<string, { description: string; remediation: string }> = {
  "SIA-R1": { description: "Page is missing a title element", remediation: "Add a descriptive <title> element to the <head> of the document" },
  "SIA-R2": { description: "Image is missing alt text", remediation: "Add an alt attribute to all img elements. Use empty alt='' for decorative images" },
  "SIA-R3": { description: "Duplicate ID found", remediation: "Ensure all id attributes on the page are unique" },
  "SIA-R4": { description: "HTML lang attribute is missing", remediation: "Add a lang attribute to the <html> element, e.g. lang='en'" },
  "SIA-R8": { description: "Form field has no accessible name", remediation: "Associate a <label> element with each form field using for/id attributes or aria-label" },
  "SIA-R11": { description: "Link has no accessible name", remediation: "Add descriptive text content, aria-label, or aria-labelledby to all links" },
  "SIA-R12": { description: "Button has no accessible name", remediation: "Add descriptive text content or aria-label to all buttons" },
  "SIA-R16": { description: "Required ARIA attribute is missing", remediation: "Ensure all ARIA roles have their required states and properties" },
  "SIA-R21": { description: "Invalid ARIA role", remediation: "Use only valid ARIA role values as defined in the ARIA specification" },
  "SIA-R22": { description: "Video element may be missing captions", remediation: "Add a <track kind='captions'> element to all video elements" },
  "SIA-R40": { description: "Table is missing headers", remediation: "Add <th> elements to table rows/columns or use scope attributes" },
  "SIA-R42": { description: "List item is outside a list", remediation: "Ensure <li> elements are always inside <ul> or <ol> elements" },
  "SIA-R44": { description: "Orientation may be locked to portrait or landscape", remediation: "Remove CSS that restricts screen orientation unless essential to functionality" },
  "SIA-R47": { description: "Viewport zoom may be disabled", remediation: "Remove user-scalable=no or maximum-scale=1 from the viewport meta tag" },
  "SIA-R48": { description: "Audio may be autoplaying", remediation: "Do not autoplay audio; provide user controls to start playback" },
  "SIA-R58": { description: "Page may be missing skip navigation link", remediation: "Add a skip-to-content link as the first focusable element" },
  "SIA-R62": { description: "Color alone may be used to convey information", remediation: "Use additional cues (text, icons, patterns) alongside color to convey information" },
  "SIA-R65": { description: "Focus indicator may not be visible", remediation: "Ensure all focusable elements have a visible focus indicator" },
  "SIA-R69": { description: "Text contrast may be insufficient", remediation: "Ensure text has a contrast ratio of at least 4.5:1 (3:1 for large text) against its background" },
  "SIA-R82": { description: "Form error messages may not be associated with inputs", remediation: "Use aria-describedby or aria-errormessage to associate error messages with form fields" },
  "SIA-R84": { description: "Interactive elements may not be keyboard accessible", remediation: "Ensure all interactive elements can be accessed and operated using keyboard only" },
  "SIA-R87": { description: "Page may be missing landmark regions", remediation: "Add ARIA landmarks (main, nav, header, footer) or HTML5 sectioning elements to the page" },
  "SIA-R91": { description: "Line height may be too low", remediation: "Set line-height to at least 1.5 times the font size" },
  "SIA-R92": { description: "Letter spacing may be too low", remediation: "Ensure letter-spacing is at least 0.12 times the font size" },
  "SIA-R93": { description: "Word spacing may be too low", remediation: "Ensure word-spacing is at least 0.16 times the font size" },
  "SIA-R114": { description: "Iframe may be missing title", remediation: "Add a title attribute to all <iframe> elements describing their purpose" },
  "SIA-R116": { description: "Select element may be missing accessible name", remediation: "Add a <label> or aria-label to all <select> elements" },
  "SIA-R117": { description: "SVG may be missing accessible name", remediation: "Add a <title> or aria-label to meaningful SVG elements. Use aria-hidden for decorative SVGs" },
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

export async function scanPage(url: string, options: {
  timeout?: number;
  waitForNetworkIdle?: boolean;
  bypassCSP?: boolean;
} = {}): Promise<PageScanResult> {
  const { timeout = 30000, waitForNetworkIdle = true, bypassCSP = true } = options;

  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    if (bypassCSP) {
      await page.setBypassCSP(true);
    }

    await applyStealthMeasures(page);
    await page.setViewport({ width: 1280, height: 900 });

    page.setDefaultNavigationTimeout(timeout);

    await page.goto(url, {
      waitUntil: waitForNetworkIdle ? "networkidle2" : "domcontentloaded",
      timeout,
    });

    await new Promise(r => setTimeout(r, 1000));

    const issues = await runSIARules(page);

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
  const issues: ScanIssue[] = [];

  const results = await page.evaluate(() => {
    const results: Array<{
      ruleId: string;
      impact: string;
      description: string;
      element: string | null;
      selector: string | null;
    }> = [];

    function getSelector(el: Element): string {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
          selector += `#${current.id}`;
          parts.unshift(selector);
          break;
        }
        if (current.className && typeof current.className === "string") {
          const cls = current.className.trim().split(/\s+/).slice(0, 2).join(".");
          if (cls) selector += `.${cls}`;
        }
        parts.unshift(selector);
        current = current.parentElement;
      }
      return parts.join(" > ");
    }

    function outerHtmlSnippet(el: Element): string {
      const clone = el.cloneNode(false) as Element;
      return clone.outerHTML.substring(0, 150);
    }

    function isVisible(el: Element): boolean {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hasAttribute("hidden")) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
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
          const label = document.querySelector(`label[for="${el.id}"]`);
          if (label) return label.textContent?.trim() || "";
        }
        const parentLabel = el.closest("label");
        if (parentLabel) return parentLabel.textContent?.trim() || "";
      }
      if (el instanceof HTMLImageElement) return el.alt?.trim() || "";
      const title = el.getAttribute("title");
      if (title) return title.trim();
      return el.textContent?.trim() || "";
    }

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
      results.push({ ruleId: "SIA-R3", impact: "critical", description: `Duplicate ID: "${id}"`, element: `#${id}`, selector: `#${id}` });
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
      if (!svg.getAttribute("aria-label") && !svg.getAttribute("aria-labelledby") && !svg.querySelector("title")) {
        if (isVisible(svg)) {
          results.push({ ruleId: "SIA-R117", impact: "moderate", description: "SVG is missing an accessible name", element: outerHtmlSnippet(svg), selector: getSelector(svg) });
        }
      }
    });

    // SIA-R8: Form fields without labels
    document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']), select, textarea").forEach(el => {
      if (!isVisible(el)) return;
      if (!getAccessibleName(el)) {
        results.push({ ruleId: "SIA-R8", impact: "critical", description: "Form field has no accessible name", element: outerHtmlSnippet(el), selector: getSelector(el) });
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

    // SIA-R42: List items outside lists
    document.querySelectorAll("li").forEach(li => {
      const parent = li.parentElement;
      if (parent && parent.tagName.toLowerCase() !== "ul" && parent.tagName.toLowerCase() !== "ol" && parent.tagName.toLowerCase() !== "menu") {
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
    const hasNav = document.querySelector("nav, [role='navigation']");
    if (!hasMain) {
      results.push({ ruleId: "SIA-R87", impact: "moderate", description: "Page is missing a main landmark region", element: "<body>", selector: "body" });
    }
    if (!hasNav && document.querySelectorAll("a[href]").length > 3) {
      results.push({ ruleId: "SIA-R87", impact: "minor", description: "Page is missing a navigation landmark", element: "<body>", selector: "body" });
    }

    // SIA-R58: Skip to content link
    const firstLink = document.querySelector("a");
    if (firstLink) {
      const href = firstLink.getAttribute("href") || "";
      if (!href.startsWith("#")) {
        results.push({ ruleId: "SIA-R58", impact: "moderate", description: "Page may be missing a skip navigation link", element: "<body>", selector: "body" });
      }
    }

    // SIA-R44: Orientation lock
    const styleSheets = Array.from(document.styleSheets);
    let hasOrientationLock = false;
    try {
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSMediaRule) {
              const condText = rule.conditionText || rule.media?.mediaText || "";
              if (condText.includes("orientation") && (condText.includes("landscape") || condText.includes("portrait"))) {
                const cssText = Array.from(rule.cssRules).map(r => r.cssText).join(" ");
                if (cssText.includes("display:none") || cssText.includes("display: none") || cssText.includes("visibility:hidden")) {
                  hasOrientationLock = true;
                }
              }
            }
          }
        } catch { /* cross-origin */ }
      }
    } catch { /* ignore */ }
    if (hasOrientationLock) {
      results.push({ ruleId: "SIA-R44", impact: "serious", description: "Page may be restricting screen orientation", element: null, selector: null });
    }

    // SIA-R116: Select without label
    document.querySelectorAll("select").forEach(sel => {
      if (!isVisible(sel)) return;
      if (!getAccessibleName(sel)) {
        results.push({ ruleId: "SIA-R116", impact: "serious", description: "Select element has no accessible name", element: outerHtmlSnippet(sel), selector: getSelector(sel) });
      }
    });

    // SIA-R65: Focus visible (check basic focus styles)
    // We check if there are any :focus styles that might hide outline
    let hasFocusHidden = false;
    try {
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            const text = rule.cssText || "";
            if ((text.includes(":focus") || text.includes(":focus-visible")) && text.includes("outline: none") || text.includes("outline:none")) {
              hasFocusHidden = true;
            }
          }
        } catch { /* cross-origin */ }
      }
    } catch { /* ignore */ }
    if (hasFocusHidden) {
      results.push({ ruleId: "SIA-R65", impact: "serious", description: "CSS may be removing focus indicators with outline: none", element: null, selector: null });
    }

    // SIA-R69: Contrast check (sample visible text elements)
    function getLuminance(color: string): number | null {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      const rgb = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])].map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }

    let contrastFails = 0;
    const textEls = Array.from(document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, span, a, button, label, li, td, th")).slice(0, 100);
    for (const el of textEls) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisible(el)) continue;
      const text = el.textContent?.trim();
      if (!text) continue;
      const style = window.getComputedStyle(el);
      const color = style.color;
      let bgColor = style.backgroundColor;
      let parent = el.parentElement;
      while ((bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") && parent) {
        bgColor = window.getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement;
      }
      if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") bgColor = "rgb(255,255,255)";
      const l1 = getLuminance(color);
      const l2 = getLuminance(bgColor);
      if (l1 === null || l2 === null) continue;
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      const ratio = (lighter + 0.05) / (darker + 0.05);
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseFloat(style.fontWeight);
      const isLarge = fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700);
      const minRatio = isLarge ? 3 : 4.5;
      if (ratio < minRatio) {
        contrastFails++;
        if (contrastFails <= 5) {
          results.push({ ruleId: "SIA-R69", impact: "serious", description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below minimum ${minRatio}:1`, element: outerHtmlSnippet(el), selector: getSelector(el) });
        }
      }
    }

    return results;
  });

  for (const r of results) {
    const wcag = WCAG_MAPPING[r.ruleId];
    const desc = RULE_DESCRIPTIONS[r.ruleId];
    issues.push({
      ruleId: r.ruleId,
      impact: r.impact as ScanIssue["impact"],
      description: desc?.description || r.description,
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
