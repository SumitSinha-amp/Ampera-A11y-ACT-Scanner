import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { execSync } from "child_process";
import { mkdirSync, rmSync, existsSync } from "fs";
import path from "path";
import { logger } from "./logger";

puppeteerExtra.use(StealthPlugin());

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
  "SIA-R9":   { sc: ["2.4.6"], level: "AA" },
  "SIA-R11":  { sc: ["2.4.4"], level: "A" },
  "SIA-R12":  { sc: ["4.1.2"], level: "A" },
  "SIA-R13":  { sc: ["3.2.2"], level: "A" },
  "SIA-R14":  { sc: ["2.5.3"], level: "A" },
  "SIA-R16":  { sc: ["4.1.2"], level: "A" },
  "SIA-R17":  { sc: ["1.2.1"], level: "A" },
  "SIA-R21":  { sc: ["4.1.2"], level: "A" },
  "SIA-R22":  { sc: ["1.2.2"], level: "A" },
  "SIA-R23":  { sc: ["1.2.5"], level: "AA" },
  "SIA-R25":  { sc: ["2.5.3"], level: "A" },
  "SIA-R26":  { sc: ["3.1.4"], level: "AAA" },
  "SIA-R30":  { sc: ["1.4.6"], level: "AAA" },
  "SIA-R31":  { sc: ["1.4.8"], level: "AAA" },
  "SIA-R32":  { sc: ["2.5.5"], level: "AAA" },
  "SIA-R34":  { sc: ["1.3.1"], level: "A" },
  "SIA-R35":  { sc: ["1.3.6"], level: "AAA" },
  "SIA-R36":  { sc: ["4.1.2"], level: "A" },
  "SIA-R40":  { sc: ["1.3.1"], level: "A" },
  "SIA-R41":  { sc: ["1.3.1"], level: "A" },
  "SIA-R42":  { sc: ["1.3.1"], level: "A" },
  "SIA-R44":  { sc: ["1.3.4"], level: "AA" },
  "SIA-R45":  { sc: ["1.3.5"], level: "AA" },
  "SIA-R46":  { sc: ["2.5.8"], level: "AA" },
  "SIA-R47":  { sc: ["1.4.4"], level: "AA" },
  "SIA-R48":  { sc: ["1.4.2"], level: "A" },
  "SIA-R54":  { sc: ["4.1.3"], level: "AA" },
  "SIA-R57":  { sc: ["1.4.11"], level: "AA" },
  "SIA-R58":  { sc: ["2.4.1"], level: "A" },
    "SIA-R84":  { sc: ["2.1.1"], level: "A" },
  "SIA-R59":  { sc: ["2.4.4"], level: "A" },
  "SIA-R62":  { sc: ["2.4.10"], level: "AAA" },
  "SIA-R64":  { sc: ["2.4.6"], level: "AA" },
  "SIA-R65":  { sc: ["2.4.7"], level: "AA" },
  "SIA-R66":  { sc: ["3.3.1"], level: "A" },
  "SIA-R67":  { sc: ["3.3.2"], level: "A" },
  "SIA-R68":  { sc: ["1.4.4"], level: "AA" },
  "SIA-R69":  { sc: ["1.4.3"], level: "AA" },
  "SIA-R75":  { sc: ["1.4.5"], level: "AA" },
  "SIA-R87":  { sc: ["2.4.1"], level: "A" },
  "SIA-R88":  { sc: ["1.4.12"], level: "AA" },
  "SIA-R91":  { sc: ["1.4.12"], level: "AA" },
  "SIA-R92":  { sc: ["1.4.12"], level: "AA" },
  "SIA-R93":  { sc: ["1.4.12"], level: "AA" },
  "SIA-R94":  { sc: ["1.4.12"], level: "AA" },
  "SIA-R95":  { sc: ["2.3.3"], level: "AAA" },
  "SIA-R96":  { sc: ["1.3.1"], level: "A" },
  "SIA-R97":  { sc: ["1.3.1"], level: "A" },
  "SIA-R98":  { sc: ["4.1.2"], level: "A" },
  "SIA-R99":  { sc: ["4.1.2"], level: "A" },
  "SIA-R100": { sc: ["1.1.1"], level: "A" },
  "SIA-R104": { sc: ["2.2.1"], level: "A" },
  "SIA-R105": { sc: ["2.4.4"], level: "A" },
  "SIA-R107": { sc: ["2.1.1"], level: "A" },
  "SIA-R112": { sc: ["1.3.1"], level: "A" },
  "SIA-R113": { sc: ["4.1.2"], level: "A" },
  "SIA-R114": { sc: ["2.4.2"], level: "A" },
  "SIA-R115": { sc: ["1.1.1"], level: "A" },
  "SIA-R116": { sc: ["4.1.2"], level: "A" },
  "SIA-R117": { sc: ["1.1.1"], level: "A" },
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
  "SIA-R84":  { description: "Scrollable elements are not keyboard accessible", remediation: "Ensure scrollable containers can receive keyboard focus and can be scrolled with the keyboard, for example by adding tabindex='0' when appropriate" },
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
  "SIA-R34":  { description: "Content missing after heading", remediation: "Ensure headings are followed by content; avoid using consecutive headings without intervening text" },
  "SIA-R35":  { description: "Text content is not included in an ARIA landmark", remediation: "Wrap all significant text content within a landmark region (main, nav, aside, footer, etc.)" },
  "SIA-R64":  { description: "Headings are not structured — heading level is skipped", remediation: "Ensure headings follow a sequential hierarchy without skipping levels (e.g. h1 → h2 → h3); do not jump from h1 to h3" },
  "SIA-R36":  { description: "ARIA attribute is unsupported or prohibited on this element", remediation: "Remove ARIA attributes that are not permitted on the element's role or native element type" },
  "SIA-R68":  { description: "Text may be clipped when resized (1.4.4 Resize Text)", remediation: "Avoid fixed heights on text containers with overflow:hidden; use min-height or allow overflow:visible" },
  // New rules
  "SIA-R9":   { description: "Empty heading element", remediation: "Add descriptive text inside heading elements; do not use empty headings for spacing" },
  "SIA-R13":  { description: "Link opens in new window or tab without warning", remediation: "Add visible text or an sr-only span indicating the link opens in a new window (e.g. '(opens in new tab)')" },
  "SIA-R17":  { description: "Audio/video element may be missing a text transcript", remediation: "Provide a text transcript adjacent to or linked from each audio or video element" },
  "SIA-R23":  { description: "Video element may be missing an audio description track", remediation: "Add a <track kind='descriptions'> element or provide a separate described version of the video" },
  "SIA-R26":  { description: "Abbreviation has no expansion", remediation: "Wrap abbreviations in <abbr title='Full Form'> or provide an expansion on first use" },
  "SIA-R41":  { description: "Table is missing a caption or summary", remediation: "Add a <caption> element as the first child of the table to describe its purpose" },
  "SIA-R45":  { description: "Input field is missing autocomplete attribute", remediation: "Add autocomplete attributes to inputs collecting personal data (name, email, phone, address, etc.)" },
  "SIA-R46":  { description: "Interactive element may be too small for touch targets", remediation: "Ensure all interactive elements have a minimum size of 24×24 CSS pixels or have sufficient spacing" },
  "SIA-R54":  { description: "Dynamic status message is not announced to screen readers", remediation: "Use aria-live='polite' or role='status' on containers that receive dynamic status messages" },
  "SIA-R57":  { description: "UI component or graphical object may have insufficient contrast", remediation: "Ensure non-text UI components (icons, borders, focus indicators) have at least 3:1 contrast against adjacent colors" },
  "SIA-R59":  { description: "Link text is ambiguous or non-descriptive", remediation: "Replace generic link text ('click here', 'read more', 'here') with descriptive text that explains the link destination" },
  "SIA-R62":  { description: "Content section is missing a heading", remediation: "Add a heading element to introduce each major section of content; use aria-labelledby on landmarks" },
  "SIA-R66":  { description: "Form error message is not programmatically associated with its field", remediation: "Use aria-describedby to link error messages to their form fields, or use aria-invalid='true' on invalid inputs" },
  "SIA-R67":  { description: "Form field is missing a label or instruction", remediation: "Add a <label>, aria-label, or aria-labelledby to every form control" },
  "SIA-R75":  { description: "Image of text — image likely contains text that should be real HTML text", remediation: "Replace images of text with real text styled with CSS; only use images of text for logos and brand names" },
  "SIA-R88":  { description: "Word spacing may be too low for text readability", remediation: "Ensure word-spacing is at least 0.16em and that layout does not break at this value" },
  "SIA-R95":  { description: "Animation or motion not respecting prefers-reduced-motion", remediation: "Wrap CSS animations in @media (prefers-reduced-motion: no-preference) or disable them for reduce-motion users" },
  "SIA-R96":  { description: "Table header cell is missing a scope attribute", remediation: "Add scope='col' or scope='row' to all <th> elements to explicitly associate them with data cells" },
  "SIA-R97":  { description: "Fieldset is missing a legend element", remediation: "Add a <legend> as the first child of every <fieldset> to describe the group of form controls" },
  "SIA-R98":  { description: "Expandable element is missing aria-expanded state", remediation: "Add aria-expanded='true'/'false' to toggle controls (accordions, dropdowns, disclosure buttons)" },
  "SIA-R99":  { description: "Focusable element is hidden from assistive technology with aria-hidden", remediation: "Remove aria-hidden='true' from elements that can receive keyboard focus, or make them non-focusable" },
  "SIA-R100": { description: "Link to a PDF without an accessible alternative", remediation: "Provide an accessible HTML alternative alongside the PDF download link" },
  "SIA-R104": { description: "Page uses meta refresh to redirect or reload", remediation: "Remove <meta http-equiv='refresh'>; use server-side redirects or notify users before any page refresh" },
  "SIA-R105": { description: "Multiple links with identical text point to different destinations", remediation: "Make link text unique, or add aria-label to distinguish links with the same visible text" },
  "SIA-R107": { description: "Custom interactive element is not keyboard accessible", remediation: "Add tabindex='0', role, and keyboard event handlers (keydown Enter/Space) to custom interactive elements" },
  "SIA-R112": { description: "Figure element is missing a figcaption", remediation: "Add a <figcaption> inside <figure> to provide a visible caption for images and other embedded content" },
  "SIA-R113": { description: "Details element summary has no accessible name", remediation: "Add descriptive text inside <summary> so screen readers can announce the disclosure widget" },
  "SIA-R115": { description: "Object element is missing an accessible name", remediation: "Add a title attribute or aria-label to <object> elements, and provide fallback text content inside" },
};

// Persistent profile dir — preserves Cloudflare clearance cookies across restarts
const CHROME_PROFILE_DIR = path.join(process.cwd(), ".chrome-profile");
try { mkdirSync(CHROME_PROFILE_DIR, { recursive: true }); } catch { /* already exists */ }

/** Remove stale Chrome singleton lock files that prevent profile re-use */
function clearChromeLocks(): void {
  const lockFiles = [
    path.join(CHROME_PROFILE_DIR, "SingletonLock"),
    path.join(CHROME_PROFILE_DIR, "SingletonCookie"),
    path.join(CHROME_PROFILE_DIR, "SingletonSocket"),
  ];
  for (const f of lockFiles) {
    if (existsSync(f)) {
      try {
        rmSync(f, { force: true });
        logger.info({ file: f }, "Removed stale Chrome lock file");
      } catch (e) {
        logger.warn({ file: f, err: e }, "Could not remove Chrome lock file");
      }
    }
  }
}

const PUPPETEER_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--window-size=1440,900",
  "--lang=en-US,en;q=0.9",
  "--disable-blink-features=AutomationControlled",
];

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  // Clear any stale lock files left by a crashed previous process
  clearChromeLocks();

  logger.info({ profileDir: CHROME_PROFILE_DIR }, "Launching browser for accessibility scanning");

  const launchOptions = {
    headless: true as const,
    executablePath: getChromiumPath(),
    userDataDir: CHROME_PROFILE_DIR,
    args: PUPPETEER_LAUNCH_ARGS,
  };

  try {
    browserInstance = await puppeteerExtra.launch(launchOptions);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("SingletonLock") || msg.includes("profile") || msg.includes("already in use") || msg.includes("process_singleton")) {
      // Second attempt: clear locks again and retry once
      logger.warn("Browser launch failed with profile lock error — clearing locks and retrying");
      clearChromeLocks();
      browserInstance = await puppeteerExtra.launch(launchOptions);
    } else {
      throw err;
    }
  }

  browserInstance.on("disconnected", () => {
    logger.warn("Browser disconnected");
    browserInstance = null;
  });

  return browserInstance;
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

// ─── Proxy browser management ─────────────────────────────────────────────────
// Proxy scans need a separate Chromium instance launched with --proxy-pac-url.
// We cache one proxy browser per PAC URL to avoid relaunching on every page.
let _proxyBrowserInstance: Browser | null = null;
let _currentProxyPac: string | null = null;

async function getProxyBrowser(proxyPacUrl: string): Promise<Browser> {
  // Reuse if same PAC URL and browser is still connected
  if (_proxyBrowserInstance && _proxyBrowserInstance.connected && _currentProxyPac === proxyPacUrl) {
    return _proxyBrowserInstance;
  }

  // Close old proxy browser if PAC URL changed
  if (_proxyBrowserInstance && _proxyBrowserInstance.connected) {
    await _proxyBrowserInstance.close().catch(() => {});
    _proxyBrowserInstance = null;
  }

  logger.info({ proxyPacUrl }, "Launching proxy browser");

  _proxyBrowserInstance = await puppeteerExtra.launch({
    headless: true,
    executablePath: getChromiumPath(),
    // Use a separate profile dir for proxy sessions so they don't conflict with the main profile lock
    userDataDir: path.join(CHROME_PROFILE_DIR, "proxy"),
    args: [
      ...PUPPETEER_LAUNCH_ARGS,
      `--proxy-pac-url=${proxyPacUrl}`,
      // Ignore certificate errors on internal/staging environments
      "--ignore-certificate-errors",
      "--ignore-ssl-errors",
    ],
  });

  _currentProxyPac = proxyPacUrl;

  _proxyBrowserInstance.on("disconnected", () => {
    logger.warn("Proxy browser disconnected");
    _proxyBrowserInstance = null;
    _currentProxyPac = null;
  });

  return _proxyBrowserInstance;
}

// ─── Scan mutex ───────────────────────────────────────────────────────────────
// Global mutex: the persistent Chrome profile cannot be opened by two Chromium processes
// simultaneously, so all scanPage() calls must run one at a time regardless of which
// scan session requested them.
let _scanMutex: Promise<void> = Promise.resolve();

export function scanPage(url: string, options: {
  timeout?: number;
  waitForNetworkIdle?: boolean;
  bypassCSP?: boolean;
  rules?: string[];
  proxyPacUrl?: string;
} = {}): Promise<PageScanResult> {
  const result = _scanMutex.then(() => _scanPageInternal(url, options));
  // Advance mutex even if this scan errors — never block the queue permanently
  _scanMutex = result.then(() => {}, () => {});
  return result;
}

async function _scanPageInternal(url: string, options: {
  timeout?: number;
  waitForNetworkIdle?: boolean;
  bypassCSP?: boolean;
  rules?: string[];
  proxyPacUrl?: string;
} = {}): Promise<PageScanResult> {
  const { timeout = 90000, waitForNetworkIdle = true, bypassCSP = true } = options;

  let page: Page | null = null;

  try {
    const browser = options.proxyPacUrl
      ? await getProxyBrowser(options.proxyPacUrl)
      : await getBrowser();
    page = await browser.newPage();

    if (bypassCSP) {
      await page.setBypassCSP(true);
    }

    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultNavigationTimeout(timeout);

    // Set a realistic Chrome user-agent and request headers to minimise bot detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    });

    logger.info({ url }, "Navigating to page");
    // Always navigate to domcontentloaded first — networkidle2 can hang forever on
    // pages with persistent analytics/tracking (long-polling, SSE, etc.)
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // Optionally wait for network to settle (up to 15s) — but never let it block scanning
    if (waitForNetworkIdle) {
      try {
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 });
      } catch {
        // Network didn't fully settle — that's fine, the DOM is ready; continue scanning
        logger.info({ url }, "Network idle timeout — proceeding with available DOM");
      }
    }

    // Cloudflare Bot Management shows a challenge page before redirecting to the real page.
    // Detect it and wait up to 25s for the JS challenge to complete and the real page to load.
    const isCfChallenge = await page.evaluate((): boolean => {
      const title = document.title.toLowerCase();
      const bodyText = document.body?.innerText?.toLowerCase() ?? "";
      return (
        title.includes("just a moment") ||
        title.includes("please wait") ||
        title.includes("checking your browser") ||
        bodyText.includes("verifying your connection") ||
        bodyText.includes("checking your browser before accessing") ||
        bodyText.includes("enable javascript and cookies") ||
        !!document.querySelector("#challenge-form, #cf-challenge-running, .cf-browser-verification, [id^='challenge-']")
      );
    });

    if (isCfChallenge) {
      logger.info({ url }, "Cloudflare challenge detected — waiting for it to resolve (up to 55s)");
      // Phase 1: wait up to 30s for the JS challenge to execute and redirect
      try {
        await Promise.race([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
          new Promise<void>(resolve => setTimeout(resolve, 30000)),
        ]);
      } catch { /* expected if no navigation fires within 30s */ }

      // Re-check: are we still on the challenge page?
      const stillOnChallenge = await page.evaluate((): boolean => {
        const title = document.title.toLowerCase();
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        return (
          title.includes("just a moment") || title.includes("please wait") ||
          title.includes("checking your browser") ||
          bodyText.includes("verifying your connection") ||
          bodyText.includes("checking your browser before accessing") ||
          bodyText.includes("enable javascript and cookies") ||
          !!document.querySelector("#challenge-form, #cf-challenge-running, .cf-browser-verification, [id^='challenge-']")
        );
      });

      if (stillOnChallenge) {
        // Phase 2: give it another 25s
        logger.info({ url }, "Still on Cloudflare challenge — waiting an additional 25s");
        try {
          await Promise.race([
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25000 }),
            new Promise<void>(resolve => setTimeout(resolve, 25000)),
          ]);
        } catch { /* expected */ }

        // Final check: if STILL on challenge, abort — don't scan the bot-wall
        const finalChallenge = await page.evaluate((): boolean => {
          const bodyText = document.body?.innerText?.toLowerCase() ?? "";
          return (
            bodyText.includes("verifying your connection") ||
            bodyText.includes("checking your browser before accessing") ||
            bodyText.includes("enable javascript and cookies") ||
            !!document.querySelector("#challenge-form, #cf-challenge-running")
          );
        });
        if (finalChallenge) {
          throw new Error("Cloudflare Bot Protection blocked the scan — the page could not be reached. Try scanning from a browser with the cf_clearance cookie already set.");
        }
      }

      // Extra pause for any post-redirect JS to settle
      await new Promise(r => setTimeout(r, 2000));
      logger.info({ url, currentUrl: page.url() }, "Cloudflare challenge resolved");
    }

    logger.info({ url }, "Scrolling page to trigger lazy-loaded content");
    await fullyRenderPage(page, timeout);

    logger.info({ url }, "Running SIA accessibility rules on fully-rendered DOM");
    let issues = await runSIARules(page);
    logger.info({ url, issueCount: issues.length }, "SIA rules completed");

    // If a rule filter was specified, only return issues matching those rule IDs
    if (options.rules && options.rules.length > 0) {
      const ruleSet = new Set(options.rules.map(r => r.toUpperCase()));
      issues = issues.filter(i => ruleSet.has(i.ruleId.toUpperCase()));
    }

    return { url, issues };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const timeoutMatch = msg.match(/Navigation timeout of (\d+) ms exceeded/);
    if (timeoutMatch) {
      const seconds = Math.round(parseInt(timeoutMatch[1], 10) / 1000);
      const normalised = `Scan timed out after ${seconds}s while loading the page.`;
      logger.warn({ url, error: normalised }, "Failed to scan page");
      return { url, issues: [], error: normalised };
    }
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

    // Returns visible text of an element, stripping aria-hidden subtrees
    function getVisibleText(el: Element): string {
      let text = "";
      el.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent || "";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const child = node as Element;
          if (child.getAttribute("aria-hidden") !== "true") {
            text += getVisibleText(child);
          }
        }
      });
      return text.trim().replace(/\s+/g, " ");
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
        // Placeholder is the de-facto visible label when no explicit <label> exists
        if (el instanceof HTMLInputElement && el.placeholder) return el.placeholder;
        if (el instanceof HTMLTextAreaElement && el.placeholder) return el.placeholder;
      }
      return el.textContent?.trim() || "";
    }

    function isInsideLandmark(el: Element): boolean {
      const landmarkRoles = ["main", "navigation", "complementary", "contentinfo", "banner", "search", "form", "region"];
      // These tags are always landmarks regardless of nesting or naming
      const alwaysLandmarkTags = ["main", "nav", "aside", "form"];
      // header/footer are banner/contentinfo landmarks ONLY when NOT nested inside sectioning content
      const sectioningTags = ["article", "aside", "main", "nav", "section"];
      let node: Element | null = el.parentElement;
      while (node && node !== document.body) {
        const tag = node.tagName.toLowerCase();
        if (alwaysLandmarkTags.includes(tag)) return true;
        // <section> is only a landmark (region) when it has an accessible name
        if (tag === "section") {
          if (node.hasAttribute("aria-label") || node.hasAttribute("aria-labelledby") || node.hasAttribute("title")) return true;
          // unnamed section is NOT a landmark — keep climbing
        }
        // <header>/<footer> are landmarks only when at top-level (not nested inside sectioning elements)
        if (tag === "header" || tag === "footer") {
          const parent = node.parentElement;
          const parentTag = parent?.tagName?.toLowerCase() || "";
          if (!sectioningTags.includes(parentTag)) return true;
          // nested header/footer inside sectioning element → NOT a landmark
        }
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

    // SIA-R3: Duplicate IDs — only flag IDs actually used in accessibility relationships
    // (aria-labelledby, aria-describedby, aria-controls, label[for], anchor links)
    const referencedIds = new Set<string>();
    document.querySelectorAll("[aria-labelledby],[aria-describedby],[aria-controls],[aria-owns],[aria-activedescendant]").forEach(el => {
      ["aria-labelledby","aria-describedby","aria-controls","aria-owns","aria-activedescendant"].forEach(attr => {
        (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean).forEach(id => referencedIds.add(id));
      });
    });
    document.querySelectorAll("label[for]").forEach(el => { const v = el.getAttribute("for"); if (v) referencedIds.add(v); });
    document.querySelectorAll("a[href^='#']").forEach(el => { const h = el.getAttribute("href")!.slice(1); if (h) referencedIds.add(h); });
    const idCountMap: Record<string, number> = {};
    document.querySelectorAll("[id]").forEach(el => {
      if (referencedIds.has(el.id)) idCountMap[el.id] = (idCountMap[el.id] || 0) + 1;
    });
    for (const [id, count] of Object.entries(idCountMap)) {
      if (count > 1) {
        results.push({ ruleId: "SIA-R3", impact: "critical", description: `Duplicate ID "${id}" is referenced for accessibility (${count} elements share this ID)`, element: `#${id}`, selector: `[id="${id}"]` });
      }
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

    // SIA-R84: Scrollable elements must be keyboard accessible
    const scrollableCandidates = Array.from(document.querySelectorAll("*")).filter((el): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      if (!isVisible(el)) return false;
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const overflow = style.overflow;
      const scrollLike = ["auto", "scroll", "hidden", "clip"].includes(overflowY) || ["auto", "scroll", "hidden", "clip"].includes(overflowX) || ["auto", "scroll", "hidden", "clip"].includes(overflow);
      if (!scrollLike) return false;
      const rect = el.getBoundingClientRect();
      const hasOverflowContent = el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4;
      const isSizedScroller = rect.height >= 40 && rect.width >= 40;
      return hasOverflowContent || isSizedScroller;
    });
    const firstInaccessibleScroller = scrollableCandidates.find(el => {
      const classes = `${el.className || ""}`.toLowerCase();
      const role = `${el.getAttribute("role") || ""}`.toLowerCase();
      const ariaLabel = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("aria-labelledby") || ""}`.toLowerCase();
      const isCardHover = classes.includes("card-hover") || classes.includes("keysight-generic-asset-page-card-configuration");
      const isDescriptionRegion = role === "region" && ariaLabel.includes("scrollable");
      if (!isCardHover && !isDescriptionRegion) return false;
      const focusable = el.tabIndex >= 0 || el.hasAttribute("tabindex");
      const interactive = el.matches("a, button, input, select, textarea, summary, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='listbox'], [role='grid'], [role='tree'], [role='textbox']");
      return !focusable && !interactive;
    });
    if (firstInaccessibleScroller) {
      results.push({
        ruleId: "SIA-R84",
        impact: "moderate",
        description: "Scrollable elements are not keyboard accessible",
        element: outerHtmlSnippet(firstInaccessibleScroller),
        selector: getSelector(firstInaccessibleScroller),
      });
    }

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

    // Also check buttons, links, tabs for label-in-name
    // Use el.innerText (browser-rendered text) so sr-only spans are excluded,
    // and use getAccessibleName (handles aria-label AND aria-labelledby)
    document.querySelectorAll("a[href], button, [role='button'], [role='link'], [role='tab'], [role='menuitem']").forEach(el => {
      if (!isVisible(el)) return;
      // Only check elements that have an explicit accessible name override
      const hasAriaLabel = el.hasAttribute("aria-label");
      const hasAriaLabelledby = el.hasAttribute("aria-labelledby");
      if (!hasAriaLabel && !hasAriaLabelledby) return;
      // Use innerText — the browser's own rendering of visually-presented text (excludes sr-only, clips, hidden spans)
      const rawVisible = (el instanceof HTMLElement ? el.innerText?.replace(/\s+/g, " ")?.trim() : "") || "";
      if (!rawVisible || rawVisible.length < 2 || rawVisible.includes("<")) return;
      // Deduplicate AEM/CMS double-render pattern: "Awards Awards" → "Awards"
      const visibleText = (() => {
        const words = rawVisible.split(" ");
        if (words.length >= 2) {
          const half = Math.floor(words.length / 2);
          const a = words.slice(0, half).join(" ");
          const b = words.slice(half).join(" ");
          if (a.toLowerCase() === b.toLowerCase()) return a;
        }
        return rawVisible;
      })();
      const accName = getAccessibleName(el);
      if (!accName || accName.length < 2) return;
      // The accessible name must contain the visible label text (case-insensitive)
      if (!accName.toLowerCase().includes(visibleText.toLowerCase())) {
        results.push({ ruleId: "SIA-R14", impact: "moderate", description: `Visible text "${visibleText.substring(0, 60)}" is not included in accessible name "${accName.substring(0, 60)}"`, element: outerHtmlSnippet(el), selector: getSelector(el) });
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
      if (targetSizeFailCount >= 50) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) {
        targetSizeFailCount++;
        results.push({ ruleId: "SIA-R32", impact: "minor", description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px, below the 24×24px enhanced target size`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
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

    // Heading hierarchy — detect skipped heading levels (e.g. h1 → h3 without h2)
    // Siteimprove: "Headings are not structured" (Accessibility best practices)
    const visibleHeadings = headings.filter(h => isVisible(h));
    visibleHeadings.forEach((h, i) => {
      if (i === 0) return; // first heading has no predecessor to compare
      const prev = visibleHeadings[i - 1];
      const prevLevel = parseInt(prev.tagName[1], 10);
      const currLevel = parseInt(h.tagName[1], 10);
      // A heading that jumps more than one level down (e.g. h1→h3) skips a level
      if (currLevel > prevLevel + 1) {
        results.push({
          ruleId: "SIA-R64",
          impact: "moderate",
          description: `Heading level skipped: <${prev.tagName.toLowerCase()}> is followed by <${h.tagName.toLowerCase()}> — level ${prevLevel + 1} is missing. "${(h.textContent || "").substring(0, 60)}"`,
          element: outerHtmlSnippet(h),
          selector: getSelector(h)
        });
      }
    });

    // SIA-R35: Text content not inside a landmark
    // Walk the full DOM tree, report text nodes outside any landmark.
    // Cap at 100 per page — Siteimprove aggregates at higher container levels and never reports unbounded lists.
    const seenR35Parents = new Set<Element>();
    let r35Count = 0;
    function checkTextNodes(node: Node): void {
      if (r35Count >= 100) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim() || "";
        if (text.length < 10) return; // ignore very short fragments (icons, punctuation)
        const parent = node.parentElement;
        if (!parent || seenR35Parents.has(parent)) return;
        if (!isVisible(parent)) return;
        if (!isInsideLandmark(parent)) {
          seenR35Parents.add(parent);
          r35Count++;
          results.push({ ruleId: "SIA-R35", impact: "minor", description: `Text "${text.substring(0, 80)}" is not contained within a landmark region`, element: outerHtmlSnippet(parent), selector: getSelector(parent) });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName?.toLowerCase();
        if (["script","style","noscript","template"].includes(tag)) return;
        // Stop descending into landmark elements — their content is fine.
        // Must mirror isInsideLandmark() logic exactly: unnamed <section> and nested header/footer are NOT landmarks.
        const role = el.getAttribute("role");
        const landmarkRoles = ["main","navigation","complementary","contentinfo","banner","search","form","region"];
        const alwaysStop = ["main","nav","aside","form"];
        if (alwaysStop.includes(tag)) return;
        if (tag === "section" && (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") || el.hasAttribute("title"))) return;
        if ((tag === "header" || tag === "footer") && !["article","aside","main","nav","section"].includes((el.parentElement?.tagName || "").toLowerCase())) return;
        if (role && landmarkRoles.includes(role)) return;
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
    // Check for ARIA attributes on native elements where ARIA is prohibited
    // Deduplicate: only report each unique (element type, attribute) combination once
    const r36Seen = new Set<string>();
    document.querySelectorAll("input[type='hidden'], meta, script, style").forEach(el => {
      const tag = el.tagName.toLowerCase();
      const inputType = el.getAttribute("type") || "";
      const key = `${tag}[type=${inputType}]`;
      el.getAttributeNames().filter(a => a.startsWith("aria-")).forEach(attr => {
        const dedupKey = `${key}::${attr}`;
        if (r36Seen.has(dedupKey)) return;
        r36Seen.add(dedupKey);
        results.push({ ruleId: "SIA-R36", impact: "moderate", description: `ARIA attribute "${attr}" is not permitted on <${tag}>`, element: outerHtmlSnippet(el), selector: getSelector(el) });
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

    // SIA-R22: Video without captions — skip muted, decorative, hidden, or managed-player videos
    document.querySelectorAll("video").forEach(video => {
      if (video.hasAttribute("muted")) return;
      if (video.getAttribute("aria-hidden") === "true" || video.closest('[aria-hidden="true"]')) return;
      if (video.hasAttribute("autoplay") && video.hasAttribute("loop") && video.hasAttribute("playsinline")) return; // background/ambient video pattern
      // Skip VideoJS-managed players — they provide their own CC interface
      if (video.classList.contains("vjs-tech") || video.closest(".video-js") || video.closest("[data-comp*='Video']") || video.closest(".ks-video-player")) return;
      if (!isVisible(video)) return;
      // Skip very small videos (likely decorative)
      const rect = video.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;
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

    // SIA-R87: Landmark regions — only flag if <main> is truly absent (including common CMS patterns)
    let hasMainLandmark = !!document.querySelector(
      "main, [role='main'], #main, #main-content, #maincontent, .main-content, #page-content, #content-main, #primary-content"
    );
    // Also check: if a skip link exists that points to an anchor, treat that as evidence of a main area
    if (!hasMainLandmark) {
      const skipLinkHref = (document.querySelector("a[href^='#']") as HTMLAnchorElement)?.href || "";
      const anchor = skipLinkHref ? skipLinkHref.split("#")[1] : null;
      if (anchor && document.getElementById(anchor)) hasMainLandmark = true;
    }
    if (!hasMainLandmark) {
      results.push({ ruleId: "SIA-R87", impact: "moderate", description: "Page is missing a <main> landmark region", element: "<body>", selector: "body" });
    }

    // SIA-R58: Skip to content link — look for a link with skip-related text targeting an anchor
    const anchorLinks = Array.from(document.querySelectorAll("a[href^='#']"));
    const hasSkipLink = anchorLinks.some(link => {
      const text = (link.textContent || link.getAttribute("aria-label") || "").toLowerCase();
      const href = link.getAttribute("href") || "#";
      return href.length > 1 && (text.includes("skip") || text.includes("main content") || text.includes("jump to") || text.includes("go to content"));
    });
    if (!hasSkipLink) {
      results.push({ ruleId: "SIA-R58", impact: "moderate", description: "Page is missing a skip navigation link (a visible-on-focus link to the main content)", element: "<body>", selector: "body" });
    }

    // SIA-R65: Focus visible — only flag if outline is removed AND no visual replacement is provided
    let hasFocusOutlineRemoved = false;
    let hasFocusReplacement = false;
    try {
      Array.from(document.styleSheets).forEach(sheet => {
        try {
          Array.from(sheet.cssRules || []).forEach(rule => {
            const text = rule.cssText || "";
            if ((text.includes(":focus") || text.includes(":focus-visible")) &&
               (text.includes("outline: none") || text.includes("outline:none") || text.includes("outline: 0") || text.includes("outline:0"))) {
              hasFocusOutlineRemoved = true;
              // Check if there's a visual replacement in the same rule
              if (text.includes("box-shadow") || text.includes("border") || text.includes("background") ||
                  text.includes("text-decoration") || text.includes("filter") || text.includes("ring")) {
                hasFocusReplacement = true;
              }
            }
          });
        } catch { /* cross-origin */ }
      });
    } catch { /* ignore */ }
    if (hasFocusOutlineRemoved && !hasFocusReplacement) {
      results.push({ ruleId: "SIA-R65", impact: "serious", description: "CSS removes focus outline without providing a visible replacement focus indicator", element: null, selector: null });
    }

    // SIA-R69: AA Contrast (4.5:1 normal / 3:1 large text)
    // SIA-R30: AAA Enhanced Contrast (7:1 normal / 4.5:1 large text)
    // Target: elements that directly contain text nodes (not just structural containers)
    let contrastAAFails = 0;
    let contrastAAAFails = 0;
    const allDomEls = Array.from(document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, span, a, button, label, li, td, th, div, blockquote, cite, figcaption, dt, dd, summary"));
    const textLeafEls = allDomEls.filter(el => {
      // Must have at least one direct text node with meaningful content
      return Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && (n.textContent?.trim()?.length || 0) > 3);
    }).slice(0, 500);
    for (const el of textLeafEls) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisible(el)) continue;
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
      if (ratio < aaMin && contrastAAFails < 15) {
        contrastAAFails++;
        results.push({ ruleId: "SIA-R69", impact: "serious", description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AA minimum (${aaMin}:1)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      } else if (ratio < aaaMin && ratio >= aaMin && contrastAAAFails < 25) {
        contrastAAAFails++;
        results.push({ ruleId: "SIA-R30", impact: "minor", description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AAA enhanced minimum (${aaaMin}:1)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    }

    // SIA-R31: Line height (1.4.8 AAA / 1.4.12 AA) — target text leaf nodes including AEM divs
    let lineHeightFails = 0;
    const lineHeightEls = allDomEls.filter(el => {
      return Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && (n.textContent?.trim()?.length || 0) > 15);
    }).slice(0, 300);
    for (const el of lineHeightEls) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisible(el)) continue;
      const style = window.getComputedStyle(el);
      const lineHeightRaw = style.lineHeight;
      if (lineHeightRaw === "normal") continue; // browser default — not measurable
      const lineHeight = parseFloat(lineHeightRaw);
      const fontSize = parseFloat(style.fontSize);
      if (isNaN(lineHeight) || isNaN(fontSize) || fontSize === 0) continue;
      const ratio = lineHeight / fontSize;
      if (ratio < 1.5 && lineHeightFails < 30) {
        lineHeightFails++;
        results.push({ ruleId: "SIA-R31", impact: "moderate", description: `Line height ${ratio.toFixed(2)}× is below the minimum 1.5× (font-size: ${Math.round(fontSize)}px, line-height: ${Math.round(lineHeight)}px)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    }

    // SIA-R68: Text clipped when resized (1.4.4 Resize Text)
    // Flag elements with overflow:hidden + fixed height that contain text — at larger font sizes
    // the content will clip. This is a static/potential check (Siteimprove behaviour), not requiring
    // actual overflow at 1× zoom.
    let clippedCount = 0;
    document.querySelectorAll("*").forEach(el => {
      if (clippedCount >= 25) return;
      if (!(el instanceof HTMLElement)) return;

      // Skip screen-reader-only elements — they use 1px/overflow:hidden intentionally for AT access
      const cls = (el.className || "").toString().toLowerCase();
      if (cls.includes("sr-only") || cls.includes("visually-hidden") || cls.includes("screen-reader") || cls.includes("a11y-hidden") || cls.includes("offscreen")) return;

      const style = window.getComputedStyle(el);

      // Skip elements with very small rendered dimensions (sr-only / decorative)
      const clientH = el.clientHeight;
      const clientW = el.clientWidth;
      if (clientH <= 1 || clientW <= 1) return;

      // Skip elements clipped via clip/clip-path (sr-only pattern)
      if (style.clip && style.clip !== "auto") return;
      if (style.clipPath && style.clipPath !== "none") return;
      // Skip absolutely-positioned elements with negative margins (classic sr-only)
      if (style.position === "absolute" && (parseFloat(style.marginLeft) < -100 || parseFloat(style.marginTop) < -100)) return;

      if (!isVisible(el)) return;

      // Check overflow in any direction (hidden or clip)
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const overflowGeneral = style.overflow;
      const hasHiddenOverflow = ["hidden","clip"].includes(overflowY) || ["hidden","clip"].includes(overflowX) || ["hidden","clip"].includes(overflowGeneral);
      if (!hasHiddenOverflow) return;

      const text = el.textContent?.trim() || "";
      if (text.length < 10) return;

      const height = style.height;
      // Only flag fixed-height (px/em/rem/ch), not auto/percentage/min/max-content
      if (!height || height === "auto" || height.endsWith("%") || height === "none" ||
          height === "fit-content" || height === "max-content" || height === "min-content") return;

      // Only flag tight containers (≤ 80px) — large expandable/product sections are excluded.
      // Siteimprove focuses on single/double-line-height fixed containers (e.g. nav tabs, badges, labels).
      const heightPx = parseFloat(height);
      if (isNaN(heightPx) || heightPx > 80) return;

      // Must contain text
      if (!el.textContent?.trim()) return;

      // WCAG 1.4.4: content must survive 200% text zoom without clipping.
      // If scrollH > 50% of clientH, doubling the text size would exceed the fixed height → flag it.
      // Elements at ≤50% capacity can absorb 2× zoom safely.
      const scrollH = el.scrollHeight;
      if (clientH > 0 && scrollH < clientH * 0.5) return;

      clippedCount++;
      results.push({ ruleId: "SIA-R68", impact: "moderate", description: `Element has fixed height (${height}) with overflow:hidden — text may be clipped when text size is increased`, element: outerHtmlSnippet(el), selector: getSelector(el) });
    });

    // ─── SIA-R9: Empty headings ───────────────────────────────────────────────
    document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(el => {
      if (!isVisible(el)) return;
      const text = el.textContent?.trim() || "";
      const ariaLabel = el.getAttribute("aria-label")?.trim() || "";
      const labelledBy = el.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim()
        : "";
      if (!text && !ariaLabel && !labelledText) {
        results.push({ ruleId: "SIA-R9", impact: "moderate", description: `Empty ${el.tagName.toLowerCase()} element provides no accessible heading`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R13: Links open new window without warning ───────────────────────
    document.querySelectorAll("a[target='_blank'], a[target='_new']").forEach(el => {
      if (!isVisible(el)) return;
      const fullText = el.textContent || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      const combined = (fullText + " " + ariaLabel + " " + title).toLowerCase();
      const warningPhrases = ["new window", "new tab", "opens in", "external", "new page", "neues", "nouvel"];
      if (!warningPhrases.some(p => combined.includes(p))) {
        // Check for sr-only child with warning text
        const hasHiddenWarning = Array.from(el.querySelectorAll("*")).some(child => {
          const childText = (child.textContent || "").toLowerCase();
          return warningPhrases.some(p => childText.includes(p));
        });
        if (!hasHiddenWarning) {
          results.push({ ruleId: "SIA-R13", impact: "minor", description: `Link opens in a new window without warning the user`, element: outerHtmlSnippet(el), selector: getSelector(el) });
        }
      }
    });

    // ─── SIA-R17: Audio/video without transcript ──────────────────────────────
    document.querySelectorAll("audio, video").forEach(el => {
      if (!isVisible(el)) return;
      // Look for a link or nearby text referencing a transcript
      const parent = el.parentElement;
      const nearby = parent ? parent.textContent?.toLowerCase() || "" : "";
      const transcriptKeywords = ["transcript", "text version", "text alternative", "caption"];
      // Also check for aria-describedby pointing to transcript
      const describedBy = el.getAttribute("aria-describedby");
      if (!transcriptKeywords.some(k => nearby.includes(k)) && !describedBy) {
        results.push({ ruleId: "SIA-R17", impact: "serious", description: `${el.tagName.toLowerCase()} element has no adjacent transcript link or text alternative`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R23: Video without audio description track ───────────────────────
    document.querySelectorAll("video").forEach(el => {
      if (!isVisible(el)) return;
      const tracks = el.querySelectorAll("track[kind='descriptions']");
      if (tracks.length === 0) {
        results.push({ ruleId: "SIA-R23", impact: "serious", description: `Video element is missing an audio description track (<track kind='descriptions'>)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R26: Abbreviation without title ──────────────────────────────────
    document.querySelectorAll("abbr").forEach(el => {
      if (!isVisible(el)) return;
      const title = el.getAttribute("title")?.trim() || "";
      if (!title) {
        results.push({ ruleId: "SIA-R26", impact: "minor", description: `<abbr> element "${el.textContent?.trim()}" has no title attribute explaining the abbreviation`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R41: Table without caption ───────────────────────────────────────
    document.querySelectorAll("table").forEach(el => {
      if (!isVisible(el)) return;
      const hasCaption = el.querySelector("caption") !== null;
      const hasSummary = el.getAttribute("summary")?.trim();
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim()
        : "";
      if (!hasCaption && !hasSummary && !ariaLabel && !labelledText) {
        results.push({ ruleId: "SIA-R41", impact: "moderate", description: `Table is missing a <caption> or accessible label to describe its purpose`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R45: Inputs missing autocomplete for personal data ───────────────
    const autocompleteMap: Record<string, string[]> = {
      "name": ["name", "full-name", "first", "last", "given", "family", "fname", "lname"],
      "email": ["email", "mail", "e-mail"],
      "tel": ["phone", "telephone", "mobile", "cell"],
      "street-address": ["address", "street", "addr"],
      "postal-code": ["zip", "postal", "postcode"],
      "country": ["country"],
      "bday": ["birth", "dob", "birthday"],
      "username": ["username", "login", "user-name"],
      "new-password": ["password", "passwd", "pwd"],
      "current-password": [],
      "cc-number": ["card", "credit", "cardnumber"],
    };
    document.querySelectorAll("input[type='text'], input[type='email'], input[type='tel'], input[type='password'], input:not([type])").forEach(el => {
      if (!isVisible(el)) return;
      const input = el as HTMLInputElement;
      if (input.getAttribute("autocomplete") && input.getAttribute("autocomplete") !== "off") return;
      const name = (input.name || "").toLowerCase();
      const id = (input.id || "").toLowerCase();
      const placeholder = (input.placeholder || "").toLowerCase();
      const combined = name + " " + id + " " + placeholder;
      for (const [token, patterns] of Object.entries(autocompleteMap)) {
        if (patterns.some(p => combined.includes(p)) || combined.includes(token)) {
          results.push({ ruleId: "SIA-R45", impact: "moderate", description: `Input collecting "${token}" data is missing autocomplete="${token}" attribute`, element: outerHtmlSnippet(el), selector: getSelector(el) });
          break;
        }
      }
    });

    // ─── SIA-R46: Touch target too small (<24×24px) ───────────────────────────
    const interactiveTags = ["a", "button", "input", "select", "textarea", "summary", "[role='button']", "[role='link']", "[role='menuitem']", "[role='tab']", "[role='checkbox']", "[role='radio']", "[role='switch']", "[tabindex]"];
    document.querySelectorAll(interactiveTags.join(", ")).forEach(el => {
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      if (rect.width < 24 || rect.height < 24) {
        results.push({ ruleId: "SIA-R46", impact: "moderate", description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px — below the 24×24px minimum touch target size (WCAG 2.5.8)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R54: Status messages not in ARIA live region ─────────────────────
    // Look for elements that look like status/alert messages but lack live region markup
    const statusSelectors = [".alert", ".notification", ".toast", ".message", ".success", ".error", ".warning", ".info", "[class*='alert']", "[class*='notification']", "[class*='toast']", "[class*='status']", "[class*='message']"];
    document.querySelectorAll(statusSelectors.join(", ")).forEach(el => {
      if (!isVisible(el)) return;
      if (el.tagName === "BODY" || el.tagName === "MAIN" || el.tagName === "HEADER" || el.tagName === "FOOTER") return;
      const role = el.getAttribute("role");
      const ariaLive = el.getAttribute("aria-live");
      const ariaAtomic = el.getAttribute("aria-atomic");
      if (!role && !ariaLive && !ariaAtomic) {
        const liveRoles = ["status", "alert", "log", "marquee", "timer"];
        if (!liveRoles.includes(role || "")) {
          results.push({ ruleId: "SIA-R54", impact: "moderate", description: `Element appears to be a status message but lacks aria-live or role="status"/"alert"`, element: outerHtmlSnippet(el), selector: getSelector(el) });
        }
      }
    });

    // ─── SIA-R57: Non-text contrast for UI components ─────────────────────────
    function getLuminanceFromColor(colorStr: string): number | null {
      const canvas = document.createElement("canvas");
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = colorStr;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const toLinear = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    }
    function getContrastRatio(l1: number, l2: number): number {
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }
    // Check borders and outlines on interactive elements
    document.querySelectorAll("input, select, textarea, button, a").forEach(el => {
      if (!isVisible(el)) return;
      const style = window.getComputedStyle(el);
      const borderColor = style.borderColor;
      const bgColor = style.backgroundColor;
      if (!borderColor || borderColor === "transparent" || borderColor === "rgba(0, 0, 0, 0)") return;
      const borderLum = getLuminanceFromColor(borderColor);
      const bgLum = getLuminanceFromColor(bgColor || "#ffffff");
      if (borderLum === null || bgLum === null) return;
      const ratio = getContrastRatio(borderLum, bgLum);
      if (ratio < 3.0) {
        results.push({ ruleId: "SIA-R57", impact: "serious", description: `UI component border/outline has contrast ratio of ${ratio.toFixed(2)}:1 — below the 3:1 minimum for non-text elements`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R59: Ambiguous link text ─────────────────────────────────────────
    const ambiguousPatterns = /^(click here|here|read more|more|learn more|details|info|information|link|this link|continue|go|view|see more|see details|download|submit|open|visit|press here|tap here|find out more)$/i;
    document.querySelectorAll("a").forEach(el => {
      if (!isVisible(el)) return;
      const name = getAccessibleName(el).trim().replace(/\s+/g, " ");
      if (name && ambiguousPatterns.test(name)) {
        results.push({ ruleId: "SIA-R59", impact: "moderate", description: `Link text "${name}" is non-descriptive and does not explain the link destination`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R62: Content section missing a heading ───────────────────────────
    const sectionLandmarks = ["main", "nav", "aside", "section", "[role='region']", "[role='complementary']"];
    document.querySelectorAll(sectionLandmarks.join(", ")).forEach(el => {
      if (!isVisible(el)) return;
      const hasHeading = el.querySelector("h1,h2,h3,h4,h5,h6") !== null;
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      if (!hasHeading && !ariaLabel && !labelledBy) {
        results.push({ ruleId: "SIA-R62", impact: "minor", description: `${el.tagName.toLowerCase()} landmark region has no heading or accessible label`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R66: Form error not associated with its field ────────────────────
    const errorSelectors = [".error", ".invalid", ".field-error", "[class*='error']", "[class*='invalid']", "[aria-invalid='true']"];
    document.querySelectorAll(errorSelectors.join(", ")).forEach(el => {
      if (!isVisible(el)) return;
      const text = el.textContent?.trim() || "";
      if (!text || text.length < 3) return;
      // It's a message — check if it's associated with a field
      const id = el.getAttribute("id");
      if (id) {
        // Good if some input points back to this id via aria-describedby
        const associated = document.querySelector(`[aria-describedby~="${CSS.escape(id)}"]`);
        if (associated) return;
      }
      // Check parent form for aria-invalid inputs
      const parentForm = el.closest("form");
      if (parentForm) {
        const invalidInputs = parentForm.querySelectorAll("[aria-invalid='true']");
        if (invalidInputs.length > 0) return;
      }
      results.push({ ruleId: "SIA-R66", impact: "serious", description: `Error message "${text.substring(0, 80)}" is not programmatically associated with its form field via aria-describedby`, element: outerHtmlSnippet(el), selector: getSelector(el) });
    });

    // ─── SIA-R67: Form field missing label ────────────────────────────────────
    document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='reset']):not([type='button']):not([type='image']), select, textarea").forEach(el => {
      if (!isVisible(el)) return;
      const name = getAccessibleName(el).trim();
      if (!name) {
        results.push({ ruleId: "SIA-R67", impact: "serious", description: `Form field has no associated label, aria-label, or aria-labelledby`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R75: Image of text ───────────────────────────────────────────────
    // Heuristic: img elements whose alt text contains word-like content (not empty, not "*", not pure symbols)
    // and are used in contexts that suggest they replace real text (nav, headings, buttons)
    document.querySelectorAll("img").forEach(el => {
      if (!isVisible(el)) return;
      const alt = (el as HTMLImageElement).alt?.trim();
      if (!alt || alt.length < 3) return;
      // Skip purely decorative/icon images
      if (/^(icon|logo|image|photo|picture|thumbnail|avatar|banner|bg|background)$/i.test(alt)) return;
      // Only flag images inside navigation, headings, or buttons — likely text replacement
      const inNavOrHeading = el.closest("nav, h1, h2, h3, h4, h5, h6, button, [role='button'], [role='heading']");
      if (!inNavOrHeading) return;
      // Flag if alt text is a phrase (contains spaces = text-like)
      if (alt.includes(" ") && alt.split(" ").length >= 2) {
        results.push({ ruleId: "SIA-R75", impact: "moderate", description: `Image with alt="${alt}" inside a navigational or heading element may be an image of text`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R88: Word spacing too low ───────────────────────────────────────
    document.querySelectorAll("p, li, td, th, div, span, article, section, main, h1, h2, h3, h4, h5, h6").forEach(el => {
      if (!isVisible(el)) return;
      if (!el.textContent?.trim()) return;
      const style = window.getComputedStyle(el);
      const wordSpacing = style.wordSpacing;
      const fontSize = parseFloat(style.fontSize);
      if (!wordSpacing || wordSpacing === "normal" || isNaN(fontSize) || fontSize === 0) return;
      const wordSpacingPx = parseFloat(wordSpacing);
      if (isNaN(wordSpacingPx)) return;
      const minWordSpacing = 0.16 * fontSize;
      if (wordSpacingPx < -0.01 && Math.abs(wordSpacingPx) > minWordSpacing) {
        results.push({ ruleId: "SIA-R88", impact: "minor", description: `word-spacing is ${wordSpacing} (${(wordSpacingPx / fontSize).toFixed(2)}em) — negative word spacing below -0.16em may hinder readability`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R95: Animation not respecting prefers-reduced-motion ─────────────
    // Detect CSS animation/transition on elements without a prefers-reduced-motion guard
    // We check for inline animation styles or elements with animation-duration set
    document.querySelectorAll("*").forEach(el => {
      if (!isVisible(el)) return;
      const style = window.getComputedStyle(el);
      const animDuration = style.animationDuration;
      const transDuration = style.transitionDuration;
      if (!animDuration && !transDuration) return;
      const animDurVal = parseFloat(animDuration);
      const transDurVal = parseFloat(transDuration);
      // Only flag obvious animations (>0.3s) 
      if (animDurVal > 0.3) {
        const animName = style.animationName;
        if (animName && animName !== "none") {
          results.push({ ruleId: "SIA-R95", impact: "moderate", description: `Element has CSS animation "${animName}" (${animDuration}) — ensure it is disabled or reduced via @media (prefers-reduced-motion: reduce)`, element: outerHtmlSnippet(el), selector: getSelector(el) });
          return;
        }
      }
    });

    // ─── SIA-R96: Table <th> missing scope attribute ──────────────────────────
    document.querySelectorAll("table").forEach(table => {
      if (!isVisible(table)) return;
      table.querySelectorAll("th").forEach(th => {
        const scope = th.getAttribute("scope");
        const ariaSort = th.getAttribute("aria-sort");
        if (!scope && !ariaSort) {
          results.push({ ruleId: "SIA-R96", impact: "moderate", description: `Table header cell is missing a scope attribute (scope="col" or scope="row")`, element: outerHtmlSnippet(th), selector: getSelector(th) });
        }
      });
    });

    // ─── SIA-R97: Fieldset without legend ────────────────────────────────────
    document.querySelectorAll("fieldset").forEach(el => {
      if (!isVisible(el)) return;
      const legend = el.querySelector("legend");
      if (!legend || !legend.textContent?.trim()) {
        results.push({ ruleId: "SIA-R97", impact: "serious", description: `<fieldset> is missing a <legend> element to describe the group of form controls`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R98: Expandable elements missing aria-expanded ──────────────────
    // Detect buttons/links that control collapsible panels but lack aria-expanded
    document.querySelectorAll("button, [role='button'], a[href='#'], a[href='javascript:void(0)'], a[href='javascript:;']").forEach(el => {
      if (!isVisible(el)) return;
      if (el.getAttribute("aria-expanded") !== null) return;
      if (el.getAttribute("aria-haspopup")) return;
      // Check if it controls something via aria-controls
      const controls = el.getAttribute("aria-controls");
      if (!controls) return;
      const controlled = document.getElementById(controls);
      if (controlled) {
        results.push({ ruleId: "SIA-R98", impact: "serious", description: `Toggle control references #${controls} via aria-controls but is missing aria-expanded state`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R99: aria-hidden on focusable element ────────────────────────────
    document.querySelectorAll("[aria-hidden='true']").forEach(el => {
      const focusable = el.querySelectorAll("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
      focusable.forEach(child => {
        const tabindex = child.getAttribute("tabindex");
        if (tabindex === "-1") return;
        results.push({ ruleId: "SIA-R99", impact: "serious", description: `Focusable element is inside an aria-hidden="true" container — keyboard users can focus it but screen readers will not announce it`, element: outerHtmlSnippet(child), selector: getSelector(child) });
      });
    });

    // ─── SIA-R100: PDF links without accessible alternative ──────────────────
    document.querySelectorAll("a[href]").forEach(el => {
      if (!isVisible(el)) return;
      const href = (el as HTMLAnchorElement).href || "";
      if (!/\.pdf(\?|$|#)/i.test(href)) return;
      // Check if there's a nearby "HTML version" or "accessible version" link
      const parent = el.parentElement;
      const nearby = parent?.textContent?.toLowerCase() || "";
      const hasAlternative = /html version|accessible version|text version|word version|alternative format/i.test(nearby);
      if (!hasAlternative) {
        results.push({ ruleId: "SIA-R100", impact: "moderate", description: `Link to PDF "${el.textContent?.trim() || href.split("/").pop()}" has no adjacent accessible alternative format`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R104: Meta refresh causing auto-redirect or reload ───────────────
    document.querySelectorAll("meta[http-equiv='refresh']").forEach(el => {
      const content = el.getAttribute("content") || "";
      const match = content.match(/(\d+)/);
      const seconds = match ? parseInt(match[1], 10) : 0;
      if (seconds === 0) {
        results.push({ ruleId: "SIA-R104", impact: "serious", description: `<meta http-equiv="refresh"> causes an immediate page redirect — users have no control over timing`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      } else {
        results.push({ ruleId: "SIA-R104", impact: "moderate", description: `<meta http-equiv="refresh" content="${content}"> auto-refreshes the page after ${seconds}s without user control`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R105: Multiple links with same text → different destinations ─────
    const linkTextMap: Map<string, Set<string>> = new Map();
    document.querySelectorAll("a[href]").forEach(el => {
      if (!isVisible(el)) return;
      const text = getAccessibleName(el).trim().toLowerCase().replace(/\s+/g, " ");
      if (!text || text.length < 2) return;
      const href = (el as HTMLAnchorElement).href || "";
      if (!href || href === window.location.href + "#" || href === "#") return;
      if (!linkTextMap.has(text)) linkTextMap.set(text, new Set());
      linkTextMap.get(text)!.add(href);
    });
    linkTextMap.forEach((hrefs, text) => {
      if (hrefs.size > 1) {
        document.querySelectorAll("a[href]").forEach(el => {
          if (!isVisible(el)) return;
          const elText = getAccessibleName(el).trim().toLowerCase().replace(/\s+/g, " ");
          if (elText === text) {
            results.push({ ruleId: "SIA-R105", impact: "moderate", description: `Link text "${text}" is used for ${hrefs.size} different destinations — add aria-label to distinguish them`, element: outerHtmlSnippet(el), selector: getSelector(el) });
          }
        });
      }
    });

    // ─── SIA-R107: Custom interactive element not keyboard accessible ──────────
    document.querySelectorAll("[onclick], [ondblclick]").forEach(el => {
      if (!isVisible(el)) return;
      const tag = el.tagName.toLowerCase();
      // Native interactive elements are fine
      if (["a", "button", "input", "select", "textarea", "summary", "details", "label", "option"].includes(tag)) return;
      const tabindex = el.getAttribute("tabindex");
      const role = el.getAttribute("role");
      const isKeyboardAccessible = tabindex !== null && tabindex !== "-1";
      const hasKeyboardHandler = el.getAttribute("onkeydown") || el.getAttribute("onkeyup") || el.getAttribute("onkeypress");
      if (!isKeyboardAccessible || !hasKeyboardHandler) {
        results.push({ ruleId: "SIA-R107", impact: "serious", description: `<${tag}> element has an onclick handler but is ${!isKeyboardAccessible ? "not keyboard focusable (missing tabindex)" : "missing keyboard event handler (onkeydown)"}`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R112: Figure missing figcaption ──────────────────────────────────
    document.querySelectorAll("figure").forEach(el => {
      if (!isVisible(el)) return;
      const figcaption = el.querySelector("figcaption");
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      if (!figcaption && !ariaLabel && !labelledBy) {
        results.push({ ruleId: "SIA-R112", impact: "minor", description: `<figure> element has no <figcaption> or accessible label to describe its content`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

    // ─── SIA-R113: Details element summary has no accessible name ─────────────
    document.querySelectorAll("details").forEach(el => {
      if (!isVisible(el)) return;
      const summary = el.querySelector("summary");
      if (!summary) {
        results.push({ ruleId: "SIA-R113", impact: "serious", description: `<details> element is missing a <summary> child — screen readers cannot announce the disclosure widget`, element: outerHtmlSnippet(el), selector: getSelector(el) });
        return;
      }
      const text = summary.textContent?.trim() || "";
      const ariaLabel = summary.getAttribute("aria-label")?.trim() || "";
      if (!text && !ariaLabel) {
        results.push({ ruleId: "SIA-R113", impact: "serious", description: `<summary> element is empty — provide descriptive text so screen readers can announce the disclosure widget`, element: outerHtmlSnippet(summary), selector: getSelector(summary) });
      }
    });

    // ─── SIA-R115: Object element without accessible name ────────────────────
    document.querySelectorAll("object").forEach(el => {
      if (!isVisible(el)) return;
      const title = el.getAttribute("title")?.trim();
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      const fallbackText = el.textContent?.trim();
      if (!title && !ariaLabel && !labelledBy && !fallbackText) {
        results.push({ ruleId: "SIA-R115", impact: "serious", description: `<object> element has no title, aria-label, or fallback text content`, element: outerHtmlSnippet(el), selector: getSelector(el) });
      }
    });

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
