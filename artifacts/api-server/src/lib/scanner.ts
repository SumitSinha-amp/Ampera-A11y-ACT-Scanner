import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { execSync } from "child_process";
import { mkdirSync, rmSync, existsSync, readdirSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger";

puppeteerExtra.use(StealthPlugin());

/*function getChromiumPath(): string | undefined {
  if (process.env["PUPPETEER_EXECUTABLE_PATH"]) {
    return process.env["PUPPETEER_EXECUTABLE_PATH"];
  }
  try {
    return (
      execSync(
        "which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null",
      )
        .toString()
        .trim() || undefined
    );
  } catch {
    return undefined;
  }
}*/
function getChromiumPath(): string | undefined {
  if (process.env["PUPPETEER_EXECUTABLE_PATH"]) {
    const envPath = process.env["PUPPETEER_EXECUTABLE_PATH"];
    // Only use the env var if the binary actually exists at that path.
    // In Azure deployment the env var may point to a Nix store path that
    // does not exist — fall through to other discovery strategies instead.
    if (existsSync(envPath)) return envPath;
    logger.warn(
      { envPath },
      "PUPPETEER_EXECUTABLE_PATH is set but binary not found — searching PATH",
    );
  }

  // Standard PATH lookup — works in dev where Nix adds binaries to PATH.
  // Always verify with existsSync: on some distros `which chromium` returns a
  // stub wrapper at /usr/bin/chromium even when Chromium is not installed.
  try {
    const found = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null || which google-chrome-stable 2>/dev/null",
    )
      .toString()
      .trim();
    if (found && existsSync(found)) return found;
  } catch { /* continue */ }

  // Resolve symlinks — handles wrapper scripts that `which` returns
  try {
    const resolved = execSync(
      "readlink -f $(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo '') 2>/dev/null",
    )
      .toString()
      .trim();
    if (resolved && existsSync(resolved)) return resolved;
  } catch { /* continue */ }

  // Puppeteer-bundled Chrome — present when `puppeteer browsers install chrome`
  // has been run (either in the Docker build or via startup.sh).
  // Check all candidate cache directories in priority order.
  // Checks both chrome-linux64/chrome (current) and chrome-linux/chrome (legacy).
  try {
    const cacheCandidates = [
      process.env["PUPPETEER_CACHE_DIR"],
      path.join(process.cwd(), ".cache", "puppeteer"),
      path.join(os.homedir(), ".cache", "puppeteer"),
      "/app/.cache/puppeteer",
      "/home/site/wwwroot/.cache/puppeteer",
    ].filter(Boolean) as string[];

    for (const cacheDir of cacheCandidates) {
      const chromeDir = path.join(cacheDir, "chrome");
      if (!existsSync(chromeDir)) continue;
      const linuxDirs = readdirSync(chromeDir)
        .filter((d) => d.startsWith("linux-"))
        .sort()
        .reverse(); // highest version first
      for (const dir of linuxDirs) {
        // Newer puppeteer uses chrome-linux64/chrome; older builds use chrome-linux/chrome
        for (const sub of ["chrome-linux64", "chrome-linux"]) {
          const candidate = path.join(chromeDir, dir, sub, "chrome");
          if (existsSync(candidate)) {
            logger.info({ candidate }, "Found Puppeteer-bundled Chrome");
            return candidate;
          }
        }
      }
    }
  } catch { /* continue */ }

    // Azure App Service / Microsoft-hosted environments:
  // Playwright pre-installs Chromium at /ms-playwright/.
  // When getChromiumPath() returns undefined, puppeteer-extra's internal
  // fallback resolves to the same directory but with an incorrect subpath —
  // scan it ourselves so we always return a working executable on Azure.
  try {
    const msDir = "/ms-playwright";
    if (existsSync(msDir)) {
      const chromiumDirs = readdirSync(msDir)
        .filter((d) => /^chromium-/.test(d))
        .sort()
        .reverse(); // highest revision first
      for (const d of chromiumDirs) {
        for (const sub of ["chrome-linux64", "chrome-linux"]) {
          for (const bin of ["chrome", "chromium", "chromium-browser"]) {
            const candidate = path.join(msDir, d, sub, bin);
            if (existsSync(candidate)) {
              logger.info(
                { candidate },
                "Found Azure Playwright pre-installed Chromium",
              );
              return candidate;
            }
          }
        }
      }
    }
  } catch { /* continue */ }

  logger.warn(
    "getChromiumPath: no Chromium binary found in any known location — " +
    "puppeteer will attempt its own internal path resolution which may fail. " +
    "Set PUPPETEER_EXECUTABLE_PATH or run `puppeteer browsers install chrome`.",
  );
  return undefined;
}
export type RuleType = "Issue" | "Potential Issue" | "Best Practice";
export interface RuleMeta {
  type: RuleType;
  description: string;
  remediation: string;
}
export interface ScanIssue {
  ruleId: string;
  type: RuleType;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  element: string | null;
  wcagCriteria: string | null;
  wcagLevel: string | null;
  selector: string | null;
  remediation: string | null;
  legal?: {
    ada: string[];
    eaa: boolean;
  };
  bboxX?: number | null;
  bboxY?: number | null;
  bboxWidth?: number | null;
  bboxHeight?: number | null;
}

export interface PageScanResult {
  url: string;
  issues: ScanIssue[];
  error?: string;
  notAvailable?: boolean;
  screenshot?: string;
  pageHtml?: string;
  loadDurationMs?: number;
}

const WCAG_MAPPING: Record<string, { sc: string[]; level: string[] }> = {
  "SIA-R1":   { sc: ["2.4.2"],                   level: ["A"] },
  "SIA-R2":   { sc: ["1.1.1"],                   level: ["A"] },
  "SIA-R3":   { sc: ["4.1.1"],                   level: ["A"] },
  "SIA-R4":   { sc: ["3.1.1"],                   level: ["A"] },
  "SIA-R5":   { sc: ["3.1.1"],                   level: ["A"] },
  "SIA-R6":   { sc: ["3.1.1"],                   level: ["A"] },
  "SIA-R7":   { sc: ["3.1.2"],                   level: ["AA"] },
  "SIA-R8":   { sc: ["1.3.1", "4.1.2"],          level: ["A"] },
  "SIA-R9":   { sc: ["2.2.1"],                   level: ["A"] },
  "SIA-R10":  { sc: ["1.3.5"],                   level: ["AA"] },
  "SIA-R11":  { sc: ["2.4.4"],                   level: ["A"] },
  "SIA-R12":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R13":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R14":  { sc: ["2.5.3"],                   level: ["A"] },
  "SIA-R15":  { sc: ["2.4.1"],                   level: ["A"] },
  "SIA-R16":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R17":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R18":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R19":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R20":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R21":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R22":  { sc: ["1.2.2"],                   level: ["A"] },
  "SIA-R23":  { sc: ["1.2.1"],                   level: ["A"] },
  "SIA-R24":  { sc: ["1.2.3"],                   level: ["A"] },
  "SIA-R25":  { sc: ["1.2.5"],                   level: ["AA"] },
  "SIA-R26":  { sc: ["1.2.1"],                   level: ["A"] },
  "SIA-R27":  { sc: ["1.2.2"],                   level: ["A"] },
  "SIA-R28":  { sc: ["1.1.1", "4.1.2"],          level: ["A"] },
  "SIA-R29":  { sc: ["1.2.1"],                   level: ["A"] },
  "SIA-R30":  { sc: ["1.4.6"],                   level: ["AAA"] },
  "SIA-R31":  { sc: ["1.4.8"],                   level: ["AAA"] },
  "SIA-R32":  { sc: ["2.5.5"],                   level: ["AAA"] },
  "SIA-R33":  { sc: ["1.2.1"],                   level: ["A"] },
  "SIA-R34":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R35":  { sc: ["1.2.1"],                   level: ["A"] },
  "SIA-R36":  { sc: ["1.2.1"],                   level: ["A"] },
  "SIA-R37":  { sc: ["1.2.5"],                   level: ["AA"] },
  "SIA-R38":  { sc: ["1.2.3", "1.2.5", "1.2.8"], level: ["A", "AA", "AAA"] },
  "SIA-R39":  { sc: ["1.1.1"],                   level: ["A"] },
  "SIA-R40":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R41":  { sc: ["2.4.4"],                   level: ["A"] },
  "SIA-R42":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R43":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R44":  { sc: ["1.3.4"],                   level: ["AA"] },
  "SIA-R45":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R46":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R47":  { sc: ["1.4.4"],                   level: ["AA"] },
  "SIA-R48":  { sc: ["1.4.2"],                   level: ["A"] },
  "SIA-R49":  { sc: ["1.4.2"],                   level: ["A"] },
  "SIA-R50":  { sc: ["1.4.2"],                   level: ["A"] },
  "SIA-R51":  { sc: ["1.4.2"],                   level: ["A"] },
  "SIA-R52":  { sc: ["2.4.4"],                   level: ["A"] },
  "SIA-R53":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R54":  { sc: ["4.1.3"],                   level: ["AA"] },
  "SIA-R55":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R56":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R57":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R58":  { sc: ["2.4.1"],                   level: ["A"] },
  "SIA-R59":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R60":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R61":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R62":  { sc: ["1.4.1"],                   level: ["A"] },
  "SIA-R63":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R64":  { sc: ["2.4.6"],                   level: ["AA"] },
  "SIA-R65":  { sc: ["2.4.7"],                   level: ["AA"] },
  "SIA-R66":  { sc: ["1.4.6"],                   level: ["AAA"] },
  "SIA-R67":  { sc: ["1.1.1"],                   level: ["A"] },
  "SIA-R68":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R69":  { sc: ["1.4.3"],                   level: ["AA"] },
  "SIA-R70":  { sc: ["4.1.1"],                   level: ["A"] },
  "SIA-R71":  { sc: ["1.4.8"],                   level: ["AAA"] },
  "SIA-R72":  { sc: ["1.4.8"],                   level: ["AAA"] },
  "SIA-R73":  { sc: ["1.4.12"],                  level: ["AA"] },
  "SIA-R74":  { sc: ["1.4.4"],                   level: ["AA"] },
  "SIA-R75":  { sc: ["1.4.4"],                   level: ["AA"] },
  "SIA-R76":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R77":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R78":  { sc: ["2.4.6"],                   level: ["AA"] },
  "SIA-R79":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R80":  { sc: ["1.4.12"],                  level: ["AA"] },
  "SIA-R81":  { sc: ["2.4.4"],                   level: ["A"] },
  "SIA-R82":  { sc: ["3.3.1"],                   level: ["A"] },
  "SIA-R83":  { sc: ["1.4.4"],                   level: ["AA"] },
  "SIA-R84":  { sc: ["2.1.1"],                   level: ["A"] },
  "SIA-R85":  { sc: ["1.4.8"],                   level: ["AAA"] },
  "SIA-R86":  { sc: ["1.1.1"],                   level: ["A"] },
  "SIA-R87":  { sc: ["2.4.1"],                   level: ["A"] },
  "SIA-R88":  { sc: ["1.4.3"],                   level: ["AA"] },
  "SIA-R89":  { sc: ["1.4.6"],                   level: ["AAA"] },
  "SIA-R90":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R91":  { sc: ["1.4.12"],                  level: ["AA"] },
  "SIA-R92":  { sc: ["1.4.12"],                  level: ["AA"] },
  "SIA-R93":  { sc: ["1.4.12"],                  level: ["AA"] },
  "SIA-R94":  { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R95":  { sc: ["2.1.1"],                   level: ["A"] },
  "SIA-R96":  { sc: ["2.2.1"],                   level: ["A"] },
  "SIA-R97":  { sc: ["2.4.1"],                   level: ["A"] },
  "SIA-R98":  { sc: ["2.4.1"],                   level: ["A"] },
  "SIA-R99":  { sc: ["1.3.1"],                   level: ["A"] },
  "SIA-R100": { sc: ["2.4.1"],                   level: ["A"] },
  "SIA-R101": { sc: ["2.4.1"],                   level: ["A"] },
  "SIA-R102": { sc: ["2.4.1"],                   level: ["A"] },
  "SIA-R103": { sc: ["1.4.3"],                   level: ["AA"] },
  "SIA-R104": { sc: ["1.4.6"],                   level: ["AAA"] },
  "SIA-R105": { sc: [],                          level: [""] },
  "SIA-R106": { sc: [],                          level: [""] },
  "SIA-R107": { sc: [],                          level: [""] },
  "SIA-R108": { sc: [],                          level: [""] },
  "SIA-R109": { sc: ["3.1.1"],                   level: ["A"] },
  "SIA-R110": { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R111": { sc: ["2.5.5"],                   level: ["AAA"] },
  "SIA-R112": { sc: [],                          level: [""] },
  "SIA-R113": { sc: ["2.5.8"],                   level: ["AA"] },
  "SIA-R114": { sc: ["2.4.2"],                   level: ["A"] },
  "SIA-R115": { sc: ["2.4.6"],                   level: ["AA"] },
  "SIA-R116": { sc: ["4.1.2"],                   level: ["A"] },
  "SIA-R117": { sc: ["1.1.1"],                   level: ["A"] },
};

const RULE_DESCRIPTIONS: Record<
  string,
  { type: RuleType; description: string; remediation: string }
> = {
  "SIA-R1": {
    type: "Issue",
    description: "Page has no title",
    remediation: "Add a descriptive <title> element in the <head>",
  },
  "SIA-R2": {
    type: "Issue",
    description: "Image without a text alternative",
    remediation:
      "Provide meaningful alt text or use alt='' for decorative images",
  },
  "SIA-R3": {
    type: "Issue",
    description: "Element IDs are not unique",
    remediation: "Ensure all id attributes are unique within the page",
  },
  "SIA-R4": {
    type: "Issue",
    description: "Page language has not been identified",
    remediation: "Add a valid lang attribute to the <html> element",
  },
  "SIA-R5": {
    type: "Issue",
    description: "Page language is not valid",
    remediation: "Use a valid BCP 47 language code (e.g., en, en-US)",
  },
  "SIA-R6": {
    type: "Potential Issue",
    description: "Language declarations are inconsistent",
    remediation: "Ensure consistent and correct use of lang attributes",
  },
  "SIA-R7": {
    type: "Potential Issue",
    description: "Content language changes are not identified",
    remediation: "Use lang attributes on elements where language changes",
  },
  "SIA-R8": {
    type: "Issue",
    description: "Form field missing a label",
    remediation:
      "Associate labels using <label>, aria-label, or aria-labelledby",
  },
  "SIA-R9": {
    type: "Issue",
    description:
      "Page refreshes, redirects, or changes context without warning",
    remediation:
      "Avoid automatic changes of context or notify users before they occur",
  },
  "SIA-R10": {
    type: "Issue",
    description:
      "Input fields for personal data are missing autocomplete attributes",
    remediation:
      "Add appropriate autocomplete attributes (e.g., name, email, address)",
  },
  "SIA-R11": {
    type: "Issue",
    description: "Link does not have a discernible name",
    remediation: "Provide descriptive link text or accessible name",
  },
  "SIA-R12": {
    type: "Issue",
    description: "Button does not have a discernible name",
    remediation: "Provide visible text or aria-label for buttons",
  },
  "SIA-R13": {
    type: "Issue",
    description: "Inline frame does not have an accessible name",
    remediation: "Add a descriptive title attribute to iframe elements",
  },
  "SIA-R14": {
    type: "Issue",
    description: "Visible label & accessible name do not match",
    remediation: "Ensure accessible name contains the visible label text",
  },
  "SIA-R15": {
    type: "Potential Issue",
    description: "Multiple frames have identical accessible names",
    remediation: "Ensure each frame has a unique and descriptive title",
  },
  "SIA-R16": {
    type: "Issue",
    description: "Required ARIA attribute is missing",
    remediation: "Ensure ARIA roles include all required states and properties",
  },
  "SIA-R17": {
    type: "Issue",
    description: "Hidden content contains focusable elements",
    remediation:
      "Remove focusable elements from hidden content or make them visible",
  },
  "SIA-R18": {
    type: "Issue",
    description: "Unsupported ARIA attribute is used",
    remediation: "Use only supported ARIA attributes for the given role",
  },
  "SIA-R19": {
    type: "Issue",
    description: "Invalid value for ARIA attribute",
    remediation: "Use valid values for ARIA attributes",
  },
  "SIA-R20": {
    type: "Issue",
    description: "Invalid ARIA attribute is used",
    remediation: "Remove or correct invalid ARIA attributes",
  },
  "SIA-R21": {
    type: "Issue",
    description: "Invalid ARIA role is used",
    remediation: "Use valid ARIA roles defined in the specification",
  },
  "SIA-R22": {
    type: "Issue",
    description: "Video does not have captions",
    remediation: "Provide captions using <track kind='captions'>",
  },
  "SIA-R23": {
    type: "Issue",
    description: "Audio or video does not have a transcript or alternative",
    remediation: "Provide a transcript or equivalent alternative content",
  },
  "SIA-R24": {
    type: "Issue",
    description: "Video element visual content has no transcript",
    remediation: "Provide a text transcript or equivalent media alternative that describes all visual content in the video",
  },
  "SIA-R25": {
    type: "Issue",
    description: "Video element visual content has no audio description",
    remediation: "Provide an audio description track or an alternative version of the video that describes all visual information",
  },
  "SIA-R26": {
    type: "Best Practice",
    description: "Abbreviation does not have an expansion",
    remediation: "Use <abbr> with a title attribute to provide expansion",
  },
  "SIA-R27": {
    type: "Issue",
    description: "Audio-only content does not have a transcript",
    remediation: "Provide a transcript for audio-only content",
  },
  "SIA-R28": {
    type: "Issue",
    description: "Image button does not have a text alternative",
    remediation: "Provide alt text or accessible name for image buttons",
  },
  "SIA-R29": {
    type: "Issue",
    description: "Video-only content does not have an alternative",
    remediation: "Provide text alternative or audio description",
  },
  "SIA-R30": {
    type: "Issue",
    description: "Enhanced contrast is insufficient",
    remediation:
      "Ensure a contrast ratio of at least 7:1 for enhanced contrast",
  },
  "SIA-R31": {
    type: "Issue",
    description: "Line height is below recommended minimum",
    remediation:
      "Set line-height to at least 1.5 times the font size to improve readability, especially for users with dyslexia or low vision",
  },
  "SIA-R32": {
    type: "Issue",
    description: "Target size is too small",
    remediation:
      "Ensure interactive elements have a minimum size of 24×24 pixels or equivalent spacing",
  },
  "SIA-R33": {
    type: "Potential Issue",
    description: "Media alternative may be insufficient",
    remediation: "Ensure alternatives convey equivalent information",
  },
  "SIA-R34": {
    type: "Potential Issue",
    description: "Heading is not followed by content",
    remediation: "Ensure headings are followed by meaningful content",
  },
  "SIA-R35": {
    type: "Best Practice",
    description: "Content is not placed within landmark regions",
    remediation: "Use semantic landmarks (e.g., <main>, <nav>, <header>)",
  },
  "SIA-R36": {
    type: "Issue",
    description: "Unsupported ARIA usage",
    remediation: "Remove or correct invalid ARIA usage",
  },
  "SIA-R37": {
    type: "Issue",
    description: "Video does not have audio description",
    remediation: "Provide audio description or alternative version",
  },
  "SIA-R38": {
    type: "Potential Issue",
    description: "Video alternative may be incomplete",
    remediation: "Ensure video alternatives fully describe visual content",
  },
  "SIA-R39": {
    type: "Issue",
    description: "Image filename used as alternative text",
    remediation: "Replace filename with meaningful alternative text",
  },
  "SIA-R40": {
    type: "Potential Issue",
    description: "Landmark region does not have an accessible name",
    remediation: "Provide accessible names for landmark regions",
  },
  "SIA-R41": {
    type: "Issue",
    description: "Links with identical text have different purposes",
    remediation:
      "Ensure links with same text point to same destination or differentiate them",
  },
  "SIA-R42": {
    type: "Issue",
    description: "ARIA role is not used in the correct context",
    remediation: "Ensure ARIA roles are used within required parent elements",
  },
  "SIA-R43": {
    type: "Issue",
    description: "SVG or graphical element lacks accessible name",
    remediation: "Provide <title> or aria-label for SVG elements",
  },
  "SIA-R44": {
    type: "Best Practice",
    description: "Page orientation is restricted",
    remediation: "Allow both portrait and landscape orientations",
  },
  "SIA-R45": {
    type: "Issue",
    description: "Table headers are not properly defined",
    remediation: "Use <th> elements with scope or headers attributes",
  },
  "SIA-R46": {
    type: "Issue",
    description: "Table cells are not associated with headers",
    remediation: "Ensure <td> elements are properly linked to headers",
  },
  "SIA-R47": {
    type: "Issue",
    description: "Zooming is restricted",
    remediation: "Avoid disabling zoom via viewport settings",
  },
  "SIA-R48": {
    type: "Issue",
    description: "Audio or media plays automatically",
    remediation: "Avoid autoplay or provide controls to stop audio",
  },
  "SIA-R49": {
    type: "Issue",
    description: "Auto-playing media does not have a control mechanism",
    remediation: "Provide visible controls (play/pause/stop) for any media that plays automatically",
  },
  "SIA-R50": {
    type: "Issue",
    description: "Audio cannot be paused or stopped",
    remediation: "Provide controls to pause or stop audio",
  },
  "SIA-R51": {
    type: "Issue",
    description: "Audio control is missing",
    remediation: "Provide a mechanism to control audio playback",
  },
  "SIA-R52": {
    type: "Issue",
    description: "Adjacent links reference the same resource",
    remediation: "Combine adjacent links that point to the same destination into a single link to reduce redundant navigation",
  },
  "SIA-R53": {
    type: "Issue",
    description: "Headings are not structured properly",
    remediation: "Ensure logical heading order (h1 → h2 → h3)",
  },
  "SIA-R54": {
    type: "Best Practice",
    description: "aria-live='assertive' region is not aria-atomic='true'",
    remediation:
      "Add aria-atomic='true' to assertive live regions to prevent partial/confusing announcements to screen readers",
  },
  "SIA-R55": {
    type: "Potential Issue",
    description:
      "Same-role landmarks share identical accessible names — content may differ",
    remediation:
      "Give each landmark region a unique accessible name via aria-label or aria-labelledby",
  },
  "SIA-R56": {
    type: "Potential Issue",
    description:
      "Multiple landmarks of the same role need unique accessible names",
    remediation:
      "Add distinct aria-label or aria-labelledby to each landmark of the same type (e.g. multiple <nav> elements)",
  },
  "SIA-R57": {
    type: "Issue",
    description: "Perceivable text content is not inside a landmark region",
    remediation: "Wrap all visible text content inside landmark regions such as <main>, <nav>, <header>, or <footer>",
  },
  "SIA-R58": {
    type: "Best Practice",
    description: "Skip link may be missing",
    remediation: "Provide a skip to main content link",
  },
  "SIA-R59": {
    type: "Issue",
    description: "Page does not contain any headings",
    remediation: "Add meaningful heading structure",
  },
  "SIA-R60": {
    type: "Issue",
    description: "Grouped form controls do not have an accessible name",
    remediation: "Use <fieldset> and <legend> to group related controls",
  },
  "SIA-R61": {
    type: "Potential Issue",
    description: "Page does not start with a level 1 heading",
    remediation: "Ensure the page starts with a meaningful <h1> element",
  },
  "SIA-R62": {
    type: "Issue",
    description: "Links are not visually distinguishable",
    remediation: "Ensure links are distinguishable beyond color alone",
  },
  "SIA-R63": {
    type: "Issue",
    description: "Embedded object does not have a text alternative",
    remediation: "Provide alternative content or fallback text",
  },
  "SIA-R64": {
    type: "Potential Issue",
    description: "Heading is empty",
    remediation: "Ensure headings contain meaningful text",
  },
  "SIA-R65": {
    type: "Issue",
    description: "Focus indicator is not visible",
    remediation: "Ensure keyboard focus is clearly visible",
  },
  "SIA-R66": {
    type: "Issue",
    description: "Enhanced contrast is insufficient",
    remediation: "Ensure contrast ratio of at least 7:1",
  },
  "SIA-R67": {
    type: "Best Practice",
    description: "Decorative images are exposed to assistive technologies",
    remediation: "Use alt='' or aria-hidden='true' for decorative images",
  },
  "SIA-R68": {
    type: "Issue",
    description: "ARIA role is missing required child elements",
    remediation: "Ensure elements with ARIA roles that require specific children (e.g. list → listitem, grid → row) contain the expected child roles",
  },
  "SIA-R69": {
    type: "Issue",
    description: "Text contrast is insufficient",
    remediation:
      "Ensure contrast ratio is at least 4.5:1 (or 3:1 for large text)",
  },
  "SIA-R70": {
    type: "Best Practice",
    description: "Deprecated HTML element is used",
    remediation: "Replace deprecated elements with modern HTML equivalents",
  },
  "SIA-R71": {
    type: "Best Practice",
    description: "Paragraph text is fully justified",
    remediation:
      "Avoid text-align:justify on paragraphs — justified text creates uneven word spacing that harms readability",
  },
  "SIA-R72": {
    type: "Best Practice",
    description: "Text is written in all capital letters",
    remediation: "Avoid using all caps for readability",
  },
  "SIA-R73": {
    type: "Best Practice",
    description: "Line height is below minimum value",
    remediation:
      "Ensure line-height is at least 1.5× the font size for readability",
  },
  "SIA-R74": {
    type: "Best Practice",
    description: "Font size is fixed",
    remediation: "Use relative units such as em or rem",
  },
  "SIA-R75": {
    type: "Issue",
    description: "Font size is below the minimum of 9px",
    remediation:
      "Increase font size to at least 9px — text smaller than this is extremely difficult to read",
  },
  "SIA-R76": {
    type: "Issue",
    description: "Table header is missing or incorrectly defined",
    remediation: "Use proper <th> elements for table headers",
  },
  "SIA-R77": {
    type: "Potential Issue",
    description: "Table data cell is not assigned to a header cell",
    remediation:
      "Use scope on <th> elements or the headers attribute on <td> to explicitly associate data cells with headers",
  },
  "SIA-R78": {
    type: "Potential Issue",
    description: "Consecutive same-level headings have no content between them",
    remediation: "Ensure headings of the same level are separated by meaningful content, not placed consecutively",
  },
  "SIA-R79": {
    type: "Best Practice",
    description:
      "Preformatted text not wrapped in <code>/<kbd>/<samp> and not inside <figure>",
    remediation:
      "Wrap content inside <pre> in <code>, <kbd>, or <samp>, or place the <pre> inside a <figure> element",
  },
  "SIA-R84(link)": {
    type: "Best Practice",
    description: "Link opens in a new window/tab without warning",
    remediation:
      "Add visible text like '(opens in new tab)' or a visually-hidden equivalent inside the link",
  },
  "SIA-R80": {
    type: "Best Practice",
    description: "Line height is fixed",
    remediation: "Allow flexible line-height for better readability",
  },
  "SIA-R81": {
    type: "Issue",
    description: "Links with identical text lead to different destinations",
    remediation: "Ensure link text uniquely describes its destination",
  },
  "SIA-R82": {
    type: "Issue",
    description: "Form error message does not describe the invalid value",
    remediation: "Provide error messages that clearly explain what is wrong with the user's input and how to fix it",
  },
  "SIA-R83": {
    type: "Issue",
    description: "Text is clipped when resized",
    remediation: "Avoid fixed heights and overflow that clips text",
  },
  "SIA-R84": {
    type: "Issue",
    description: "Scrollable element is not keyboard accessible",
    remediation: "Ensure scrollable regions can be accessed via keyboard",
  },
  "SIA-R85": {
    type: "Best Practice",
    description: "Text uses excessive italics",
    remediation: "Limit use of italic text for readability",
  },
  "SIA-R86": {
    type: "Best Practice",
    description: "Presentational element is exposed to assistive technologies",
    remediation: "Hide purely decorative elements from assistive technologies",
  },
  "SIA-R87": {
    type: "Best Practice",
    description: "Skip link is missing",
    remediation: "Provide a skip to main content link",
  },
  "SIA-R88": {
    type: "Issue",
    description: "Text contrast is insufficient",
    remediation: "Ensure text meets minimum contrast ratio (4.5:1 AA, 7:1 AAA)",
  },
  "SIA-R89": {
    type: "Best Practice",
    description: "Enhanced contrast is insufficient (AAA)",
    remediation: "Ensure contrast ratio of at least 7:1 where required",
  },
 "SIA-R90": {
    type: "Issue",
    description: "Role with implied hidden content has keyboard focus",
    remediation:
      "Remove nested interactive content from elements with interactive ARIA roles, and ensure focusable elements are not inside opacity:0 containers",
  },
  "SIA-R91": {
    type: "Best Practice",
    description: "Letter spacing is insufficient",
    remediation: "Ensure letter spacing is at least 0.12em",
  },
  "SIA-R92": {
    type: "Best Practice",
    description: "Word spacing is insufficient",
    remediation: "Ensure word spacing is at least 0.16em",
  },
  "SIA-R93": {
    type: "Best Practice",
    description: "Line height is insufficient",
    remediation: "Ensure line height is at least 1.5",
  },
  "SIA-R94": {
    type: "Issue",
    description: "Menu item does not have an accessible name",
    remediation: "Provide visible text or aria-label for menu items",
  },
  "SIA-R95": {
    type: "Issue",
    description: "Keyboard interaction is not supported",
    remediation: "Ensure all interactive elements are operable via keyboard",
  },
  "SIA-R96": {
    type: "Potential Issue",
    description: "Page refresh or update occurs without warning",
    remediation: "Avoid automatic updates or notify users before changes",
  },
  "SIA-R97": {
    type: "Potential Issue",
    description: "Collapsible content may not be accessible",
    remediation: "Ensure proper ARIA attributes and keyboard interaction",
  },
  "SIA-R98": {
    type: "Potential Issue",
    description: "Main content may lack a heading",
    remediation: "Ensure main content starts with a heading",
  },
  "SIA-R99": {
    type: "Potential Issue",
    description: "Main landmark is missing",
    remediation: "Add a <main> element to define primary content",
  },
  "SIA-R100": {
    type: "Best Practice",
    description: "PDF does not have an accessible alternative",
    remediation: "Provide an accessible HTML alternative",
  },
  "SIA-R101": {
    type: "Best Practice",
    description: "Skip link is missing",
    remediation: "Provide a skip to main content link",
  },
  "SIA-R102": {
    type: "Best Practice",
    description: "Skip link is missing",
    remediation: "Ensure a skip link is available for keyboard users",
  },
  "SIA-R103": {
    type: "Issue",
    description: "Text contrast is insufficient",
    remediation: "Ensure contrast ratio meets WCAG requirements",
  },
  "SIA-R104": {
    type: "Issue",
    description: "Enhanced contrast is insufficient",
    remediation: "Ensure contrast ratio is at least 7:1 where required",
  },
  "SIA-R105": {
    type: "Issue",
    description: "Links with identical text lead to different destinations",
    remediation: "Ensure link text clearly describes destination",
  },
  "SIA-R106": {
    type: "Issue",
    description: "Invalid ARIA usage detected",
    remediation: "Correct invalid ARIA attributes and roles",
  },
  "SIA-R107": {
    type: "Issue",
    description: "Element is not accessible via keyboard",
    remediation: "Ensure all interactive elements are keyboard accessible",
  },
  "SIA-R108": {
    type: "Issue",
    description: "ARIA attributes are misused",
    remediation: "Use ARIA attributes correctly according to specification",
  },
  "SIA-R109": {
    type: "Issue",
    description: "Page language does not match content",
    remediation: "Ensure lang attribute reflects the page language",
  },
  "SIA-R110": {
    type: "Issue",
    description: "Invalid ARIA role value used",
    remediation: "Use valid ARIA roles",
  },
  "SIA-R111": {
    type: "Issue",
    description: "Target size is too small (enhanced)",
    remediation: "Ensure interactive elements are at least 44×44 pixels",
  },
  "SIA-R112": {
    type: "Issue",
    description: "Semantic structure is missing or incorrect",
    remediation: "Use proper semantic HTML elements",
  },
  "SIA-R113": {
    type: "Issue",
    description: "Touch target size is too small",
    remediation:
      "Ensure interactive elements are at least 24×24 pixels or have sufficient spacing",
  },
  "SIA-R114": {
    type: "Issue",
    description: "Page title is not descriptive",
    remediation: "Provide a meaningful and descriptive <title> element",
  },
  "SIA-R115": {
    type: "Best Practice",
    description: "Heading is not descriptive",
    remediation: "Use clear and meaningful headings that describe content",
  },
  "SIA-R116": {
    type: "Issue",
    description: "Summary element does not have an accessible name",
    remediation:
      "Provide an accessible name using visible text, aria-label, or aria-labelledby",
  },
  "SIA-R117": {
    type: "Issue",
    description: "Image does not have an accessible name",
    remediation: "Provide appropriate alt text or aria-label for images",
  },
};

// Persistent profile dir — preserves Cloudflare clearance cookies across restarts
const CHROME_PROFILE_DIR = path.join(process.cwd(), ".chrome-profile");
try {
  mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
} catch {
  /* already exists */
}

const LOCK_NAMES = ["SingletonLock", "SingletonCookie", "SingletonSocket"];

/** Remove stale Chrome singleton lock files from a given directory */
function removeLocks(dir: string): void {
  for (const name of LOCK_NAMES) {
    const f = path.join(dir, name);
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

/**
 * Remove stale Chrome singleton lock files from the profile dir and all
 * immediate subdirectories (covers proxy/, session-* dirs, etc.).
 */
function clearChromeLocks(): void {
  removeLocks(CHROME_PROFILE_DIR);
  // Sweep one level of subdirs so proxy/ and stale session-* dirs are cleaned
  try {
    for (const entry of readdirSync(CHROME_PROFILE_DIR, {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) {
        removeLocks(path.join(CHROME_PROFILE_DIR, entry.name));
      }
    }
  } catch {
    // profile dir may not exist yet — ignore
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

  const executablePath = getChromiumPath();
  logger.info(
    {
      profileDir: CHROME_PROFILE_DIR,
      executablePath: executablePath ?? "(puppeteer internal default)",
    },
    "Launching browser for accessibility scanning",
  );

  const launchOptions = {
    headless: true as const,
    executablePath,
    userDataDir: path.join(
      CHROME_PROFILE_DIR,
      `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ),
    args: PUPPETEER_LAUNCH_ARGS,
    // Cap how long Puppeteer waits for any single Chrome DevTools Protocol
    // message.  Without this the default (180 s) allows a stuck page.goto()
    // to hang far beyond our own hard-deadline timer.
    // Set slightly above the hard deadline (120 s page timeout + 30 s buffer + 5 s margin).
    protocolTimeout: 155_000,
  };

  // Cap the launch so a hung Chrome process never blocks forever.
  // 30 s is ample — a healthy launch takes < 5 s; anything longer means Chrome is stuck.
  const LAUNCH_TIMEOUT_MS = 30_000;

  // Retry up to 3 times with increasing delays.
  //
  // Why: on Azure App Service, startup.sh installs Chrome asynchronously
  // before starting Node. If a scan is created right as the server comes up
  // (e.g. orphan recovery kicks in before startup.sh finishes writing to
  // the cache), the first launch attempt will fail with "executablePath not
  // found". Waiting and retrying lets Chrome installation complete so the
  // next attempt succeeds — without failing the scan page permanently.
  //
  // The same retry also absorbs transient browser crashes: if Chrome was
  // killed by the OOM reaper between two mutex slots, the second attempt
  // (with a fresh userDataDir) succeeds normally.
  const MAX_LAUNCH_RETRIES = 3;
  const LAUNCH_RETRY_BASE_DELAY_MS = 5_000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_LAUNCH_RETRIES; attempt++) {
    try {
      browserInstance = await Promise.race([
        puppeteerExtra.launch(launchOptions) as Promise<Browser>,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Browser launch timed out after ${LAUNCH_TIMEOUT_MS}ms`),
              ),
            LAUNCH_TIMEOUT_MS,
          ),
        ),
      ]);

      browserInstance.on("disconnected", () => {
        logger.warn("Browser disconnected — will relaunch on next scan page");
        browserInstance = null;
      });

      if (attempt > 1) {
        logger.info({ attempt }, "Browser launched successfully after retry");
      }

      return browserInstance;
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);

      // Profile lock errors — clear locks before retrying
      if (
        msg.includes("SingletonLock") ||
        msg.includes("profile") ||
        msg.includes("already in use") ||
        msg.includes("process_singleton")
      ) {
        logger.warn({ error: msg, attempt }, "Browser launch failed with profile lock — clearing");
        clearChromeLocks();
      } else {
        logger.warn({ error: msg, attempt, maxAttempts: MAX_LAUNCH_RETRIES }, "Browser launch failed");
      }

      if (attempt < MAX_LAUNCH_RETRIES) {
        const delayMs = LAUNCH_RETRY_BASE_DELAY_MS * attempt; // 5s, 10s
        logger.info({ delayMs, attempt }, "Waiting before retrying browser launch");
        await new Promise<void>((r) => setTimeout(r, delayMs));
        // Re-resolve the path on each retry — startup.sh may have finished
        // installing Chrome since the last attempt.
        launchOptions.executablePath = getChromiumPath();
        logger.info(
          { executablePath: launchOptions.executablePath ?? "(puppeteer internal default)" },
          "Retrying browser launch",
        );
      }
    }
  }

  throw lastErr;
}


/**
 * Scroll through the entire page to trigger lazy-loaded content, then wait
 * for the DOM to stabilise (no new nodes for 800ms or max 8s).
 */
async function fullyRenderPage(page: Page, timeout: number): Promise<void> {
  // Get total page height
  const totalHeight: number = await page.evaluate(
    () => document.body.scrollHeight,
  );
  const viewportHeight = 900;
  const scrollStep = Math.max(viewportHeight, 400);

  for (let scrolled = 0; scrolled < totalHeight; scrolled += scrollStep) {
    await page.evaluate((y: number) => window.scrollTo(0, y), scrolled);
    // Short pause between scroll steps so lazy loaders can fire
    await new Promise((r) => setTimeout(r, 300));
  }

  // Scroll back to top so layout is representative of what a user sees
  await page.evaluate(() => window.scrollTo(0, 0));

  // Wait for DOM to stabilise: poll node count every 500ms until stable
  const stabiliseDeadline = Date.now() + Math.min(timeout * 0.4, 8000);
  let prevCount = -1;
  while (Date.now() < stabiliseDeadline) {
    const count: number = await page.evaluate(
      () => document.querySelectorAll("*").length,
    );
    if (count === prevCount) break;
    prevCount = count;
    await new Promise((r) => setTimeout(r, 500));
  }

  // Final pause to let any post-render JS finish
  await new Promise((r) => setTimeout(r, 1000));
}

// ─── Proxy browser management ─────────────────────────────────────────────────
// Proxy scans need a separate Chromium instance launched with --proxy-pac-url.
// We cache one proxy browser per PAC URL to avoid relaunching on every page.
let _proxyBrowserInstance: Browser | null = null;
let _currentProxyPac: string | null = null;

async function getProxyBrowser(proxyPacUrl: string): Promise<Browser> {
  // Reuse if same PAC URL and browser is still connected
  if (
    _proxyBrowserInstance &&
    _proxyBrowserInstance.connected &&
    _currentProxyPac === proxyPacUrl
  ) {
    return _proxyBrowserInstance;
  }

  // Close old proxy browser if PAC URL changed
  if (_proxyBrowserInstance && _proxyBrowserInstance.connected) {
    await _proxyBrowserInstance.close().catch(() => {});
    _proxyBrowserInstance = null;
  }

  // Use a fresh temp dir each time so stale SingletonLock files from a prior
  // container hostname never block the launch.
  const proxySessionDir = path.join(
    os.tmpdir(),
    `chrome-proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  logger.info({ proxyPacUrl, proxySessionDir }, "Launching proxy browser");

  _proxyBrowserInstance = await puppeteerExtra.launch({
    headless: true,

  executablePath:
    process.env.PUPPETEER_EXECUTABLE_PATH || "/ms-playwright/chromium-1169/chrome-linux/chrome",
    userDataDir: proxySessionDir,
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

export function scanPage(
  url: string,
  options: {
    timeout?: number;
    /** Post-load dwell time in ms — scanner waits this long after DOMContentLoaded, letting JS
     *  execute and render content, before running accessibility checks. Default 0. */
    scanDelayMs?: number;
    //waitForNetworkIdle?: boolean;
    bypassCSP?: boolean;
    rules?: string[];
    proxyPacUrl?: string;
    disableJavascript?: boolean;
    onStage?: (stage: string) => void | Promise<void>;
    signal?: AbortSignal;
  } = {},
): Promise<PageScanResult> {
  const result = _scanMutex.then(() => _scanPageInternal(url, options));
  // Advance mutex when the scan completes (success or error).
  // Safety valve: also advance after a hard cap in case _scanPageInternal hangs
  // before the abort handler is registered (e.g. Chrome crash inside getBrowser/newPage).
  // Without this the entire queue deadlocks permanently.
  const mutexCap = (options.timeout ?? 30_000) + (options.scanDelayMs ?? 0) + 90_000;
  _scanMutex = Promise.race([
    result.then(
      () => {},
      () => {},
    ),
    new Promise<void>((r) => setTimeout(r, mutexCap)),
  ]);
  return result;
}

async function _scanPageInternal(
  url: string,
  options: {
    timeout?: number;
   // waitForNetworkIdle?: boolean;
    scanDelayMs?: number;
    bypassCSP?: boolean;
    rules?: string[];
    proxyPacUrl?: string;
    disableJavascript?: boolean;
    onStage?: (stage: string) => void | Promise<void>;
    signal?: AbortSignal;
  } = {},
): Promise<PageScanResult> {
  const {
    timeout = 30_000,
   // waitForNetworkIdle = true,
    scanDelayMs = 0,
    bypassCSP = true,
    disableJavascript = false,
    onStage,
  } = options;

  let page: Page | null = null;
  // When the external hard-timeout AbortSignal fires, force-close the page so
  // that any pending page.goto() / page.evaluate() throws immediately and the
  // mutex is released for the next URL.
  let abortHandler: (() => void) | null = null;

  try {
    // Bail out early if already aborted before we even open a page
    if (options.signal?.aborted) {
      return { url, issues: [], error: "URL scan aborted before navigation" };
    }

    // Helper: race any promise against the abort signal so we can cancel even
    // before the Puppeteer page object exists (e.g. during getBrowser/newPage).
    function raceAbort<T>(promise: Promise<T>, label: string): Promise<T> {
      const sig = options.signal;
      if (!sig) return promise;
      if (sig.aborted)
        return Promise.reject(new Error(`${label}: already aborted`));
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new Error(`${label}: aborted by signal`));
        sig.addEventListener("abort", onAbort, { once: true });
        promise.then(
          (v) => {
            sig.removeEventListener("abort", onAbort);
            resolve(v);
          },
          (e) => {
            sig.removeEventListener("abort", onAbort);
            reject(e);
          },
        );
      });
    }

    const browser = await raceAbort(
      options.proxyPacUrl ? getProxyBrowser(options.proxyPacUrl) : getBrowser(),
      "getBrowser",
    );
    page = await raceAbort(browser.newPage(), "newPage");

    // Wire abort signal → force page close so any in-flight page ops throw immediately
    if (options.signal) {
      const capturedPage = page;
      abortHandler = () => {
        capturedPage.close().catch(() => {});
      };
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    if (bypassCSP) {
      await page.setBypassCSP(true);
    }
    if (disableJavascript) {
      await page.setJavaScriptEnabled(false);
    }

    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultNavigationTimeout(timeout);
    page.setDefaultTimeout(timeout);
  // Block resource types that are irrelevant for accessibility scanning.
    // Images, fonts, and media account for the vast majority of page weight and
    // are the most common reason navigations hang (slow CDN, large video streams,
    // infinite analytics beacons).  Blocking them cuts load time by 50–80% on
    // media-heavy pages without affecting any accessibility rule evaluation.
    // We keep: document, script, stylesheet, xhr, fetch, websocket, other —
    // scripts drive dynamic content & redirects; stylesheets affect computed
    // visibility used by several rules.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type === "image" || type === "media" || type === "font") {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });
    // Set a realistic Chrome user-agent and request headers to minimise bot detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Ch-Ua":
        '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    });

    logger.info({ url }, "Navigating to page");
    await onStage?.("navigating");
      // If navigation times out (e.g. a redirect loop, stuck resource, etc.) we do
    // NOT fail the page outright — instead we check whether the browser has a
    // usable DOM and, if so, continue scanning whatever loaded.  This prevents a
    // slow CDN asset or an infinite-loop redirect from taking out the entire URL.
    let httpResponse: Awaited<ReturnType<typeof page.goto>> = null;
    let loadDurationMs: number | undefined;
    const navStart = Date.now();
    let navigationTimedOut = false;
    try {
      httpResponse = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout,
      });
      loadDurationMs = Date.now() - navStart;
    } catch (navErr) {
      
      loadDurationMs = Date.now() - navStart;
      const msg = String(navErr).toLowerCase();
      const isTimeout = msg.includes("timeout") || msg.includes("timed out");
      const isAborted = msg.includes("aborted") || msg.includes("net::err_aborted");
      if (isTimeout || isAborted) {
        // Check whether the browser has a usable DOM before giving up
        const hasDOM = await page.evaluate(() => !!document.body?.innerHTML?.trim()).catch(() => false);
        if (!hasDOM) {
         return { url, issues: [], error: `Navigation did not load a usable page: ${String(navErr)}`, loadDurationMs };
        }
        navigationTimedOut = true;
        logger.info({ url, err: String(navErr) }, "Navigation timeout — continuing with partial DOM");
      } else {
        throw navErr;
      }
    }

    // Detect hard HTTP 4xx/5xx errors immediately (before any CF challenge handling).
    // 403 is intentionally excluded here — Cloudflare sometimes returns 403 instead of
    // a challenge page, so we let the stealth profile attempt a retry first.
    const httpStatus = httpResponse?.status() ?? 200;
    if (
      httpStatus === 404 ||
      httpStatus === 410 ||
      httpStatus >= 500
    ) {
      logger.info(
        { url, httpStatus },
        "HTTP error status — marking page as not available",
      );
      return {
        url,
        issues: [],
        notAvailable: true,
        error: `HTTP ${httpStatus} – Page Not Available`,
      };
    }
    const wasBlocked403 = httpStatus === 403;

    await onStage?.("rendering");

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
        !!document.querySelector(
          "#challenge-form, #cf-challenge-running, .cf-browser-verification, [id^='challenge-']",
        )
      );
    });

    if (isCfChallenge) {
      logger.info(
        { url },
        "Cloudflare challenge detected — waiting for it to resolve (up to 55s)",
      );
      // Phase 1: wait up to 30s for the JS challenge to execute and redirect
      try {
        await Promise.race([
          page.waitForNavigation({
            waitUntil: "domcontentloaded",
            timeout: 20000,
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 30000)),
        ]);
      } catch {
        /* expected if no navigation fires within 30s */
      }

      // Re-check: are we still on the challenge page?
      const stillOnChallenge = await page.evaluate((): boolean => {
        const title = document.title.toLowerCase();
        const bodyText = document.body?.innerText?.toLowerCase() ?? "";
        return (
          title.includes("just a moment") ||
          title.includes("please wait") ||
          title.includes("checking your browser") ||
          bodyText.includes("verifying your connection") ||
          bodyText.includes("checking your browser before accessing") ||
          bodyText.includes("enable javascript and cookies") ||
          !!document.querySelector(
            "#challenge-form, #cf-challenge-running, .cf-browser-verification, [id^='challenge-']",
          )
        );
      });

      if (stillOnChallenge) {
        // Phase 2: give it another 25s
        logger.info(
          { url },
          "Still on Cloudflare challenge — waiting an additional 25s",
        );
        try {
          await Promise.race([
            page.waitForNavigation({
              waitUntil: "domcontentloaded",
              timeout: 15000,
            }),
            new Promise<void>((resolve) => setTimeout(resolve, 25000)),
          ]);
        } catch {
          /* expected */
        }

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
          throw new Error(
            "Cloudflare Bot Protection blocked the scan — the page could not be reached. Try scanning from a browser with the cf_clearance cookie already set.",
          );
        }
      }

      // Extra pause for any post-redirect JS to settle
      await new Promise((r) => setTimeout(r, 2000));
      logger.info(
        { url, currentUrl: page.url() },
        "Cloudflare challenge resolved",
      );
    }

    // If the initial response was 403 and no CF challenge was visible, retry once.
    // Cloudflare sometimes returns 403 directly without showing a challenge page;
    // a second attempt with the warm stealth profile often gets through.
    if (wasBlocked403 && !isCfChallenge) {
      logger.info({ url }, "Initial 403 with no CF challenge — retrying with stealth profile");
      let retryStatus = 403;
      try {
        const retryResponse = await page.reload({ waitUntil: "domcontentloaded", timeout });
        retryStatus = retryResponse?.status() ?? 200;
      } catch {
        /* timeout or navigation error — treat as still blocked */
      }
      if (retryStatus === 403 || retryStatus === 404 || retryStatus === 410 || retryStatus >= 500) {
        logger.info({ url, retryStatus }, "Still blocked after retry — marking page as not available");
        return {
          url,
          issues: [],
          notAvailable: true,
          error: `HTTP ${retryStatus} – Page Not Available`,
        };
      }
      logger.info({ url, retryStatus }, "Retry succeeded — continuing with scan");
    }

    // Detect "page not available" content returned with a 200 status
    // (common on enterprise sites that have their own custom 404 pages)
    // Only check the page <title> and the first <h1> — checking full body text
    // causes false positives when nav/footer menus mention these phrases.
    const isContentNotAvailable = await page.evaluate((): boolean => {
      const title = document.title.toLowerCase();
      const h1 =
        (
          document.querySelector("h1") as HTMLElement | null
        )?.innerText?.toLowerCase() ?? "";
      const checks = [
        "that page is not available",
        "page is not available",
        "page not available",
        "this page is not available",
        "page cannot be found",
        "page could not be found",
        "page doesn't exist",
        "page does not exist",
        "404 not found",
        "error 404",
        "404 – not found",
        "404 - not found",
      ];
      return checks.some(
        (phrase) => title.includes(phrase) || h1.includes(phrase),
      );
    });

    if (isContentNotAvailable) {
      logger.info(
        { url },
        "Page content indicates 'not available' — skipping scan",
      );
      return {
        url,
        issues: [],
        notAvailable: true,
        error: "Page Not Available",
      };
    }
    // Confirm DOMContentLoaded state — HTML parsed, initial DOM built.
    // We scan this initial state without waiting for window.load or JS mutations,
    // so accessibility issues are reported on what the server actually sent.
    await page.evaluate(() => new Promise<void>((resolve) => {
      if (document.readyState === "interactive" || document.readyState === "complete") return resolve();
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
      setTimeout(resolve, 5000);
    }));

    // Detect and follow client-side redirects.
    // CMS/AEM platforms (and some SPA routers) serve an intermediate page with placeholder
    // attributes — e.g. lang="en-SOFTWAREVERSIONREDIRECT" or lang="clienlibs-KEYSIGHT" —
    // then redirect to the real content via <meta http-equiv="refresh"> or window.location.
    // Scanning the intermediate DOM produces false positives from placeholder content.
    // We detect redirect indicators and, if found, wait for the navigation to complete
    // then re-apply the full DOMContentLoaded → load → MutationObserver settle sequence
    // on the final page so the scanner always runs against the real content.
    const redirectInfo = await page.evaluate((): { hasMetaRefresh: boolean; invalidLang: boolean; lang: string } => {
      const lang = (document.documentElement.getAttribute("lang") ?? "").trim();
      const hasMetaRefresh = !!document.querySelector('meta[http-equiv="refresh"]');
      // Use Intl.getCanonicalLocales() to validate BCP 47 — it throws RangeError for any
      // invalid tag (e.g. "en-SOFTWAREVERSIONREDIRECT", "clienlibs-KEYSIGHT").
      // An invalid lang attribute on the <html> element is a reliable signal that the page
      // is still in an intermediate CMS/AEM state and a client-side redirect is pending.
      let invalidLang = false;
      if (lang.length > 0) {
        try {
          Intl.getCanonicalLocales(lang);
        } catch {
          invalidLang = true;
        }
      }
      return { hasMetaRefresh, invalidLang, lang };
    }).catch(() => ({ hasMetaRefresh: false, invalidLang: false, lang: "" }));

    if (redirectInfo.hasMetaRefresh || redirectInfo.invalidLang) {
      logger.info(
        { url, redirectInfo },
        "Intermediate/redirect page detected — waiting for final navigation (up to 15s)",
      );
      try {
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });
        const finalUrl = page.url();
        logger.info({ url, finalUrl }, "Client-side redirect followed — re-settling final page");
        // Confirm DOMContentLoaded on the final page
        await page.evaluate(() => new Promise<void>((resolve) => {
          if (document.readyState === "interactive" || document.readyState === "complete") return resolve();
          document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
          setTimeout(resolve, 5000);
        })).catch(() => {});
      } catch {
        logger.info({ url }, "Redirect navigation did not complete within 15s — scanning current page state");
      }
    }

    // Phase 1 — DOM stability wait.
    //
    // After DOMContentLoaded the HTML is parsed, but JS frameworks (React, Angular,
    // AEM etc.) still need time to mount their initial components and inject links,
    // images, and other content into the DOM.  Scanning at the literal DCL instant
    // means those elements don't exist yet, so rules like R11/R12 find nothing.
    //
    // We wait until DOM mutations have been quiet for DOM_QUIET_MS (300 ms),
    // capped at DOM_STABILITY_CAP_MS (1 s).  This fires BEFORE any post-load
    // setTimeout / requestAnimationFrame accessibility patches (which typically
    // run several seconds after load on SSR/AEM pages), matching Siteimprove's
    // effective scan point.  For SPAs, 1 s is enough for the framework to mount
    // its initial render.  Reducing from 4 s → 1 s ensures aria-label injection
    // scripts (which load after 4+ s on e.g. Keysight) haven't run yet.
    const DOM_QUIET_MS = 300;
    const DOM_STABILITY_CAP_MS = 1000;
    const domStabilityMs = await page.evaluate(
      ({ quietMs, capMs }: { quietMs: number; capMs: number }) =>
        new Promise<number>((resolve) => {
          const start = Date.now();
          let quietTimer: ReturnType<typeof setTimeout> | null = null;

          function settle() {
            if (quietTimer) clearTimeout(quietTimer);
            quietTimer = setTimeout(() => {
              observer.disconnect();
              resolve(Date.now() - start);
            }, quietMs);
          }

          const observer = new MutationObserver(settle);
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: false,
          });

          // Start the quiet timer immediately — resolves at once if DOM is already stable.
          settle();

          // Hard cap: never block more than capMs.
          setTimeout(() => {
            observer.disconnect();
            if (quietTimer) clearTimeout(quietTimer);
            resolve(Date.now() - start);
          }, capMs);
        }),
      { quietMs: DOM_QUIET_MS, capMs: DOM_STABILITY_CAP_MS },
    ).catch(() => 0);
    logger.info({ url, domStabilityMs }, "DOM stability settled");

    // Phase 2 — optional additional delay on top of the stable baseline.
    //
    // scanDelayMs = 0 (default): scan at the stable initial-render point (above).
    //   Issues patched by post-load JS (setTimeout, rAF) are still visible here —
    //   this matches Siteimprove's scan point.
    //
    // scanDelayMs > 0: wait this many extra milliseconds after stability settles.
    //   More JS runs during this time (aria-label injections, lazy-load fixes).
    //   Use only when you intentionally want to capture a later DOM state.
    if (scanDelayMs > 0) {
      logger.info({ url, scanDelayMs }, "Scan delay — waiting before accessibility checks");
      await new Promise<void>((resolve) => setTimeout(resolve, scanDelayMs));
    }

    // Capture a full-page snapshot and the rendered DOM before running rules
    let screenshot: string | undefined;
    let pageHtml: string | undefined;
    try {
      const screenshotBuffer = await page.screenshot({
        type: "jpeg",
        quality: 65,
        fullPage: true,
      });
      screenshot = Buffer.from(screenshotBuffer).toString("base64");
      logger.info({ url }, "Page snapshot captured");
    } catch (ssErr) {
      logger.warn(
        { url, err: ssErr },
        "Failed to capture page snapshot — continuing without it",
      );
    }
    try {
      pageHtml = await page.content();
    } catch (htmlErr) {
      logger.warn(
        { url, err: htmlErr },
        "Failed to capture page HTML — continuing without it",
      );
    }

    logger.info(
      { url },
      "Running SIA accessibility rules on fully-rendered DOM",
    );
    await onStage?.("analyzing");
    let issues = await runSIARules(page);
    logger.info({ url, issueCount: issues.length }, "SIA rules completed");
    issues = issues.map((issue) => {
      const wcag = WCAG_MAPPING[issue.ruleId];

      return {
        ...issue,
        wcagCriteria: wcag?.sc?.join(", ") || null,
        wcagLevel: wcag?.level?.join(", ") || null,
        legal: getLegalCompliance(wcag?.level || []),
      };
    });
    // If a rule filter was specified, only return issues matching those rule IDs
    if (options.rules && options.rules.length > 0) {
      const ruleSet = new Set(options.rules.map((r) => r.toUpperCase()));
      issues = issues.filter((i) => ruleSet.has(i.ruleId.toUpperCase()));
    }

    // Capture bounding boxes for each issue's element (for snapshot highlight overlay)
    if (issues.length > 0) {
      const bboxes = await page.evaluate(
        (selectors: (string | null)[]) => {
          return selectors.map((sel) => {
            if (!sel) return null;
            try {
              const el = document.querySelector(sel);
              if (!el) return null;
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) return null;
              return {
                x: Math.round(rect.left + window.scrollX),
                y: Math.round(rect.top + window.scrollY),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              };
            } catch {
              return null;
            }
          });
        },
        issues.map((i) => i.selector),
      );

      issues = issues.map((issue, idx) => ({
        ...issue,
        bboxX: bboxes[idx]?.x ?? null,
        bboxY: bboxes[idx]?.y ?? null,
        bboxWidth: bboxes[idx]?.width ?? null,
        bboxHeight: bboxes[idx]?.height ?? null,
      }));
      logger.info(
        { url, withBbox: bboxes.filter(Boolean).length },
        "Bounding boxes captured",
      );
    }

    return { url, issues, screenshot, pageHtml, loadDurationMs };
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
    // Always clean up the abort listener to avoid memory leaks
    if (abortHandler && options.signal) {
      options.signal.removeEventListener("abort", abortHandler);
    }
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
function getLegalCompliance(levels: string[] = []) {
  const isApplicable = levels.includes("A") || levels.includes("AA");

  return {
    ada: isApplicable ? ["Title II"] : [],
    eaa: isApplicable,
  };
}
async function runSIARules(page: Page): Promise<ScanIssue[]> {
  const results = await page.evaluate(() => {
    const results: Array<{
      ruleId: string;
      type: string;
      impact: string;
      description: string;
      element: string | null;
      selector: string | null;
    }> = [];

    // ─── HELPER: CSS selector generation ────────────────────────────────────
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
          const cls = current.className
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .join(".");
          if (cls) sel += `.${cls}`;
        }
        //const parent = current.parentElement;
        const parent: Element | null = current.parentElement;
        if (parent) {
          //const siblings = Array.from(parent.children);
          const siblings = Array.from(parent.children) as Element[];
          const sameTag = siblings.filter(
            (s) => s.tagName === current!.tagName,
          );
          if (sameTag.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            sel += `:nth-child(${idx})`;
          }
        }
        parts.unshift(sel);
        current = parent;
      }
      return parts.join(" > ");
    }

    function outerHtmlSnippet(el: Element): string {
      const clone = el.cloneNode(false) as Element;
      return clone.outerHTML.substring(0, 200);
    }

    // ─── HELPER: isRendered ──────────────────────────────────────────────────
    // Alfa "isRendered" = CSS-only visibility check (display:none / visibility:hidden /
    // aria-hidden / [hidden]). Does NOT use getBoundingClientRect or opacity.
    // Used for structural/typography rules (R31, R34, R53, R64, R71–R80, heading rules).
    function isRendered(el: Element): boolean {
      if (!(el instanceof HTMLElement)) return false;
      let node: HTMLElement | null = el;
      while (node) {
        if (node.hasAttribute("hidden")) return false;
        if (node.getAttribute("aria-hidden") === "true") return false;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden")
          return false;
        node = node.parentElement;
      }
      return true;
    }

    // ─── HELPER: isVisible ───────────────────────────────────────────────────
    // Alfa "isVisible" = full visibility: isRendered + opacity > 0 + has layout box.
    // Used for most interactive/content rules. Checks opacity:0 and zero-size boxes.
    function isVisible(el: Element): boolean {
      if (!(el instanceof HTMLElement)) return false;
      if (!isRendered(el)) return false;
      // opacity:0 means invisible to all users
      let node: HTMLElement | null = el;
      while (node) {
        const style = window.getComputedStyle(node);
        if (parseFloat(style.opacity) === 0) return false;
        node = node.parentElement;
      }
      // clip-path: inset(100%) or polygon(0 0,0 0,0 0,0 0) => fully clipped
      const cs = window.getComputedStyle(el);
      const cp = cs.clipPath;
      if (cp && cp !== "none") {
        if (/inset\(\s*100%/.test(cp)) return false;
        if (
          /polygon\(\s*0\s*[a-z%]*\s*,\s*0\s*[a-z%]*\s*,\s*0\s*[a-z%]*\s*,\s*0\s*[a-z%]*\s*\)/i.test(
            cp,
          )
        )
          return false;
      }
      return true;
    }

    // ─── HELPER: isVisibleRect ───────────────────────────────────────────────
    // Used only where layout dimensions are required (target size checks etc.)
    function isVisibleRect(el: Element): boolean {
      if (!isVisible(el)) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    // ─── HELPER: isProgrammaticallyHidden ───────────────────────────────────
    // Alfa: display:none | visibility:hidden | aria-hidden="true" on self or ancestor.
    // Used as applicability gate for ARIA rules (R19, R20, R21).
    function isProgrammaticallyHidden(el: Element): boolean {
      if (el.getAttribute("aria-hidden") === "true") return true;
      let node: Element | null = el;
      while (node) {
        if (node.getAttribute("aria-hidden") === "true") return true;
        const cs = window.getComputedStyle(node as HTMLElement);
        if (cs.display === "none" || cs.visibility === "hidden") return true;
        node = node.parentElement;
      }
      return false;
    }

    // ─── HELPER: ARIA Accessible Name (ARIA spec 4.3 — accname-1.2) ─────────
    // Full cascade: aria-labelledby → aria-label → native sources → title
    function getAccessibleName(el: Element): string {
      // 1. aria-labelledby — resolve each ID, recurse into subtree, concat
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const name = labelledBy
          .trim()
          .split(/\s+/)
          .map((id) => {
            const ref = document.getElementById(id);
            if (!ref) return "";
            // Per accname spec: include hidden content when referenced via aria-labelledby
            return ref.textContent?.trim() || "";
          })
          .filter(Boolean)
          .join(" ")
          .trim();
        if (name) return name;
      }

      // 2. aria-label
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel?.trim()) return ariaLabel.trim();

      // 3. Native sources by element type
      if (el instanceof HTMLInputElement) {
        const type = el.type?.toLowerCase() || "text";
        // image buttons: alt first
        if (type === "image") return el.alt?.trim() || el.title?.trim() || "";
        // submit/reset/button: value attribute, then browser default
        if (type === "submit") return el.value?.trim() || "Submit";
        if (type === "reset") return el.value?.trim() || "Reset";
        if (type === "button") return el.value?.trim() || "";
        // Other inputs: label element (for= or ancestor), then placeholder
        if (el.id) {
          const label = document.querySelector(
            `label[for="${CSS.escape(el.id)}"]`,
          );
          if (label) return label.textContent?.trim() || "";
        }
        const parentLabel = el.closest("label");
        if (parentLabel) {
          const clone = parentLabel.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("input,select,textarea")
            .forEach((c) => c.remove());
          const t = clone.textContent?.trim();
          if (t) return t;
        }
        // placeholder as last native fallback (before title)
        if (el.placeholder) return el.placeholder;
      }

      if (el instanceof HTMLSelectElement) {
        if (el.id) {
          const label = document.querySelector(
            `label[for="${CSS.escape(el.id)}"]`,
          );
          if (label) return label.textContent?.trim() || "";
        }
        const parentLabel = el.closest("label");
        if (parentLabel) {
          const clone = parentLabel.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("input,select,textarea")
            .forEach((c) => c.remove());
          const t = clone.textContent?.trim();
          if (t) return t;
        }
      }

      if (el instanceof HTMLTextAreaElement) {
        if (el.id) {
          const label = document.querySelector(
            `label[for="${CSS.escape(el.id)}"]`,
          );
          if (label) return label.textContent?.trim() || "";
        }
        const parentLabel = el.closest("label");
        if (parentLabel) {
          const clone = parentLabel.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("input,select,textarea")
            .forEach((c) => c.remove());
          const t = clone.textContent?.trim();
          if (t) return t;
        }
        if (el.placeholder) return el.placeholder;
      }

      if (el instanceof HTMLImageElement) {
        return el.alt?.trim() || "";
      }

      // 4. title fallback (applies to all elements — last resort before textContent)
      const title = el.getAttribute("title");
      if (title?.trim()) return title.trim();

      // 5. textContent for buttons, links, headings, labels, etc.
      return el.textContent?.trim() || "";
    }

    // ─── HELPER: getVisibleText (strips aria-hidden subtrees) ───────────────
    function getVisibleText(el: Element): string {
      let text = "";
      el.childNodes.forEach((node) => {
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

    // ─── HELPER: getVisibleLabel (form field visible label) ─────────────────
    function getVisibleLabel(el: Element): string {
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        if (el.id) {
          const label = document.querySelector(
            `label[for="${CSS.escape(el.id)}"]`,
          );
          if (label) return label.textContent?.trim() || "";
        }
        const parentLabel = el.closest("label");
        if (parentLabel) {
          const clone = parentLabel.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("input,select,textarea")
            .forEach((c) => c.remove());
          return clone.textContent?.trim() || "";
        }
        if (el instanceof HTMLInputElement && el.placeholder)
          return el.placeholder;
        if (el instanceof HTMLTextAreaElement && el.placeholder)
          return el.placeholder;
      }
      return el.textContent?.trim() || "";
    }

    // ─── HELPER: isInsideLandmark ────────────────────────────────────────────
    // Matches Alfa: <section> is a landmark ONLY with aria-label/aria-labelledby (not title).
    // <header>/<footer> are landmarks only when NOT nested in sectioning elements.
    function isInsideLandmark(el: Element): boolean {
      const landmarkRoles = [
        "main",
        "navigation",
        "complementary",
        "contentinfo",
        "banner",
        "search",
        "form",
        "region",
      ];
      const alwaysLandmarkTags = ["main", "nav", "aside", "form"];
      const sectioningTags = ["article", "aside", "main", "nav", "section"];
      let node: Element | null = el.parentElement;
      while (node && node !== document.body) {
        const tag = node.tagName.toLowerCase();
        if (alwaysLandmarkTags.includes(tag)) return true;
        if (tag === "section") {
          if (
            node.hasAttribute("aria-label") ||
            node.hasAttribute("aria-labelledby")
          )
            return true;
        }
        if (tag === "header" || tag === "footer") {
          const parentTag = (node.parentElement?.tagName || "").toLowerCase();
          if (!sectioningTags.includes(parentTag)) return true;
        }
        const role = node.getAttribute("role");
        if (role && landmarkRoles.includes(role)) return true;
        node = node.parentElement;
      }
      return false;
    }

    // ─── HELPER: Contrast / Luminance ────────────────────────────────────────
    // Resolve any color string (including currentColor) via canvas for accuracy.
    function getLuminanceFromColorString(colorStr: string): number | null {
      if (
        !colorStr ||
        colorStr === "transparent" ||
        colorStr === "rgba(0, 0, 0, 0)"
      )
        return null;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = colorStr;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        if (a === 0) return null; // fully transparent
        const toLinear = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return (
          0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
        );
      } catch {
        return null;
      }
    }

    // Alpha-composite two rgba colors (fg over bg), return opaque rgb string.
    function alphaComposite(fg: string, bg: string): string {
      const parseFg = fg.match(
        /rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d+(?:\.\d+)?))?\)/,
      );
      const parseBg = bg.match(
        /rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d+(?:\.\d+)?))?\)/,
      );
      if (!parseFg || !parseBg) return bg;
      const fa = parseFloat(parseFg[4] ?? "1");
      const br = parseInt(parseBg[1]),
        bg2 = parseInt(parseBg[2]),
        bb = parseInt(parseBg[3]);
      const fr = parseInt(parseFg[1]),
        fg2 = parseInt(parseFg[2]),
        fb = parseInt(parseFg[3]);
      const r = Math.round(fr * fa + br * (1 - fa));
      const g = Math.round(fg2 * fa + bg2 * (1 - fa));
      const b = Math.round(fb * fa + bb * (1 - fa));
      return `rgb(${r},${g},${b})`;
    }

    // Walk up DOM accumulating background colors via alpha compositing.
    function getEffectiveBackground(el: HTMLElement): string {
      let composited = "rgb(255,255,255)"; // default white canvas
      const chain: HTMLElement[] = [];
      let node: HTMLElement | null = el;
      while (node) {
        chain.push(node);
        node = node.parentElement;
      }
      chain.reverse(); // from html → el
      for (const n of chain) {
        const cs = window.getComputedStyle(n);
        const bg = cs.backgroundColor;
        if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
          composited = alphaComposite(bg, composited);
        }
      }
      return composited;
    }

    function getContrastRatio(l1: number, l2: number): number {
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    // ─── HELPER: Line height resolution ─────────────────────────────────────
    function resolveLineHeight(
      style: CSSStyleDeclaration,
      fontSize: number,
    ): number | null {
      const lh = style.lineHeight;
      if (!lh || lh === "normal") return fontSize * 1.2;
      if (lh.endsWith("px")) return parseFloat(lh);
      if (lh.endsWith("%")) return (fontSize * parseFloat(lh)) / 100;
      const num = parseFloat(lh);
      if (!isNaN(num)) return fontSize * num;
      return null;
    }

    // ─── HELPER: !important detection for WCAG 1.4.12 rules ─────────────────
    // Sets an extreme inline value WITHOUT !important, reads back.
    // If computed value didn't change → a stylesheet !important is blocking override.
    function isImportantBlocked(
      el: HTMLElement,
      prop: string,
      testValue: string,
    ): boolean {
      const savedVal = el.style.getPropertyValue(prop);
      const savedPri = el.style.getPropertyPriority(prop);
      el.style.setProperty(prop, testValue);
      const testComputed = parseFloat(
        window.getComputedStyle(el).getPropertyValue(prop),
      );
      el.style.removeProperty(prop);
      if (savedVal) el.style.setProperty(prop, savedVal, savedPri);
      const origComputed = parseFloat(
        window.getComputedStyle(el).getPropertyValue(prop),
      );
      // If our override (extreme value) didn't apply → !important is blocking
      return Math.abs(testComputed - origComputed) < 50;
    }

    // ─── ARIA DEFINITIONS ────────────────────────────────────────────────────
    const ARIA_PROHIBITED: Record<string, string[]> = {
      presentation: ["aria-label", "aria-labelledby"],
      none: ["aria-label", "aria-labelledby"],
      caption: ["aria-label", "aria-labelledby"],
      code: ["aria-label", "aria-labelledby"],
      deletion: ["aria-label", "aria-labelledby"],
      emphasis: ["aria-label", "aria-labelledby"],
      generic: ["aria-label", "aria-labelledby"],
      insertion: ["aria-label", "aria-labelledby"],
      mark: ["aria-label", "aria-labelledby"],
      paragraph: ["aria-label", "aria-labelledby"],
      strong: ["aria-label", "aria-labelledby"],
      subscript: ["aria-label", "aria-labelledby"],
      superscript: ["aria-label", "aria-labelledby"],
      time: ["aria-label", "aria-labelledby"],
    };

    const ALL_ARIA_ATTRS = new Set([
      "aria-activedescendant",
      "aria-atomic",
      "aria-autocomplete",
      "aria-busy",
      "aria-checked",
      "aria-colcount",
      "aria-colindex",
      "aria-colspan",
      "aria-controls",
      "aria-current",
      "aria-describedby",
      "aria-description",
      "aria-details",
      "aria-disabled",
      "aria-dropeffect",
      "aria-errormessage",
      "aria-expanded",
      "aria-flowto",
      "aria-grabbed",
      "aria-haspopup",
      "aria-hidden",
      "aria-invalid",
      "aria-keyshortcuts",
      "aria-label",
      "aria-labelledby",
      "aria-level",
      "aria-live",
      "aria-modal",
      "aria-multiline",
      "aria-multiselectable",
      "aria-orientation",
      "aria-owns",
      "aria-placeholder",
      "aria-posinset",
      "aria-pressed",
      "aria-readonly",
      "aria-relevant",
      "aria-required",
      "aria-roledescription",
      "aria-rowcount",
      "aria-rowindex",
      "aria-rowspan",
      "aria-selected",
      "aria-setsize",
      "aria-sort",
      "aria-valuemax",
      "aria-valuemin",
      "aria-valuenow",
      "aria-valuetext",
    ]);

    const VALID_ROLES = new Set([
      "alert",
      "alertdialog",
      "application",
      "article",
      "banner",
      "button",
      "cell",
      "checkbox",
      "columnheader",
      "combobox",
      "complementary",
      "contentinfo",
      "definition",
      "dialog",
      "directory",
      "document",
      "feed",
      "figure",
      "form",
      "grid",
      "gridcell",
      "group",
      "heading",
      "img",
      "link",
      "list",
      "listbox",
      "listitem",
      "log",
      "main",
      "marquee",
      "math",
      "menu",
      "menubar",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "navigation",
      "none",
      "note",
      "option",
      "presentation",
      "progressbar",
      "radio",
      "radiogroup",
      "region",
      "row",
      "rowgroup",
      "rowheader",
      "scrollbar",
      "search",
      "searchbox",
      "separator",
      "slider",
      "spinbutton",
      "status",
      "switch",
      "tab",
      "table",
      "tablist",
      "tabpanel",
      "term",
      "textbox",
      "timer",
      "toolbar",
      "tooltip",
      "tree",
      "treegrid",
      "treeitem",
    ]);

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R1: Page has no title (WCAG 2.4.2)
    // ════════════════════════════════════════════════════════════════════════
    if (!document.title || document.title.trim() === "") {
      results.push({
        ruleId: "SIA-R1",
        type: "Issue",
        impact: "serious",
        description: "Page is missing a title element",
        element: "<title>",
        selector: "head > title",
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R114: Page title is not descriptive (WCAG 2.4.2)
    // Flag titles that are only whitespace or trivially generic.
    // ════════════════════════════════════════════════════════════════════════
    {
      const title = document.title?.trim();
      if (
        title &&
        /^(home|index|untitled|page|document|new page|welcome)$/i.test(title)
      ) {
        results.push({
          ruleId: "SIA-R114",
          type: "Issue",
          impact: "moderate",
          description: `Page title "${title}" is not descriptive`,
          element: `<title>${title}</title>`,
          selector: "head > title",
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R4: HTML element missing lang attribute (WCAG 3.1.1)
    // ════════════════════════════════════════════════════════════════════════
    const htmlEl = document.documentElement;
    if (
      !htmlEl.getAttribute("lang") ||
      htmlEl.getAttribute("lang")?.trim() === ""
    ) {
      results.push({
        ruleId: "SIA-R4",
        type: "Issue",
        impact: "serious",
        description: "HTML element is missing lang attribute",
        element: "<html>",
        selector: "html",
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R5: lang attribute is not a valid BCP 47 code (WCAG 3.1.1)
    // ════════════════════════════════════════════════════════════════════════
    {
      const lang = htmlEl.getAttribute("lang")?.trim();
      if (lang) {
        const BCP47_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
        if (!BCP47_RE.test(lang)) {
          results.push({
            ruleId: "SIA-R5",
            type: "Issue",
            impact: "serious",
            description: `HTML lang attribute "${lang}" is not a valid BCP 47 language code`,
            element: `<html lang="${lang}">`,
            selector: "html",
          });
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R6: lang and xml:lang do not agree (WCAG 3.1.1)
    // Alfa applicability: <html> has BOTH lang AND xml:lang, both non-empty.
    // Expectation: primary subtags match.
    // ════════════════════════════════════════════════════════════════════════
    {
      const lang = htmlEl.getAttribute("lang")?.trim();
      const xmlLang = htmlEl.getAttribute("xml:lang")?.trim();
      if (lang && xmlLang) {
        const primaryLang = lang.split("-")[0].toLowerCase();
        const primaryXml = xmlLang.split("-")[0].toLowerCase();
        if (primaryLang !== primaryXml) {
          results.push({
            ruleId: "SIA-R6",
            type: "Issue",
            impact: "serious",
            description: `lang="${lang}" and xml:lang="${xmlLang}" specify different primary language subtags`,
            element: `<html lang="${lang}" xml:lang="${xmlLang}">`,
            selector: "html",
          });
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R7: Element with lang attribute has invalid language tag (WCAG 3.1.2)
    // Applied to all elements (not just html) that have a lang attribute.
    // ════════════════════════════════════════════════════════════════════════
    {
      const BCP47_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
      document.querySelectorAll("[lang]").forEach((el) => {
        if (el === htmlEl) return; // already checked by R5
        if (isProgrammaticallyHidden(el)) return;
        const lang = el.getAttribute("lang")?.trim();
        if (!lang) return;
        if (!BCP47_RE.test(lang)) {
          results.push({
            ruleId: "SIA-R7",
            type: "Potential Issue",
            impact: "moderate",
            description: `lang attribute "${lang}" is not a valid BCP 47 language tag`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R110: Invalid ARIA role value (WCAG 4.1.2)
    // Alfa sia-r110: element with role attribute has invalid value.
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("[role]").forEach((el) => {
      if (isProgrammaticallyHidden(el)) return;
      const roles = (el.getAttribute("role") || "").trim().split(/\s+/);
      for (const role of roles) {
        if (role && !VALID_ROLES.has(role)) {
          results.push({
            ruleId: "SIA-R110",
            type: "Issue",
            impact: "serious",
            description: `Invalid ARIA role: "${role}"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R3: Duplicate IDs referenced in accessibility relationships (WCAG 4.1.1)
    // Only flag IDs actually used in accessibility references (not all IDs on page).
    // ════════════════════════════════════════════════════════════════════════
    {
      const referencedIds = new Set<string>();
      document
        .querySelectorAll(
          "[aria-labelledby],[aria-describedby],[aria-controls],[aria-owns],[aria-activedescendant]",
        )
        .forEach((el) => {
          [
            "aria-labelledby",
            "aria-describedby",
            "aria-controls",
            "aria-owns",
            "aria-activedescendant",
          ].forEach((attr) => {
            (el.getAttribute(attr) || "")
              .split(/\s+/)
              .filter(Boolean)
              .forEach((id) => referencedIds.add(id));
          });
        });
      document.querySelectorAll("label[for]").forEach((el) => {
        const v = el.getAttribute("for");
        if (v) referencedIds.add(v);
      });
      document.querySelectorAll("a[href^='#']").forEach((el) => {
        const h = el.getAttribute("href")!.slice(1);
        if (h) referencedIds.add(h);
      });
      const idCountMap: Record<string, number> = {};
      document.querySelectorAll("[id]").forEach((el) => {
        if (referencedIds.has(el.id))
          idCountMap[el.id] = (idCountMap[el.id] || 0) + 1;
      });
      for (const [id, count] of Object.entries(idCountMap)) {
        if (count > 1) {
          results.push({
            ruleId: "SIA-R3",
            type: "Issue",
            impact: "critical",
            description: `Duplicate ID "${id}" is referenced for accessibility (${count} elements share this ID)`,
            element: `#${id}`,
            selector: `[id="${id}"]`,
          });
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R2: Image without a text alternative (WCAG 1.1.1)
    // Alfa: img without alt, or empty alt when image is not decorative.
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("img").forEach((img) => {
      if (!isVisible(img)) return;
      if (!img.hasAttribute("alt")) {
        results.push({
          ruleId: "SIA-R2",
          type: "Issue",
          impact: "critical",
          description: "Image is missing alt attribute",
          element: outerHtmlSnippet(img),
          selector: getSelector(img),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R43: SVG element with explicit role has non-empty accessible name (WCAG 1.1.1)
    // Alfa sia-r43: ONLY applies to SVG elements that have an EXPLICIT role attribute
    // (role="img" or similar). SVGs without explicit role are inapplicable.
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("svg[role]").forEach((svg) => {
      if (isProgrammaticallyHidden(svg)) return;
      const role = svg.getAttribute("role");
      // Only meaningful roles that require a name
      if (!role || role === "none" || role === "presentation") return;
      const name = getAccessibleName(svg);
      if (!name) {
        results.push({
          ruleId: "SIA-R43",
          type: "Issue",
          impact: "serious",
          description: `SVG element with role="${role}" has no accessible name — add aria-label, aria-labelledby, or a <title> child`,
          element: outerHtmlSnippet(svg),
          selector: getSelector(svg),
        });
      }
    });

        // ════════════════════════════════════════════════════════════════════════
    // SIA-R8: Form field has no accessible name (WCAG 1.3.1 / 4.1.2)
    // Alfa sia-r8: targets elements by ARIA role — checkbox, combobox, listbox,
    // menuitemcheckbox, menuitemradio, radio, searchbox, slider, spinbutton,
    // switch, textbox — covering both native form elements and custom ARIA widgets.
    // IMPORTANT: placeholder is NOT a valid accessible name per ACCNAME 1.1.
    // ════════════════════════════════════════════════════════════════════════

    // Accessible name computation for form fields per ACCNAME 1.1.
    // Differs from getAccessibleName() in one critical way: placeholder is
    // intentionally excluded. Placeholder is a hint, not a label —
    // Siteimprove/Alfa do not count it as a valid accessible name.
    function getFormFieldAccessibleName(el: Element): string {
      // 1. aria-labelledby (highest priority — can reference hidden content)
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const name = labelledBy
          .trim()
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || "")
          .filter(Boolean)
          .join(" ")
          .trim();
        if (name) return name;
      }
      // 2. aria-label
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel?.trim()) return ariaLabel.trim();
      // 3. <label for="id"> explicit association
      if (el.id) {
        const label = document.querySelector(
          `label[for="${CSS.escape(el.id)}"]`,
        );
        if (label) {
          const t = label.textContent?.trim();
          if (t) return t;
        }
      }
      // 4. Ancestor <label> (wrapping label pattern)
      const parentLabel = el.closest("label");
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        clone
          .querySelectorAll("input,select,textarea")
          .forEach((c) => c.remove());
        const t = clone.textContent?.trim();
        if (t) return t;
      }
      // 5. title attribute — ACCNAME 1.1 step 2F last-resort native source
      const title = el.getAttribute("title");
      if (title?.trim()) return title.trim();
      // Intentionally NO placeholder — not a valid accessible name per ACCNAME 1.1
      return "";
    }

    // Collect all applicable elements once, deduplicating across native + ARIA selectors.
    // Native form elements carry implicit ARIA roles that match Alfa's target set:
    //   input[type=text/search/email/url/tel/password/color/file/date/…] → textbox/searchbox
    //   input[type=checkbox] → checkbox  |  input[type=radio] → radio
    //   input[type=range]    → slider    |  input[type=number] → spinbutton
    //   select               → combobox/listbox  |  textarea → textbox
    const r8Seen = new WeakSet<Element>();
    const r8Targets: Element[] = [];

    document
      .querySelectorAll(
        "input:not([type='hidden']):not([type='submit'])" +
          ":not([type='button']):not([type='reset']):not([type='image'])," +
          "select, textarea",
      )
      .forEach((el) => {
        r8Seen.add(el);
        r8Targets.push(el);
      });

    // Custom ARIA role widgets on non-native elements (e.g. <div role="textbox">).
    // Alfa's full target role list: checkbox | combobox | listbox |
    // menuitemcheckbox | menuitemradio | radio | searchbox | slider |
    // spinbutton | switch | textbox
    const r8AriaSelector = [
      "checkbox", "combobox", "listbox", "menuitemcheckbox",
      "menuitemradio", "radio", "searchbox", "slider", "spinbutton",
      "switch", "textbox",
    ]
      .map((r) => `[role="${r}"]`)
      .join(",");

    document.querySelectorAll(r8AriaSelector).forEach((el) => {
      if (r8Seen.has(el)) return; // already captured as native element
      const tag = el.tagName.toLowerCase();
      // Exclude native elements — they're already in r8Targets via the native selector
      if (tag !== "input" && tag !== "select" && tag !== "textarea") {
        r8Targets.push(el);
      }
    });

    for (const el of r8Targets) {
      if (!isVisibleRect(el)) continue;
      // Alfa: isIncludedInTheAccessibilityTree — skip aria-hidden / display:none
      if (isProgrammaticallyHidden(el)) continue;
      // role=none/presentation removes the element from the accessibility tree
      const explicitRole = el.getAttribute("role");
      if (explicitRole === "none" || explicitRole === "presentation") continue;

      if (!getFormFieldAccessibleName(el)) {
        results.push({
          ruleId: "SIA-R8",
          type: "Issue",
          impact: "critical",
          description:
            "Form field has no associated label, aria-label, or aria-labelledby",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R11: Link has no accessible name (WCAG 2.4.4 / 4.1.2)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("a[href]").forEach((link) => {
      if (!isVisible(link)) return;
      if (!getAccessibleName(link)) {
        results.push({
          ruleId: "SIA-R11",
          type: "Issue",
          impact: "serious",
          description: "Link has no accessible name",
          element: outerHtmlSnippet(link),
          selector: getSelector(link),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R12: Button has no accessible name (WCAG 4.1.2)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("button, [role='button']").forEach((btn) => {
      if (!isVisible(btn)) return;
      // role=button on non-interactive elements — check it has a name
      if (!getAccessibleName(btn)) {
        results.push({
          ruleId: "SIA-R12",
          type: "Issue",
          impact: "critical",
          description: "Button has no accessible name",
          element: outerHtmlSnippet(btn),
          selector: getSelector(btn),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R94 (menuitem accessible name): menuitem has non-empty accessible name
    // Alfa sia-r94 (ACT m6b1q3): role=menuitem, menuitemcheckbox, menuitemradio
    // ════════════════════════════════════════════════════════════════════════
    document
      .querySelectorAll(
        "[role='menuitem'],[role='menuitemcheckbox'],[role='menuitemradio']",
      )
      .forEach((el) => {
        if (isProgrammaticallyHidden(el)) return;
        if (!getAccessibleName(el)) {
          results.push({
            ruleId: "SIA-R94",
            type: "Issue",
            impact: "serious",
            description: `Element with role="${el.getAttribute("role")}" has no accessible name`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R28: Image button has no text alternative (WCAG 1.1.1 / 4.1.2)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("input[type='image']").forEach((el) => {
      if (!isVisible(el)) return;
      if (!getAccessibleName(el)) {
        results.push({
          ruleId: "SIA-R28",
          type: "Issue",
          impact: "critical",
          description:
            "Image button (input[type='image']) is missing a text alternative",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R63: Object element without accessible name (WCAG 1.1.1)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("object").forEach((el) => {
      if (!isVisible(el)) return;
      const title = el.getAttribute("title")?.trim();
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      const fallbackText = el.textContent?.trim();
      if (!title && !ariaLabel && !labelledBy && !fallbackText) {
        results.push({
          ruleId: "SIA-R63",
          type: "Issue",
          impact: "serious",
          description:
            "<object> element has no title, aria-label, or fallback text content",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R116: <summary> element has no accessible name (WCAG 4.1.2)
    // Alfa sia-r116: <summary> that is child of <details>, in accessibility tree,
    // not role=none/presentation.
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("summary").forEach((el) => {
      if (el.parentElement?.tagName.toLowerCase() !== "details") return;
      if (isProgrammaticallyHidden(el)) return;
      const role = el.getAttribute("role");
      if (role === "none" || role === "presentation") return;
      if (!getAccessibleName(el)) {
        results.push({
          ruleId: "SIA-R116",
          type: "Issue",
          impact: "serious",
          description: "<summary> element has no accessible name",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R13: Iframe has no accessible name (WCAG 4.1.2)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("iframe").forEach((el) => {
      const title = el.getAttribute("title")?.trim();
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      if (!title && !ariaLabel && !labelledBy) {
        results.push({
          ruleId: "SIA-R13",
          type: "Issue",
          impact: "serious",
          description: "Inline frame (iframe) is missing a title attribute",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R15: Multiple frames with identical accessible names (WCAG 4.1.2)
    // Alfa: "Iframe elements with identical accessible names have equivalent purpose"
    // ════════════════════════════════════════════════════════════════════════
    {
      const frameTitles: Record<string, number> = {};
      document.querySelectorAll("iframe[title], frame[title]").forEach((el) => {
        const t = (el.getAttribute("title") || "").toLowerCase().trim();
        if (t) frameTitles[t] = (frameTitles[t] || 0) + 1;
      });
      document.querySelectorAll("iframe[title], frame[title]").forEach((el) => {
        const t = (el.getAttribute("title") || "").toLowerCase().trim();
        if (t && frameTitles[t] > 1) {
          results.push({
            ruleId: "SIA-R15",
            type: "Potential Issue",
            impact: "moderate",
            description: `Multiple frames share the title "${el.getAttribute("title")}" — each should have a unique descriptive title`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R14: Label in Name — visible label not contained in accessible name (WCAG 2.5.3)
    // ════════════════════════════════════════════════════════════════════════
    // Form controls
    document
      .querySelectorAll("input:not([type='hidden']), select, textarea")
      .forEach((el) => {
        if (!isVisibleRect(el)) return;
        const visibleLabel = getVisibleLabel(el);
        const accName = getAccessibleName(el);
        if (!visibleLabel || !accName) return;
        if (!accName.toLowerCase().includes(visibleLabel.toLowerCase())) {
          results.push({
            ruleId: "SIA-R14",
            type: "Issue",
            impact: "moderate",
            description: `Visible label "${visibleLabel.substring(0, 60)}" is not included in accessible name "${accName.substring(0, 60)}"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    // Interactive elements with explicit aria-label/aria-labelledby
    document
      .querySelectorAll(
        "a[href], button, [role='button'], [role='link'], [role='tab'], [role='menuitem']",
      )
      .forEach((el) => {
        if (!isVisibleRect(el)) return;
        const hasAriaLabel = el.hasAttribute("aria-label");
        const hasAriaLabelledby = el.hasAttribute("aria-labelledby");
        if (!hasAriaLabel && !hasAriaLabelledby) return;

        // Skip when ALL aria-labelledby targets are INSIDE this element.
        // This is the AEM sr-only pattern: <a aria-labelledby="id"><span id="id" class="sr-only">…</span>…</a>
        // The link provides its own accessible name via a hidden child span.
        // Siteimprove does not flag this pattern because the accessible name
        // is derived from content that is part of the element itself.
        if (hasAriaLabelledby) {
          const ids = (el.getAttribute("aria-labelledby") || "").trim().split(/\s+/);
          const allInternal = ids.every(function(id) {
            if (!id) return true;
            const target = document.getElementById(id);
            return target ? el.contains(target) : false;
          });
          if (allInternal) return;
        }

        const rawVisible =
          (el instanceof HTMLElement
            ? el.innerText?.replace(/\s+/g, " ")?.trim()
            : "") || "";
        if (!rawVisible || rawVisible.length < 2) return;
        // Deduplicate AEM double-render: "Awards Awards" → "Awards"
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

        // WCAG 2.5.3 "Label in Name": the accessible name must contain the visible label.
        // Use token-level containment (not raw substring) to avoid false positives caused
        // by duplicate words in visible text (e.g. a date appearing twice in a card's
        // innerText but only once in the aria-labelledby string).
        const accLower = accName.toLowerCase();
        const visLower = visibleText.toLowerCase();
        const passesSubstring = accLower.includes(visLower);
        const passesTokens = (() => {
          const tokens = [...new Set(visLower.split(/\s+/).filter((t: string) => t.length > 0))];
          return tokens.length > 0 && tokens.every((t: string) => accLower.includes(t));
        })();

        if (!passesSubstring && !passesTokens) {
          results.push({
            ruleId: "SIA-R14",
            type: "Issue",
            impact: "moderate",
            description: `Visible text "${visibleText.substring(0, 60)}" is not included in accessible name "${accName.substring(0, 60)}"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R16: Required ARIA attribute missing (WAI-ARIA)
    // ════════════════════════════════════════════════════════════════════════
    const requiredAttrs: Record<string, string[]> = {
      checkbox: ["aria-checked"],
      combobox: ["aria-expanded"],
      slider: ["aria-valuenow", "aria-valuemin", "aria-valuemax"],
      spinbutton: ["aria-valuenow"],
      scrollbar: [
        "aria-valuenow",
        "aria-valuemin",
        "aria-valuemax",
        "aria-controls",
      ],
    };
    for (const [role, attrs] of Object.entries(requiredAttrs)) {
      document.querySelectorAll(`[role="${role}"]`).forEach((el) => {
        if (isProgrammaticallyHidden(el)) return;
        for (const attr of attrs) {
          if (!el.hasAttribute(attr)) {
            results.push({
              ruleId: "SIA-R16",
              type: "Issue",
              impact: "serious",
              description: `Element with role="${role}" is missing required attribute: ${attr}`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        }
      });
    }
    // aria-expanded missing on toggle controls with aria-controls
    document
      .querySelectorAll(
        "button, [role='button'], a[href='#'], a[href='javascript:void(0)'], a[href='javascript:;']",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        if (el.getAttribute("aria-expanded") !== null) return;
        if (el.getAttribute("aria-haspopup")) return;
        const controls = el.getAttribute("aria-controls");
        if (!controls) return;
        if (document.getElementById(controls)) {
          results.push({
            ruleId: "SIA-R16",
            type: "Issue",
            impact: "serious",
            description: `Toggle control references #${controls} via aria-controls but is missing aria-expanded state`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

   // ════════════════════════════════════════════════════════════════════════
    // SIA-R17: Hidden element has focusable content (WCAG 1.3.1)
    // Covers two cases:
    //   A) aria-hidden="true" is set DIRECTLY on the focusable element itself
    //      (e.g. <input aria-hidden="true"> — hidden from AT but still tabbable)
    //   B) aria-hidden="true" container wraps focusable descendants
    // ════════════════════════════════════════════════════════════════════════
    {
      const r17Seen = new Set<string>();
      const r17FocusableSel =
        "a[href]:not([tabindex='-1']), button:not([disabled]):not([tabindex='-1']), input:not([disabled]):not([tabindex='-1']), select:not([disabled]):not([tabindex='-1']), textarea:not([disabled]):not([tabindex='-1'])";

      document.querySelectorAll("[aria-hidden='true']").forEach((el) => {
        // ── Case A: the aria-hidden element IS a focusable control ──────────
        const tabIdx = el.getAttribute("tabindex");
        const selfFocusable =
          el.matches(
            "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
          ) ||
          (tabIdx !== null && tabIdx !== "-1");

        if (selfFocusable) {
          const key = getSelector(el);
          if (!r17Seen.has(key)) {
            r17Seen.add(key);
            results.push({
              ruleId: "SIA-R17",
              type: "Issue",
              impact: "serious",
              description:
                'Interactive element has aria-hidden="true" — it is hidden from assistive technologies but keyboard users can still Tab to and activate it',
              element: outerHtmlSnippet(el),
              selector: key,
            });
          }
        }

        // ── Case B: container has focusable descendants ──────────────────────
        el.querySelectorAll(r17FocusableSel).forEach((child) => {
          const key = getSelector(child);
          if (r17Seen.has(key)) return;
          r17Seen.add(key);
          results.push({
            ruleId: "SIA-R17",
            type: "Issue",
            impact: "serious",
            description:
              'Focusable element is inside an aria-hidden="true" container — keyboard users can Tab to it but screen readers will not announce it',
            element: outerHtmlSnippet(child),
            selector: key,
          });
        });
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R18: Unsupported ARIA attribute (WAI-ARIA) — ARIA attribute not permitted on role
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("[role]").forEach((el) => {
      if (isProgrammaticallyHidden(el)) return;
      const roles = (el.getAttribute("role") || "").split(/\s+/);
      for (const role of roles) {
        const prohibited = ARIA_PROHIBITED[role] || [];
        for (const attr of prohibited) {
          if (el.hasAttribute(attr)) {
            results.push({
              ruleId: "SIA-R18",
              type: "Issue",
              impact: "moderate",
              description: `aria attribute "${attr}" is prohibited on role="${role}"`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        }
      }
    });
    // ARIA attributes on native elements where prohibited
    {
      const r18Seen = new Set<string>();
      document
        .querySelectorAll("input[type='hidden'], meta, script, style")
        .forEach((el) => {
          const tag = el.tagName.toLowerCase();
          const inputType = el.getAttribute("type") || "";
          el.getAttributeNames()
            .filter((a) => a.startsWith("aria-"))
            .forEach((attr) => {
              const key = `${tag}[type=${inputType}]::${attr}`;
              if (r18Seen.has(key)) return;
              r18Seen.add(key);
              results.push({
                ruleId: "SIA-R18",
                type: "Issue",
                impact: "moderate",
                description: `ARIA attribute "${attr}" is not permitted on <${tag}>`,
                element: outerHtmlSnippet(el),
                selector: getSelector(el),
              });
            });
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R19: Invalid value for ARIA attribute (WCAG 4.1.2 / WAI-ARIA)
    // Alfa sia-r19: fully consistent with ACT rule 6a7281.
    // ════════════════════════════════════════════════════════════════════════
    {
      const ARIA_BOOLEAN = [
        "aria-atomic",
        "aria-busy",
        "aria-disabled",
        "aria-modal",
        "aria-multiline",
        "aria-multiselectable",
        "aria-readonly",
        "aria-required",
      ];
      const ARIA_TRISTATE = ["aria-checked", "aria-pressed"];
      const ARIA_SELECTED_GRABBED = ["aria-selected", "aria-grabbed"];
      document.querySelectorAll("*").forEach((el) => {
        if (isProgrammaticallyHidden(el)) return;
        ARIA_BOOLEAN.forEach((attr) => {
          const val = el.getAttribute(attr);
          if (val !== null && val !== "true" && val !== "false") {
            results.push({
              ruleId: "SIA-R19",
              type: "Issue",
              impact: "moderate",
              description: `${attr}="${val}" is not a valid value — use "true" or "false"`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        });
        ARIA_TRISTATE.forEach((attr) => {
          const val = el.getAttribute(attr);
          if (
            val !== null &&
            !["true", "false", "mixed", "undefined"].includes(val)
          ) {
            results.push({
              ruleId: "SIA-R19",
              type: "Issue",
              impact: "moderate",
              description: `${attr}="${val}" is not valid — allowed: "true", "false", "mixed", "undefined"`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        });
        ARIA_SELECTED_GRABBED.forEach((attr) => {
          const val = el.getAttribute(attr);
          if (val !== null && !["true", "false", "undefined"].includes(val)) {
            results.push({
              ruleId: "SIA-R19",
              type: "Issue",
              impact: "moderate",
              description: `${attr}="${val}" is not valid — allowed: "true", "false", "undefined"`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        });
        const live = el.getAttribute("aria-live");
        if (live !== null && !["off", "polite", "assertive"].includes(live)) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-live="${live}" is not valid — use "off", "polite", or "assertive"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const orient = el.getAttribute("aria-orientation");
        if (
          orient !== null &&
          !["horizontal", "vertical", "undefined"].includes(orient)
        ) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-orientation="${orient}" is not valid`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const sort = el.getAttribute("aria-sort");
        if (
          sort !== null &&
          !["ascending", "descending", "none", "other"].includes(sort)
        ) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-sort="${sort}" is not valid`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const current = el.getAttribute("aria-current");
        if (
          current !== null &&
          ![
            "page",
            "step",
            "location",
            "date",
            "time",
            "true",
            "false",
          ].includes(current)
        ) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-current="${current}" is not valid`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const haspopup = el.getAttribute("aria-haspopup");
        if (
          haspopup !== null &&
          ![
            "false",
            "true",
            "menu",
            "listbox",
            "tree",
            "grid",
            "dialog",
          ].includes(haspopup)
        ) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-haspopup="${haspopup}" is not valid`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const autocomplete = el.getAttribute("aria-autocomplete");
        if (
          autocomplete !== null &&
          !["inline", "list", "both", "none"].includes(autocomplete)
        ) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-autocomplete="${autocomplete}" is not valid`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R20: Non-existent ARIA attribute (WAI-ARIA)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("*").forEach((el) => {
      if (isProgrammaticallyHidden(el)) return;
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith("aria-") && !ALL_ARIA_ATTRS.has(attr.name)) {
          results.push({
            ruleId: "SIA-R20",
            type: "Issue",
            impact: "moderate",
            description: `Element uses non-existent ARIA attribute "${attr.name}"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R21: Invalid ARIA role (WAI-ARIA)
    // Same as R110 but for completeness — R110 is the ACT-consistent one.
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("[role]").forEach((el) => {
      if (isProgrammaticallyHidden(el)) return;
      const roles = (el.getAttribute("role") || "").trim().split(/\s+/);
      for (const role of roles) {
        if (role && !VALID_ROLES.has(role)) {
          results.push({
            ruleId: "SIA-R21",
            type: "Issue",
            impact: "serious",
            description: `Invalid ARIA role: "${role}"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R36: ARIA attribute unsupported or prohibited on role
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("[role]").forEach((el) => {
      if (isProgrammaticallyHidden(el)) return;
      const roles = (el.getAttribute("role") || "").split(/\s+/);
      for (const role of roles) {
        const prohibited = ARIA_PROHIBITED[role] || [];
        for (const attr of prohibited) {
          if (el.hasAttribute(attr)) {
            results.push({
              ruleId: "SIA-R36",
              type: "Issue",
              impact: "moderate",
              description: `aria attribute "${attr}" is prohibited on role="${role}"`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        }
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R40: region landmark has no accessible name (WAI-ARIA)
    // ════════════════════════════════════════════════════════════════════════
    document
      .querySelectorAll(
        "[role='region'], section[aria-label], section[aria-labelledby]",
      )
      .forEach((el) => {
        if (isProgrammaticallyHidden(el)) return;
        const ariaLabel = el.getAttribute("aria-label")?.trim();
        const labelledBy = el.getAttribute("aria-labelledby");
        const resolvedLabel = ariaLabel
          ? ariaLabel
          : labelledBy
            ? (document.getElementById(labelledBy)?.textContent?.trim() ?? "")
            : "";
        if (!resolvedLabel) {
          results.push({
            ruleId: "SIA-R40",
            type: "Issue",
            impact: "moderate",
            description: `Element with role="region" has no accessible name — add aria-label or aria-labelledby`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R42: ARIA role not in correct context (required owned/parent elements)
    // ════════════════════════════════════════════════════════════════════════
    {
      const requiredParent: Record<string, string[]> = {
        listitem: [
          "ul",
          "ol",
          "menu",
          "[role='list']",
          "[role='menu']",
          "[role='menubar']",
        ],
        option: ["[role='listbox']", "select"],
        menuitem: ["[role='menu']", "[role='menubar']"],
        menuitemcheckbox: ["[role='menu']", "[role='menubar']"],
        menuitemradio: ["[role='menu']", "[role='menubar']"],
        tab: ["[role='tablist']"],
        row: [
          "[role='grid']",
          "[role='rowgroup']",
          "[role='table']",
          "[role='treegrid']",
          "table",
          "thead",
          "tbody",
          "tfoot",
        ],
        gridcell: ["[role='row']", "tr"],
        cell: ["[role='row']", "tr"],
        columnheader: ["[role='row']", "tr"],
        rowheader: ["[role='row']", "tr"],
        treeitem: ["[role='tree']", "[role='treeitem']", "[role='group']"],
      };
      // Also check native li outside list
      document.querySelectorAll("li").forEach((li) => {
        const parent = li.parentElement;
        if (
          parent &&
          !["ul", "ol", "menu"].includes(parent.tagName.toLowerCase())
        ) {
          results.push({
            ruleId: "SIA-R42",
            type: "Issue",
            impact: "moderate",
            description: "List item is not inside a list element",
            element: outerHtmlSnippet(li),
            selector: getSelector(li),
          });
        }
      });
      for (const [role, parents] of Object.entries(requiredParent)) {
        document.querySelectorAll(`[role="${role}"]`).forEach((el) => {
          if (isProgrammaticallyHidden(el)) return;
          const hasValidParent = parents.some(
            (sel) => el.closest(sel) !== null,
          );
          if (!hasValidParent) {
            results.push({
              ruleId: "SIA-R42",
              type: "Issue",
              impact: "moderate",
              description: `Element with role="${role}" is not inside a required parent element (${parents.join(", ")})`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R86: Element marked as decorative is not exposed (WCAG 4.1.2)
    // Alfa sia-r86: elements with role=none/presentation that are still exposed
    // in the accessibility tree (because they have a focusable descendant or
    // are themselves focusable, causing the role to be ignored by AT).
    // ════════════════════════════════════════════════════════════════════════
    document
      .querySelectorAll("[role='none'],[role='presentation']")
      .forEach((el) => {
        if (isProgrammaticallyHidden(el)) return;
        // The decoration role is ignored if the element has aria-label/aria-labelledby
        if (
          el.hasAttribute("aria-label") ||
          el.hasAttribute("aria-labelledby")
        ) {
          results.push({
            ruleId: "SIA-R86",
            type: "Issue",
            impact: "moderate",
            description: `Element with role="${el.getAttribute("role")}" has aria-label/aria-labelledby — the decorative role will be ignored by assistive technologies`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
          return;
        }
        // Also flag focusable descendants inside a decorative element
        const focusable = el.querySelector(
          "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        if (focusable) {
          results.push({
            ruleId: "SIA-R86",
            type: "Issue",
            impact: "moderate",
            description: `Element with role="${el.getAttribute("role")}" contains focusable content — the decorative role will be ignored`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
// ════════════════════════════════════════════════════════════════════════
    // SIA-R90: Role with implied hidden content has keyboard focus (WCAG 4.1.2)
    // Combines two patterns under one rule:
    //   A) Interactive ARIA role wraps nested interactive content
    //      (role="button" / "link" / "tab" etc. containing a real <button>,
    //       <a>, <input> etc. — AT cannot correctly announce double interactivity)
    //   B) Focusable element lives inside an opacity:0 ancestor
    //      (opacity:0 is NOT inherited, so the element stays in tab order
    //       while being completely invisible to sighted users)
    // ════════════════════════════════════════════════════════════════════════
    {
      const r90Seen = new Set<string>();

      // ── Pattern A: nested interactive content inside an interactive role ──
      const interactiveSel =
        "a[href], button, input, select, textarea, [role='button'], [role='link'], [role='menuitem'], [role='tab'], [tabindex]:not([tabindex='-1'])";
      const roleSel =
        "[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='option'],[role='switch'],[role='checkbox'],[role='radio'],[role='treeitem'],[role='menuitemcheckbox'],[role='menuitemradio']";

      document.querySelectorAll(roleSel).forEach((el) => {
        Array.from(el.querySelectorAll(interactiveSel))
          .filter((c) => c !== el)
          .forEach((child) => {
            const key = `${getSelector(el)}|${getSelector(child)}`;
            if (r90Seen.has(key)) return;
            r90Seen.add(key);
            results.push({
              ruleId: "SIA-R90",
              type: "Issue",
              impact: "serious",
              description:
                "Element with an interactive role contains nested interactive content — assistive technologies cannot correctly announce this",
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          });
      });

      document.querySelectorAll("a[href], button").forEach((el) => {
        const nestedRole = Array.from(el.querySelectorAll(roleSel)).find(
          (c) => c !== el,
        );
        if (!nestedRole) return;
        const key = `${getSelector(el)}|${getSelector(nestedRole)}`;
        if (r90Seen.has(key)) return;
        r90Seen.add(key);
        results.push({
          ruleId: "SIA-R90",
          type: "Issue",
          impact: "serious",
          description:
            "Interactive element contains a nested element with an interactive role",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      });

      // ── Pattern B: focusable element inside an opacity:0 ancestor ────────
      // opacity:0 hides visually but does NOT remove from tab order.
      // Uses an ancestor walk per focusable element (efficient, avoids querySelectorAll("*")).
      const r90FocusableSel =
        "a[href]:not([tabindex='-1']), button:not([disabled]):not([tabindex='-1']), input:not([disabled]):not([tabindex='-1']), select:not([disabled]):not([tabindex='-1']), textarea:not([disabled]):not([tabindex='-1'])";

      document.querySelectorAll(r90FocusableSel).forEach((el) => {
        const elStyle = window.getComputedStyle(el as HTMLElement);
        if (elStyle.display === "none" || elStyle.visibility === "hidden") return;

        let ancestor = (el as HTMLElement).parentElement;
        while (ancestor && ancestor !== document.documentElement) {
          const aStyle = window.getComputedStyle(ancestor);
          if (aStyle.display === "none") break;
          if (parseFloat(aStyle.opacity) === 0) {
            const key = getSelector(el);
            if (!r90Seen.has(key)) {
              r90Seen.add(key);
              results.push({
                ruleId: "SIA-R90",
                type: "Issue",
                impact: "serious",
                description:
                  "Focusable element is inside an opacity:0 container — visually invisible but still reachable by keyboard Tab",
                element: outerHtmlSnippet(el),
                selector: key,
              });
            }
            break;
          }
          ancestor = ancestor.parentElement;
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R10: Autocomplete attribute missing or invalid on personal data inputs (WCAG 1.3.5)
    // Alfa sia-r10: fully consistent with ACT rule 73f2c2.
    // ════════════════════════════════════════════════════════════════════════
    {
      // Valid autocomplete tokens per HTML spec
      const VALID_AUTOCOMPLETE_TOKENS = new Set([
        "name",
        "honorific-prefix",
        "given-name",
        "additional-name",
        "family-name",
        "honorific-suffix",
        "nickname",
        "username",
        "new-password",
        "current-password",
        "one-time-code",
        "organization-title",
        "organization",
        "street-address",
        "address-line1",
        "address-line2",
        "address-line3",
        "address-level4",
        "address-level3",
        "address-level2",
        "address-level1",
        "country",
        "country-name",
        "postal-code",
        "cc-name",
        "cc-given-name",
        "cc-additional-name",
        "cc-family-name",
        "cc-number",
        "cc-exp",
        "cc-exp-month",
        "cc-exp-year",
        "cc-csc",
        "cc-type",
        "transaction-currency",
        "transaction-amount",
        "language",
        "bday",
        "bday-day",
        "bday-month",
        "bday-year",
        "sex",
        "url",
        "photo",
        "tel",
        "tel-country-code",
        "tel-national",
        "tel-area-code",
        "tel-local",
        "tel-extension",
        "impp",
        "email",
        "webauthn",
      ]);
      document.querySelectorAll("input, select, textarea").forEach((el) => {
        if (!isVisibleRect(el)) return;
        const ac = el.getAttribute("autocomplete");
        if (!ac || ac === "on" || ac === "off") return; // "off" is valid
        // Check each token
        const tokens = ac.trim().toLowerCase().split(/\s+/);
        const lastToken = tokens[tokens.length - 1];
        if (!VALID_AUTOCOMPLETE_TOKENS.has(lastToken)) {
          results.push({
            ruleId: "SIA-R10",
            type: "Issue",
            impact: "moderate",
            description: `autocomplete="${ac}" contains an invalid token "${lastToken}"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
      // Detect personal-data inputs missing autocomplete
      const autocompleteMap: Record<string, string[]> = {
        name: [
          "name",
          "full-name",
          "first",
          "last",
          "given",
          "family",
          "fname",
          "lname",
        ],
        email: ["email", "mail", "e-mail"],
        tel: ["phone", "telephone", "mobile", "cell"],
        "street-address": ["address", "street", "addr"],
        "postal-code": ["zip", "postal", "postcode"],
        country: ["country"],
        bday: ["birth", "dob", "birthday"],
        username: ["username", "login"],
        "new-password": ["password", "passwd", "pwd"],
        "cc-number": ["card", "credit", "cardnumber"],
      };
      document
        .querySelectorAll(
          "input[type='text'], input[type='email'], input[type='tel'], input[type='password'], input:not([type])",
        )
        .forEach((el) => {
          if (!isVisible(el)) return;
          const input = el as HTMLInputElement;
          const ac = input.getAttribute("autocomplete");
          if (ac && ac !== "off") return;
          const name = (input.name || "").toLowerCase();
          const id = (input.id || "").toLowerCase();
          const placeholder = (input.placeholder || "").toLowerCase();
          const combined = `${name} ${id} ${placeholder}`;
          for (const [token, patterns] of Object.entries(autocompleteMap)) {
            if (
              patterns.some((p) => combined.includes(p)) ||
              combined.includes(token)
            ) {
              results.push({
                ruleId: "SIA-R10",
                type: "Issue",
                impact: "moderate",
                description: `Input collecting "${token}" data is missing autocomplete="${token}" attribute`,
                element: outerHtmlSnippet(el),
                selector: getSelector(el),
              });
              break;
            }
          }
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R9: Meta refresh / redirect without user control (WCAG 2.2.1)
    // Alfa sia-r9: consistent with ACT bc659a.
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("meta[http-equiv='refresh']").forEach((el) => {
      const content = el.getAttribute("content") || "";
      const match = content.match(/(\d+)/);
      const seconds = match ? parseInt(match[1], 10) : 0;
      if (seconds === 0) {
        results.push({
          ruleId: "SIA-R9",
          type: "Issue",
          impact: "serious",
          description: `<meta http-equiv="refresh"> causes an immediate page redirect`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      } else {
        results.push({
          ruleId: "SIA-R9",
          type: "Issue",
          impact: "moderate",
          description: `<meta http-equiv="refresh" content="${content}"> auto-refreshes the page after ${seconds}s without user control`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });
    // Links opening in new window without warning
    document
      .querySelectorAll("a[target='_blank'], a[target='_new']")
      .forEach((el) => {
        if (!isVisible(el)) return;
        const fullText = el.textContent || "";
        const ariaLabel = el.getAttribute("aria-label") || "";
        const title = el.getAttribute("title") || "";
        const combined = (
          fullText +
          " " +
          ariaLabel +
          " " +
          title
        ).toLowerCase();
        const warningPhrases = [
          "new window",
          "new tab",
          "opens in",
          "external",
          "new page",
          "neues",
          "nouvel",
        ];
        if (!warningPhrases.some((p) => combined.includes(p))) {
          const hasHiddenWarning = Array.from(el.querySelectorAll("*")).some(
            (child) => {
              const childText = (child.textContent || "").toLowerCase();
              return warningPhrases.some((p) => childText.includes(p));
            },
          );
          if (!hasHiddenWarning) {
            results.push({
              ruleId: "SIA-R9",
              type: "Issue",
              impact: "minor",
              description:
                "Link opens in a new window without warning the user",
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        }
      });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R47: Viewport zoom disabled (WCAG 1.4.4)
    // Alfa sia-r47: consistent with ACT rule b4f0c3.
    // ════════════════════════════════════════════════════════════════════════
    {
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (viewportMeta) {
        const content = viewportMeta.getAttribute("content") || "";
        if (
          content.includes("user-scalable=no") ||
          /maximum-scale\s*=\s*1(?![\d.])/.test(content)
        ) {
          results.push({
            ruleId: "SIA-R47",
            type: "Issue",
            impact: "serious",
            description: "Viewport zoom is disabled via meta tag",
            element: outerHtmlSnippet(viewportMeta),
            selector: 'meta[name="viewport"]',
          });
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R22: Video missing captions (WCAG 1.2.2)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("video").forEach((video) => {
      if (!(video instanceof HTMLVideoElement)) return;
      if (video.hasAttribute("muted")) return;
      if (isProgrammaticallyHidden(video)) return;
      if (
        video.hasAttribute("autoplay") &&
        video.hasAttribute("loop") &&
        video.hasAttribute("playsinline")
      )
        return;
      if (!isVisible(video)) return;
      const rect = video.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;
      const hasTrackCaptions = !!video.querySelector(
        'track[kind="captions"], track[kind="subtitles"]',
      );
      const hasTextTracks =
        video.textTracks &&
        Array.from(video.textTracks).some(
          (t: any) => t.kind === "captions" || t.kind === "subtitles",
        );
      const videoJsContainer = video.closest(".video-js");
      const hasVideoJsCaptions =
        !!videoJsContainer?.querySelector(
          ".vjs-subs-caps-button:not(.vjs-hidden)",
        ) &&
        !!videoJsContainer?.querySelector(
          ".vjs-menu-item.vjs-selected.vjs-subtitles-menu-item",
        );
      if (!hasTrackCaptions && !hasTextTracks && !hasVideoJsCaptions) {
        results.push({
          ruleId: "SIA-R22",
          type: "Issue",
          impact: "serious",
          description: "Video element may be missing captions",
          element: outerHtmlSnippet(video),
          selector: getSelector(video),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R31: Line height is below recommended minimum (WCAG 1.4.8 AAA)
    // Checks all visible text-containing elements — paragraphs, headings,
    // list items, table cells — for line-height < 1.5× the font size.
    // Broader than R73 (which only checks <p>).
    // ════════════════════════════════════════════════════════════════════════
    {
      const r31Flagged = new Set<string>();
      let r31Fails = 0;
      const TEXT_SELECTORS = "p, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd";
      for (const el of Array.from(document.querySelectorAll(TEXT_SELECTORS)).slice(0, 3000)) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isRendered(el)) continue;
        if ((el.innerText || "").trim().length < 10) continue;
        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        if (isNaN(fontSize) || fontSize === 0) continue;
        const lhRaw = style.lineHeight;
        let lhPx: number;
        let isNormal = false;
        if (!lhRaw || lhRaw === "normal") {
          lhPx = fontSize * 1.2;
          isNormal = true;
        } else if (lhRaw.endsWith("px")) {
          lhPx = parseFloat(lhRaw);
        } else {
          const num = parseFloat(lhRaw);
          lhPx = isNaN(num) ? fontSize * 1.2 : num > 0 && num < 10 ? fontSize * num : num;
        }
        const ratio = lhPx / fontSize;
        if (ratio >= 1.5) continue;
        const sel = getSelector(el);
        if (r31Flagged.has(sel)) continue;
        r31Flagged.add(sel);
        r31Fails++;
        results.push({
          ruleId: "SIA-R31",
          type: "Issue",
          impact: "moderate",
          description: isNormal
            ? `Line height is 'normal' (≈${(lhPx / fontSize).toFixed(2)}×) — minimum is 1.5× font-size`
            : `Line height ${ratio.toFixed(2)}× is below the 1.5× minimum (font-size: ${Math.round(fontSize)}px)`,
          element: outerHtmlSnippet(el),
          selector: sel,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R37: Video missing audio description (WCAG 1.2.5)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("video").forEach((video) => {
      if (!(video instanceof HTMLVideoElement)) return;
      if (!isVisible(video)) return;
      const tracks = Array.from(video.textTracks || []);
      const hasCaptions = tracks.some(
        (t: any) => t.kind === "captions" || t.kind === "subtitles",
      );
      const hasDescriptions = tracks.some(
        (t: any) => t.kind === "descriptions",
      );
      const videoJsContainer = video.closest(".video-js");
      const hasVideoJsCaptions =
        !!videoJsContainer?.querySelector(
          ".vjs-subs-caps-button:not(.vjs-hidden)",
        ) &&
        !!videoJsContainer?.querySelector(
          ".vjs-menu-item.vjs-selected.vjs-subtitles-menu-item",
        );
      const hasVideoJsDescriptions = !!videoJsContainer?.querySelector(
        ".vjs-descriptions-button:not(.vjs-disabled):not(.vjs-hidden)",
      );
      if (
        !hasDescriptions &&
        !hasVideoJsDescriptions &&
        !hasCaptions &&
        !hasVideoJsCaptions
      ) {
        results.push({
          ruleId: "SIA-R37",
          type: "Potential Issue",
          impact: "serious",
          description:
            "Video element is missing an audio description track (<track kind='descriptions'>)",
          element: outerHtmlSnippet(video),
          selector: getSelector(video),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R23: Audio/video without transcript (WCAG 1.2.1 / 1.2.3)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("audio, video").forEach((el) => {
      if (!isVisible(el)) return;
      const parent = el.parentElement;
      const nearby = parent ? parent.textContent?.toLowerCase() || "" : "";
      const transcriptKeywords = [
        "transcript",
        "text version",
        "text alternative",
        "caption",
      ];
      const describedBy = el.getAttribute("aria-describedby");
      if (!transcriptKeywords.some((k) => nearby.includes(k)) && !describedBy) {
        results.push({
          ruleId: "SIA-R23",
          type: "Issue",
          impact: "serious",
          description: `${el.tagName.toLowerCase()} element has no adjacent transcript link or text alternative`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R48: Media element autoplays with audio (WCAG 1.4.2)
    // ════════════════════════════════════════════════════════════════════════
    document
      .querySelectorAll("audio[autoplay], video[autoplay]")
      .forEach((el) => {
        if (!el.hasAttribute("muted")) {
          results.push({
            ruleId: "SIA-R48",
            type: "Issue",
            impact: "serious",
            description: "Media element is autoplaying with audio",
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // SIA-R50: Audio autoplay without controls
    document.querySelectorAll("audio").forEach((el) => {
      if (
        (el as HTMLAudioElement).autoplay &&
        !(el as HTMLAudioElement).controls
      ) {
        results.push({
          ruleId: "SIA-R50",
          type: "Issue",
          impact: "serious",
          description: "Audio element auto-plays without visible controls",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // SIA-R51: Audio without controls attribute
    document.querySelectorAll("audio:not([controls])").forEach((el) => {
      if (!isVisible(el)) return;
      if ((el as HTMLAudioElement).autoplay) return;
      results.push({
        ruleId: "SIA-R51",
        type: "Issue",
        impact: "serious",
        description: "Audio element is missing the controls attribute",
        element: outerHtmlSnippet(el),
        selector: getSelector(el),
      });
    });

    // SIA-R52: Video autoplay without controls
    document
      .querySelectorAll("video[autoplay]:not([controls])")
      .forEach((el) => {
        if (!isVisible(el)) return;
        results.push({
          ruleId: "SIA-R52",
          type: "Issue",
          impact: "serious",
          description: "Video auto-plays without controls",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R53: Headings not structured (level skipped) (WCAG 1.3.1)
    // ════════════════════════════════════════════════════════════════════════
    {
      const headings = Array.from(
        document.querySelectorAll("h1,h2,h3,h4,h5,h6"),
      ).filter((h) => isRendered(h));
      headings.forEach((h, i) => {
        if (i === 0) return;
        const prev = headings[i - 1];
        const prevLevel = parseInt(prev.tagName[1], 10);
        const currLevel = parseInt(h.tagName[1], 10);
        if (currLevel > prevLevel + 1) {
          results.push({
            ruleId: "SIA-R53",
            type: "Issue",
            impact: "moderate",
            description: `Heading level skipped: <${prev.tagName.toLowerCase()}> followed by <${h.tagName.toLowerCase()}> — level ${prevLevel + 1} is missing`,
            element: outerHtmlSnippet(h),
            selector: getSelector(h),
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R59: Page has no headings at all
    // ════════════════════════════════════════════════════════════════════════
    {
      const anyHeading = document.querySelector(
        "h1,h2,h3,h4,h5,h6,[role='heading']",
      );
      if (!anyHeading) {
        results.push({
          ruleId: "SIA-R59",
          type: "Issue",
          impact: "moderate",
          description: "Page contains no heading elements",
          element: "<body>",
          selector: "body",
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R64: Empty heading (WCAG 1.3.1 / 2.4.6)
    // Alfa: isRendered + no textContent + no accessible name from aria-label/aria-labelledby
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => {
      if (!isRendered(el)) return;
      if (!getAccessibleName(el)) {
        results.push({
          ruleId: "SIA-R64",
          type: "Potential Issue",
          impact: "moderate",
          description: `Empty ${el.tagName.toLowerCase()} element provides no accessible heading`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R34 / SIA-R78: Heading is not followed by content
    // R34: heading immediately followed by another heading (same or lower level)
    // R78: Alfa-specific — heading with no accessible content between it and next heading
    // ════════════════════════════════════════════════════════════════════════
    {
      const allHeadings = Array.from(
        document.querySelectorAll("h1,h2,h3,h4,h5,h6"),
      ).filter((h) => isRendered(h));
      allHeadings.forEach((h) => {
        const next = h.nextElementSibling;
        if (!next) return;
        if (/^H[1-6]$/i.test(next.tagName)) {
          results.push({
            ruleId: "SIA-R34",
            type: "Potential Issue",
            impact: "minor",
            description: `<${h.tagName.toLowerCase()}> heading "${(h.textContent || "").substring(0, 60)}" is immediately followed by another heading`,
            element: outerHtmlSnippet(h),
            selector: getSelector(h),
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R35: Text content not inside a landmark region (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    {
      const seenR35Parents = new Set<Element>();
      let r35Count = 0;
      function checkTextNodes(node: Node): void {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim() || "";
          if (text.length < 15) return;
          const parent = node.parentElement;
          if (!parent || seenR35Parents.has(parent)) return;
          if (!isRendered(parent)) return;
          if (!isInsideLandmark(parent)) {
            seenR35Parents.add(parent);
            r35Count++;
            results.push({
              ruleId: "SIA-R35",
              type: "Best Practice",
              impact: "minor",
              description: `Text "${text.substring(0, 80)}" is not contained within a landmark region`,
              element: outerHtmlSnippet(parent),
              selector: getSelector(parent),
            });
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          const tag = el.tagName?.toLowerCase();
          if (["script", "style", "noscript", "template"].includes(tag)) return;
          const role = el.getAttribute("role");
          const landmarkRoles = [
            "main",
            "navigation",
            "complementary",
            "contentinfo",
            "banner",
            "search",
            "form",
            "region",
          ];
          const alwaysStop = ["main", "nav", "aside", "form"];
          if (alwaysStop.includes(tag)) return;
          if (
            tag === "section" &&
            (el.hasAttribute("aria-label") ||
              el.hasAttribute("aria-labelledby"))
          )
            return;
          if (
            (tag === "header" || tag === "footer") &&
            !["article", "aside", "main", "nav", "section"].includes(
              (el.parentElement?.tagName || "").toLowerCase(),
            )
          )
            return;
          if (role && landmarkRoles.includes(role)) return;
          node.childNodes.forEach((child) => checkTextNodes(child));
        }
      }
      document.body.childNodes.forEach((child) => checkTextNodes(child));
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R54: aria-live="assertive" region is not aria-atomic="true" (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll('[aria-live="assertive"]').forEach((el) => {
      if (isProgrammaticallyHidden(el)) return;
      if (!el.querySelector("*")) return; // must have element descendants
      if (el.getAttribute("aria-atomic") !== "true") {
        results.push({
          ruleId: "SIA-R54",
          type: "Best Practice",
          impact: "moderate",
          description: `aria-live="assertive" region should also have aria-atomic="true" to prevent partial announcements`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R55 / SIA-R56: Same-role landmarks duplicate / non-unique names
    // ════════════════════════════════════════════════════════════════════════
    {
      type LandmarkInfo = { el: Element; role: string; name: string };
      const landmarks: LandmarkInfo[] = [];
      const landmarkSelectors = [
        { sel: "header:not([role])", role: "banner" },
        { sel: "footer:not([role])", role: "contentinfo" },
        { sel: "main:not([role])", role: "main" },
        { sel: "nav:not([role])", role: "navigation" },
        { sel: "aside:not([role])", role: "complementary" },
        { sel: "form[aria-label], form[aria-labelledby]", role: "form" },
        {
          sel: "section[aria-label], section[aria-labelledby]",
          role: "region",
        },
        { sel: "[role='banner']", role: "banner" },
        { sel: "[role='contentinfo']", role: "contentinfo" },
        { sel: "[role='main']", role: "main" },
        { sel: "[role='navigation']", role: "navigation" },
        { sel: "[role='complementary']", role: "complementary" },
        { sel: "[role='form']", role: "form" },
        { sel: "[role='region']", role: "region" },
        { sel: "[role='search']", role: "search" },
      ];
      for (const { sel, role } of landmarkSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          if (isProgrammaticallyHidden(el)) return;
          const name = (
            el.getAttribute("aria-label") ||
            document
              .getElementById(el.getAttribute("aria-labelledby") || "")
              ?.textContent?.trim() ||
            el.getAttribute("title") ||
            ""
          )
            .toLowerCase()
            .trim();
          landmarks.push({ el, role, name });
        });
      }
      // R55: same role + same name
      const byRoleName: Record<string, LandmarkInfo[]> = {};
      for (const info of landmarks) {
        if (!info.name) continue;
        const key = `${info.role}:${info.name}`;
        byRoleName[key] = byRoleName[key] || [];
        byRoleName[key].push(info);
      }
      for (const [key, group] of Object.entries(byRoleName)) {
        if (group.length < 2) continue;
        const [roleStr, ...nameParts] = key.split(":");
        const nameStr = nameParts.join(":");
        for (const { el } of group) {
          results.push({
            ruleId: "SIA-R55",
            type: "Potential Issue",
            impact: "moderate",
            description: `Multiple "${roleStr}" landmark regions share the accessible name "${nameStr}"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      }
      // R56: multiple of same role, not all unique names
      const byRole: Record<string, LandmarkInfo[]> = {};
      for (const info of landmarks) {
        byRole[info.role] = byRole[info.role] || [];
        byRole[info.role].push(info);
      }
      for (const [role, group] of Object.entries(byRole)) {
        if (group.length < 2) continue;
        const names = group.map((g) => g.name);
        for (const info of group) {
          const isDuplicate = names.filter((n) => n === info.name).length > 1;
          const isMissingName = !info.name;
          if (isMissingName || isDuplicate) {
            results.push({
              ruleId: "SIA-R56",
              type: "Potential Issue",
              impact: "moderate",
              description: isMissingName
                ? `Multiple "${role}" landmark regions exist — each must have a unique accessible name`
                : `Multiple "${role}" landmark regions share the name "${info.name}"`,
              element: outerHtmlSnippet(info.el),
              selector: getSelector(info.el),
            });
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R58 / SIA-R87: Skip link and main landmark
    // R87: page missing main landmark (Best Practice)
    // R58: page missing skip navigation link (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    {
      const hasMain = !!document.querySelector(
        "main, [role='main'], #main, #main-content, #maincontent, .main-content",
      );
      if (!hasMain) {
        results.push({
          ruleId: "SIA-R87",
          type: "Best Practice",
          impact: "moderate",
          description: "Page is missing a <main> landmark region",
          element: "<body>",
          selector: "body",
        });
      }
      const anchorLinks = Array.from(document.querySelectorAll("a[href^='#']"));
      const hasSkipLink = anchorLinks.some((link) => {
        const text = (
          link.textContent ||
          link.getAttribute("aria-label") ||
          ""
        ).toLowerCase();
        const href = link.getAttribute("href") || "#";
        return (
          href.length > 1 &&
          (text.includes("skip") ||
            text.includes("main content") ||
            text.includes("jump to") ||
            text.includes("go to content"))
        );
      });
      if (!hasSkipLink) {
        results.push({
          ruleId: "SIA-R58",
          type: "Best Practice",
          impact: "moderate",
          description: "Page is missing a skip navigation link",
          element: "<body>",
          selector: "body",
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R99: Missing main landmark (Issue)
    // ════════════════════════════════════════════════════════════════════════
    {
      if (!document.querySelector("main, [role='main']")) {
        results.push({
          ruleId: "SIA-R99",
          type: "Issue",
          impact: "moderate",
          description: "Page has no <main> landmark",
          element: null,
          selector: null,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R65: Focus indicator not visible (WCAG 2.4.7)
    // Detect CSS that removes focus outline without a visual replacement.
    // ════════════════════════════════════════════════════════════════════════
    {
      let hasFocusOutlineRemoved = false;
      let hasFocusReplacement = false;
      try {
        Array.from(document.styleSheets).forEach((sheet) => {
          try {
            Array.from(sheet.cssRules || []).forEach((rule) => {
              const text = rule.cssText || "";
              if (
                (text.includes(":focus") || text.includes(":focus-visible")) &&
                (text.includes("outline: none") ||
                  text.includes("outline:none") ||
                  text.includes("outline: 0") ||
                  text.includes("outline:0"))
              ) {
                hasFocusOutlineRemoved = true;
                if (
                  text.includes("box-shadow") ||
                  text.includes("border") ||
                  text.includes("background") ||
                  text.includes("text-decoration") ||
                  text.includes("filter") ||
                  text.includes("ring")
                ) {
                  hasFocusReplacement = true;
                }
              }
            });
          } catch {
            /* cross-origin */
          }
        });
      } catch {
        /* ignore */
      }
      if (hasFocusOutlineRemoved && !hasFocusReplacement) {
        results.push({
          ruleId: "SIA-R65",
          type: "Issue",
          impact: "serious",
          description:
            "CSS removes focus outline without providing a visible replacement focus indicator",
          element: null,
          selector: null,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R69: Text contrast insufficient (WCAG 1.4.3 AA — 4.5:1 / 3:1 large)
    // SIA-R30: Enhanced contrast insufficient (WCAG 1.4.6 AAA — 7:1 / 4.5:1 large)
    // Uses canvas-based color resolution to handle currentColor and rgba layers.
    // ════════════════════════════════════════════════════════════════════════
    {
      const isPurePunctuation = (s: string) =>
        /^[\p{P}\p{S}\p{Cf}\s]+$/u.test(s);
      const textLeafEls = Array.from(
        document.querySelectorAll(
          "p, h1, h2, h3, h4, h5, h6, span, a, button, label, li, td, th, div, blockquote, cite, figcaption, dt, dd, summary",
        ),
      )
        .filter((el) =>
          Array.from(el.childNodes).some(
            (n) =>
              n.nodeType === Node.TEXT_NODE &&
              (n.textContent?.trim()?.length || 0) > 3 &&
              !isPurePunctuation(n.textContent?.trim() || ""),
          ),
        )
        .slice(0, 500);

      let contrastAAFails = 0;
      let contrastAAAFails = 0;
      for (const el of textLeafEls) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isVisible(el)) continue;
        const style = window.getComputedStyle(el);
        // Use canvas to resolve computed color (handles currentColor, rgba, etc.)
        const l1 = getLuminanceFromColorString(style.color);
        const bgColor = getEffectiveBackground(el);
        const l2 = getLuminanceFromColorString(bgColor);
        if (l1 === null || l2 === null) continue;
        const ratio = getContrastRatio(l1, l2);
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = parseFloat(style.fontWeight);
        const isLarge =
          fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700);
        const aaMin = isLarge ? 3 : 4.5;
        const aaaMin = isLarge ? 4.5 : 7;
        if (ratio < aaMin && contrastAAFails < 20) {
          contrastAAFails++;
          results.push({
            ruleId: "SIA-R69",
            type: "Issue",
            impact: "serious",
            description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AA minimum (${aaMin}:1)`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        } else if (ratio >= aaMin && ratio < aaaMin && contrastAAAFails < 25) {
          contrastAAAFails++;
          results.push({
            ruleId: "SIA-R30",
            type: "Issue",
            impact: "minor",
            description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AAA enhanced minimum (${aaaMin}:1)`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      }
      // Non-text contrast: UI component borders/outlines
      document
        .querySelectorAll("input, select, textarea, button, a")
        .forEach((el) => {
          if (!isVisible(el)) return;
          const style = window.getComputedStyle(el);
          const borderColor = style.borderColor;
          const bgEl = getEffectiveBackground(el as HTMLElement);
          const borderLum = getLuminanceFromColorString(borderColor);
          const bgLum = getLuminanceFromColorString(bgEl);
          if (borderLum === null || bgLum === null) return;
          const ratio = getContrastRatio(borderLum, bgLum);
          if (ratio < 3.0) {
            results.push({
              ruleId: "SIA-R69",
              type: "Potential Issue",
              impact: "serious",
              description: `UI component border/outline has contrast ratio of ${ratio.toFixed(2)}:1 — below the 3:1 minimum for non-text elements`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R39: Image filename used as alt text (WCAG 1.1.1)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("img[alt]").forEach((el) => {
      if (!isVisible(el)) return;
      const alt = (el as HTMLImageElement).alt?.trim();
      if (!alt) return;
      const FILENAME_RE = /\.(jpg|jpeg|png|gif|svg|webp|avif|bmp|ico|tiff?)$/i;
      const CODENAME_RE = /^[a-z0-9_\-]+$/i;
      if (
        FILENAME_RE.test(alt) ||
        (CODENAME_RE.test(alt) && alt.length < 30 && alt.includes("_"))
      ) {
        results.push({
          ruleId: "SIA-R39",
          type: "Issue",
          impact: "moderate",
          description: `Image alt text "${alt}" appears to be a filename rather than a meaningful description`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R41 / SIA-R105: Multiple links with same text to different destinations
    // ════════════════════════════════════════════════════════════════════════
    {
      const linkTextMap: Map<string, Set<string>> = new Map();
      document.querySelectorAll("a[href]").forEach((el) => {
        if (!isVisible(el)) return;
        const text = getAccessibleName(el)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        if (!text || text.length < 2) return;
        const href = (el as HTMLAnchorElement).href || "";
        if (!href || href === window.location.href + "#" || href === "#")
          return;
        if (!linkTextMap.has(text)) linkTextMap.set(text, new Set());
        linkTextMap.get(text)!.add(href);
      });
      const seenText = new Set<string>();
      document.querySelectorAll("a[href]").forEach((el) => {
        if (!isVisible(el)) return;
        const text = getAccessibleName(el)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        if (!text || seenText.has(text)) return;
        const hrefs = linkTextMap.get(text);
        if (hrefs && hrefs.size > 1) {
          seenText.add(text);
          results.push({
            ruleId: "SIA-R41",
            type: "Issue",
            impact: "moderate",
            description: `Link text "${text}" is used for ${hrefs.size} different destinations — add aria-label to distinguish them`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R81: Ambiguous link text (WCAG 2.4.4 / 2.4.9)
    // ════════════════════════════════════════════════════════════════════════
    {
      const ambiguousPatterns =
        /^(click here|here|read more|more|learn more|details|info|information|link|this link|continue|go|view|see more|see details|download|submit|open|visit|press here|tap here|find out more)$/i;
      document.querySelectorAll("a").forEach((el) => {
        if (!isVisible(el)) return;
        const name = getAccessibleName(el).trim().replace(/\s+/g, " ");
        if (name && ambiguousPatterns.test(name)) {
          results.push({
            ruleId: "SIA-R81",
            type: "Issue",
            impact: "moderate",
            description: `Link text "${name}" is non-descriptive and does not explain the link destination`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R32: Target size too small (WCAG 2.5.5 — 24×24px minimum)
    // SIA-R111: Touch target too small — 24×24 enhanced
    // SIA-R113: Touch target too small (WCAG 2.5.8)
    // ════════════════════════════════════════════════════════════════════════
    {
      let targetSizeFailCount = 0;
      document
        .querySelectorAll(
          "a, button, [role='button'], [role='link'], input[type='checkbox'], input[type='radio'], select",
        )
        .forEach((el) => {
          if (!isVisible(el)) return;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          if (rect.width < 24 || rect.height < 24) {
            targetSizeFailCount++;
            results.push({
              ruleId: "SIA-R113",
              type: "Issue",
              impact: "moderate",
              description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px — below the 24×24px minimum touch target (WCAG 2.5.8)`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R44: Orientation restricted via CSS (WCAG 1.3.4)
    // ════════════════════════════════════════════════════════════════════════
    {
      let hasOrientationLock = false;
      try {
        Array.from(document.styleSheets).forEach((sheet) => {
          try {
            Array.from(sheet.cssRules || []).forEach((rule) => {
              if (rule instanceof CSSMediaRule) {
                const cond =
                  rule.conditionText || (rule as any).media?.mediaText || "";
                if (cond.includes("orientation") && cond.includes(":")) {
                  Array.from(rule.cssRules || []).forEach((inner) => {
                    if (inner instanceof CSSStyleRule) {
                      if (
                        inner.style.display === "none" ||
                        inner.style.visibility === "hidden"
                      ) {
                        hasOrientationLock = true;
                      }
                    }
                  });
                }
              }
            });
          } catch {
            /* cross-origin */
          }
        });
      } catch {
        /* ignore */
      }
      if (hasOrientationLock) {
        results.push({
          ruleId: "SIA-R44",
          type: "Issue",
          impact: "serious",
          description:
            "Content is restricted to a specific screen orientation via CSS",
          element: null,
          selector: null,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R45: Headers attribute on cell refers to valid cells (WCAG 1.3.1)
    // Alfa sia-r45: consistent with ACT rule a25f45.
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("table").forEach((table) => {
      if (!isVisible(table)) return;
      table.querySelectorAll("th").forEach((th) => {
        const scope = th.getAttribute("scope");
        if (!scope) {
          results.push({
            ruleId: "SIA-R45",
            type: "Issue",
            impact: "moderate",
            description: `Table header cell is missing a scope attribute (scope="col" or scope="row")`,
            element: outerHtmlSnippet(th),
            selector: getSelector(th),
          });
        }
      });
      // Validate headers= attribute references
      table.querySelectorAll("[headers]").forEach((cell) => {
        const ids = (cell.getAttribute("headers") || "")
          .split(/\s+/)
          .filter(Boolean);
        for (const id of ids) {
          const ref = document.getElementById(id);
          if (!ref || !table.contains(ref)) {
            results.push({
              ruleId: "SIA-R45",
              type: "Issue",
              impact: "serious",
              description: `headers="${id}" references an ID that doesn't exist in this table`,
              element: outerHtmlSnippet(cell),
              selector: getSelector(cell),
            });
          }
        }
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R46: Table data cell not associated with header (WCAG 1.3.1)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("table").forEach((table) => {
      if (!isVisible(table)) return;
      const hasHeaders = table.querySelector(
        "th, [role='columnheader'], [role='rowheader']",
      );
      if (!hasHeaders) return;
      table.querySelectorAll("td").forEach((td) => {
        const headersAttr = td.getAttribute("headers");
        const rowHeader = td
          .closest("tr")
          ?.querySelector("th[scope='row'], th[scope='rowgroup']");
        const row = td.closest("tr");
        const colIdx = Array.from(row?.children || []).indexOf(td);
        const colHeader =
          colIdx >= 0
            ? table.querySelector(
                `thead th:nth-child(${colIdx + 1}), thead td:nth-child(${colIdx + 1})`,
              )
            : null;
        if (!headersAttr && !rowHeader && !colHeader) {
          results.push({
            ruleId: "SIA-R46",
            type: "Issue",
            impact: "serious",
            description:
              "Table data cell cannot be associated with a header — use scope on <th> or headers attribute on <td>",
            element: outerHtmlSnippet(td),
            selector: getSelector(td),
          });
        }
      });
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R76: Data table has no header cells (WCAG 1.3.1)
    // SIA-R77: Table data cell not assigned to a header cell (WCAG 1.3.1)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("table").forEach((table) => {
      if (!isVisible(table)) return;
      const hasAnyTh = table.querySelector("th") !== null;
      if (!hasAnyTh && table.querySelectorAll("tr").length > 1) {
        results.push({
          ruleId: "SIA-R76",
          type: "Issue",
          impact: "serious",
          description:
            "Data table has no header cells (<th>) — use <th> to identify column and row headers",
          element: outerHtmlSnippet(table),
          selector: getSelector(table),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R60: Fieldset without legend (WCAG 1.3.1)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("fieldset").forEach((el) => {
      if (!isVisible(el)) return;
      const legend = el.querySelector("legend");
      if (!legend || !legend.textContent?.trim()) {
        results.push({
          ruleId: "SIA-R60",
          type: "Issue",
          impact: "serious",
          description: "<fieldset> is missing a <legend> element",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R84: Scrollable element not keyboard accessible (WCAG 2.1.1)
    // ════════════════════════════════════════════════════════════════════════
    {
      const isScrollable = (el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        const canScrollY =
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 4;
        const canScrollX =
          (style.overflowX === "auto" || style.overflowX === "scroll") &&
          el.scrollWidth > el.clientWidth + 4;
        return canScrollY || canScrollX;
      };
      const isKeyboardAccessible = (el: HTMLElement) => {
        if (el.tabIndex >= 0) return true;
        return !!el.querySelector(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
      };
      const isExcluded = (el: HTMLElement) => {
        const cls = typeof el.className === "string" ? el.className : "";
        if (
          cls.includes("sr-only") ||
          cls.includes("visually-hidden") ||
          cls.includes("screen-reader-only")
        )
          return true;
        if (el.closest('[aria-hidden="true"]')) return true;
        const style = window.getComputedStyle(el);
        return style.display === "none" || style.visibility === "hidden";
      };
      const scrollableCandidates = Array.from(document.querySelectorAll("*"))
        .filter((el): el is HTMLElement => el instanceof HTMLElement)
        .filter((el) => el !== document.documentElement && el !== document.body)
        .filter((el) => !isExcluded(el))
        .filter((el) => isScrollable(el));
      const inaccessible = scrollableCandidates.filter(
        (el) => !isKeyboardAccessible(el),
      );
      // Deduplicate: only deepest elements
      const deepest = inaccessible.filter(
        (el) =>
          !inaccessible.some((other) => other !== el && other.contains(el)),
      );
      deepest.forEach((el) => {
        results.push({
          ruleId: "SIA-R84",
          type: "Issue",
          impact: "moderate",
          description:
            "Scrollable element is not keyboard accessible — add tabindex='0'",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R107: Custom interactive element not keyboard accessible (WCAG 2.1.1)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("[onclick], [ondblclick]").forEach((el) => {
      if (!isVisible(el)) return;
      const tag = el.tagName.toLowerCase();
      if (
        [
          "a",
          "button",
          "input",
          "select",
          "textarea",
          "summary",
          "details",
          "label",
          "option",
        ].includes(tag)
      )
        return;
      const tabindex = el.getAttribute("tabindex");
      const isKbAccessible = tabindex !== null && tabindex !== "-1";
      const hasKeyboardHandler =
        el.getAttribute("onkeydown") ||
        el.getAttribute("onkeyup") ||
        el.getAttribute("onkeypress");
      if (!isKbAccessible || !hasKeyboardHandler) {
        results.push({
          ruleId: "SIA-R107",
          type: "Issue",
          impact: "serious",
          description: `<${tag}> has onclick but is ${!isKbAccessible ? "not keyboard focusable (missing tabindex)" : "missing keyboard event handler (onkeydown)"}`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R62: Color used as only visual means to distinguish links (WCAG 1.4.1)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("a").forEach((el) => {
      if (!isVisible(el)) return;
      const style = window.getComputedStyle(el);
      const parentStyle = el.parentElement
        ? window.getComputedStyle(el.parentElement)
        : null;
      if (!parentStyle) return;
      const hasUnderline = style.textDecoration.includes("underline");
      const hasBold =
        parseInt(style.fontWeight) >
        parseInt(parentStyle.fontWeight || "400") + 100;
      const hasOutline = style.outline !== "none" && style.outline !== "";
      const linkLum = getLuminanceFromColorString(style.color);
      const parentLum = getLuminanceFromColorString(parentStyle.color);
      if (
        linkLum !== null &&
        parentLum !== null &&
        linkLum !== parentLum &&
        !hasUnderline &&
        !hasBold &&
        !hasOutline
      ) {
        results.push({
          ruleId: "SIA-R62",
          type: "Issue",
          impact: "serious",
          description:
            "Link uses color as the only visual means to distinguish it from surrounding text",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R67: Decorative image exposed to assistive technologies (WCAG 1.1.1)
    // ════════════════════════════════════════════════════════════════════════
    document
      .querySelectorAll("img[role='presentation'], img[role='none']")
      .forEach((el) => {
        const alt = (el as HTMLImageElement).alt;
        if (alt && alt.trim() !== "") {
          results.push({
            ruleId: "SIA-R67",
            type: "Issue",
            impact: "minor",
            description: `Decorative image has non-empty alt text "${alt}" — use alt="" for decorative images`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R70: Deprecated HTML elements (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    {
      const DEPRECATED = [
        "acronym",
        "applet",
        "basefont",
        "bgsound",
        "big",
        "blink",
        "center",
        "content",
        "dir",
        "font",
        "frame",
        "frameset",
        "image",
        "keygen",
        "marquee",
        "menuitem",
        "nobr",
        "noembed",
        "noframes",
        "plaintext",
        "rb",
        "rtc",
        "shadow",
        "spacer",
        "strike",
        "tt",
        "xmp",
      ];
      DEPRECATED.forEach((tag) => {
        document.querySelectorAll(tag).forEach((el) => {
          if (!isVisible(el)) return;
          results.push({
            ruleId: "SIA-R70",
            type: "Issue",
            impact: "minor",
            description: `Deprecated HTML element <${tag}> — replace with a modern equivalent`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        });
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R71: Paragraph text is fully justified (WCAG 1.4.8 AAA)
    // Alfa: isVisible (full visibility check) for <p> elements.
    // ════════════════════════════════════════════════════════════════════════
    {
      let r71Count = 0;
      const r71Seen = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("p")).slice(
        0,
        600,
      )) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isVisible(el)) continue; // Alfa: isVisible (not isRendered) for R71
        if (!el.textContent?.trim()) continue;
        if (window.getComputedStyle(el).textAlign !== "justify") continue;
        const sel = getSelector(el);
        if (r71Seen.has(sel)) continue;
        r71Seen.add(sel);
        r71Count++;
        results.push({
          ruleId: "SIA-R71",
          type: "Best Practice",
          impact: "minor",
          description:
            "Paragraph has text-align:justify — justified text reduces readability",
          element: outerHtmlSnippet(el),
          selector: sel,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R72: Paragraph text in ALL CAPS (WCAG 1.4.8 AAA)
    // Alfa: isRendered (CSS only) for <p> with text-transform:uppercase.
    // ════════════════════════════════════════════════════════════════════════
    {
      let r72Count = 0;
      const r72Seen = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("p")).slice(
        0,
        400,
      )) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isRendered(el)) continue;
        if (!el.textContent?.trim()) continue;
        if (window.getComputedStyle(el).textTransform !== "uppercase") continue;
        const sel = getSelector(el);
        if (r72Seen.has(sel)) continue;
        r72Seen.add(sel);
        r72Count++;
        results.push({
          ruleId: "SIA-R72",
          type: "Issue",
          impact: "minor",
          description:
            "Paragraph has text-transform:uppercase — all-caps text reduces readability",
          element: outerHtmlSnippet(el),
          selector: sel,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R73: Line height below 1.5 (WCAG 1.4.8 AAA)
    // Alfa: isRendered (no getBoundingClientRect), ratio < 1.5 = fail.
    // ════════════════════════════════════════════════════════════════════════
    {
      const r73Flagged = new Set<string>();
      let r73Fails = 0;
      for (const el of Array.from(document.querySelectorAll("p")).slice(
        0,
        2000,
      )) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isRendered(el)) continue;
        if ((el.innerText || "").trim().length === 0) continue;
        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        if (isNaN(fontSize) || fontSize === 0) continue;
        const lhRaw = style.lineHeight;
        let lhPx: number;
        let isNormal = false;
        if (!lhRaw || lhRaw === "normal") {
          lhPx = fontSize * 1.2;
          isNormal = true;
        } else if (lhRaw.endsWith("px")) {
          lhPx = parseFloat(lhRaw);
        } else {
          const num = parseFloat(lhRaw);
          lhPx = isNaN(num) ? fontSize * 1.2 : fontSize * num;
          if (isNaN(parseFloat(lhRaw))) isNormal = true;
        }
        const ratio = lhPx / fontSize;
        if (ratio >= 1.5) continue;
        const sel = getSelector(el);
        if (r73Flagged.has(sel)) continue;
        r73Flagged.add(sel);
        r73Fails++;
        results.push({
          ruleId: "SIA-R73",
          type: "Best Practice",
          impact: "moderate",
          description: isNormal
            ? `Line height is 'normal' (< 1.5× font-size: ${Math.round(fontSize)}px)`
            : `Line height ${ratio.toFixed(2)}× is below 1.5 minimum`,
          element: outerHtmlSnippet(el),
          selector: sel,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R74: Font size is fixed (absolute units) (WCAG 1.4.8 AAA)
    // Uses "inherit trick" + "double parent trick" to detect explicit cascade.
    // ════════════════════════════════════════════════════════════════════════
    {
      let r74Count = 0;
      const r74Seen = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("p")).slice(
        0,
        600,
      )) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isRendered(el)) continue;
        if ((el.innerText || "").trim().length === 0) continue;
        const style = window.getComputedStyle(el);
        const origFS = parseFloat(style.fontSize);
        if (isNaN(origFS) || origFS <= 0) continue;
        const parent = el.parentElement;
        if (!parent) continue;
        // Step 1: inherit trick
        const savedVal = el.style.getPropertyValue("font-size");
        const savedPri = el.style.getPropertyPriority("font-size");
        el.style.setProperty("font-size", "inherit", "important");
        const inheritedFS = parseFloat(window.getComputedStyle(el).fontSize);
        el.style.removeProperty("font-size");
        if (savedVal) el.style.setProperty("font-size", savedVal, savedPri);
        if (Math.abs(origFS - inheritedFS) <= 0.2) continue; // just inheriting
        // Step 2: double parent trick
        const parentOrigFS = parseFloat(
          window.getComputedStyle(parent).fontSize,
        );
        if (isNaN(parentOrigFS) || parentOrigFS <= 0) continue;
        const savedParentFS = parent.style.getPropertyValue("font-size");
        const savedParentPri = parent.style.getPropertyPriority("font-size");
        parent.style.setProperty(
          "font-size",
          `${parentOrigFS * 2}px`,
          "important",
        );
        const doubledFS = parseFloat(window.getComputedStyle(el).fontSize);
        parent.style.removeProperty("font-size");
        if (savedParentFS)
          parent.style.setProperty("font-size", savedParentFS, savedParentPri);
        if (doubledFS / origFS >= 1.45) continue; // scales with parent = relative unit
        const sel = getSelector(el);
        if (r74Seen.has(sel)) continue;
        r74Seen.add(sel);
        r74Count++;
        results.push({
          ruleId: "SIA-R74",
          type: "Best Practice",
          impact: "minor",
          description: `Paragraph font-size is set in absolute units (${origFS.toFixed(1)}px) — use relative units (em, rem, %)`,
          element: outerHtmlSnippet(el),
          selector: sel,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R75: Font size below 9px (Custom)
    // ════════════════════════════════════════════════════════════════════════
    {
      let r75Count = 0;
      const r75Seen = new Set<string>();
      const R75_SEL =
        "p, li, a, button, label, td, th, blockquote, dd, dt, figcaption, h1, h2, h3, h4, h5, h6";
      for (const el of Array.from(document.querySelectorAll(R75_SEL)).slice(
        0,
        600,
      )) {
        if (!(el instanceof HTMLElement)) continue;
        const cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.closest("[aria-hidden='true']") || el.closest("[hidden]"))
          continue;
        const tag = el.tagName.toLowerCase();
        if (tag === "sup" || tag === "sub") continue;
        const fontSize = parseFloat(cs.fontSize);
        if (isNaN(fontSize) || fontSize >= 9) continue;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || text.length < 3) continue;
        // Inherit trick to confirm explicitly cascaded
        const savedVal = el.style.getPropertyValue("font-size");
        const savedPri = el.style.getPropertyPriority("font-size");
        el.style.setProperty("font-size", "inherit", "important");
        const inheritedFS = parseFloat(window.getComputedStyle(el).fontSize);
        el.style.removeProperty("font-size");
        if (savedVal) el.style.setProperty("font-size", savedVal, savedPri);
        if (Math.abs(fontSize - inheritedFS) < 1) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) continue;
        const sel = getSelector(el);
        if (r75Seen.has(sel)) continue;
        r75Seen.add(sel);
        r75Count++;
        results.push({
          ruleId: "SIA-R75",
          type: "Issue",
          impact: "moderate",
          description: `Font size ${fontSize.toFixed(1)}px is below the minimum of 9px`,
          element: outerHtmlSnippet(el),
          selector: sel,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R80: Line height is fixed (absolute units) (WCAG 1.4.8 AAA)
    // Uses "inherit trick" + "font-size double trick".
    // ════════════════════════════════════════════════════════════════════════
    {
      const getInheritedLH = (el: HTMLElement): number => {
        const savedVal = el.style.getPropertyValue("line-height");
        const savedPri = el.style.getPropertyPriority("line-height");
        el.style.setProperty("line-height", "inherit", "important");
        const lhStr = window.getComputedStyle(el).lineHeight;
        el.style.removeProperty("line-height");
        if (savedVal) el.style.setProperty("line-height", savedVal, savedPri);
        return lhStr === "normal" ? -1 : parseFloat(lhStr);
      };
      const doubleFSGetLH = (el: HTMLElement, fs: number): number => {
        const savedVal = el.style.getPropertyValue("font-size");
        const savedPri = el.style.getPropertyPriority("font-size");
        el.style.setProperty("font-size", fs * 2 + "px", "important");
        const lh = parseFloat(window.getComputedStyle(el).lineHeight);
        el.style.removeProperty("font-size");
        if (savedVal) el.style.setProperty("font-size", savedVal, savedPri);
        return lh;
      };
      let r80Count = 0;
      const r80Seen = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("p")).slice(
        0,
        600,
      )) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isRendered(el)) continue;
        if ((el.innerText || "").trim().length === 0) continue;
        const style = window.getComputedStyle(el);
        const lhRaw = style.lineHeight;
        if (lhRaw === "normal") continue;
        const origFS = parseFloat(style.fontSize);
        const origLH = parseFloat(lhRaw);
        if (isNaN(origLH) || isNaN(origFS) || origFS === 0) continue;
        const inheritedLH = getInheritedLH(el);
        if (inheritedLH > 0 && Math.abs(origLH - inheritedLH) <= 0.2) continue; // inheriting
        const newLH = doubleFSGetLH(el, origFS);
        if (newLH / origLH >= 1.45) continue; // scales = relative
        const sel = getSelector(el);
        if (r80Seen.has(sel)) continue;
        r80Seen.add(sel);
        r80Count++;
        results.push({
          ruleId: "SIA-R80",
          type: "Best Practice",
          impact: "moderate",
          description: `Line height is fixed (${Math.round(origLH)}px absolute unit) — use unitless multiplier (e.g. 1.5)`,
          element: outerHtmlSnippet(el),
          selector: sel,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R83: Text clipped when resized (WCAG 1.4.4)
    // ════════════════════════════════════════════════════════════════════════
    {
      let clippedCount = 0;
      const seen = new Set<string>();
      document.querySelectorAll("*").forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if (!isVisible(el)) return;
        const style = window.getComputedStyle(el);
        const cls = (el.className || "").toString().toLowerCase();
        if (
          cls.includes("sr-only") ||
          cls.includes("visually-hidden") ||
          cls.includes("screen-reader") ||
          cls.includes("a11y-hidden") ||
          cls.includes("offscreen")
        )
          return;
        if (style.clip !== "auto" || style.clipPath !== "none") return;
        if (el.clientHeight <= 1 || el.clientWidth <= 1) return;
        const text = el.textContent?.trim() || "";
        if (text.length < 10) return;
        const hasHiddenOverflow =
          ["hidden", "clip"].includes(style.overflow) ||
          ["hidden", "clip"].includes(style.overflowY) ||
          ["hidden", "clip"].includes(style.overflowX);
        if (!hasHiddenOverflow) return;
        const height = style.height;
        if (
          !height ||
          height === "auto" ||
          height.endsWith("%") ||
          height.includes("content")
        )
          return;
        const heightPx = parseFloat(height);
        if (isNaN(heightPx) || heightPx < 20 || heightPx > 80) return;
        const tag = el.tagName.toLowerCase();
        if (["a", "button", "section", "article", "nav"].includes(tag)) return;
        if (style.display === "flex" || style.display === "inline-flex") return;
        const paddingTop = parseFloat(style.paddingTop);
        const paddingBottom = parseFloat(style.paddingBottom);
        if (paddingTop + paddingBottom >= 10) return;
        if (
          el.scrollHeight > el.clientHeight ||
          el.scrollHeight >= el.clientHeight * 0.9
        ) {
          const selector = getSelector(el);
          if (seen.has(selector)) return;
          seen.add(selector);
          clippedCount++;
          results.push({
            ruleId: "SIA-R83",
            type: "Issue",
            impact: "moderate",
            description: `Element has fixed height (${height}) with overflow:hidden — text may be clipped when text size is increased`,
            element: outerHtmlSnippet(el),
            selector,
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R85: Paragraph text is fully italic (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    {
      let r85Count = 0;
      const r85Seen = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("p")).slice(
        0,
        600,
      )) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isVisible(el)) continue;
        if (!el.textContent?.trim()) continue;
        if (window.getComputedStyle(el).fontStyle !== "italic") continue;
        const sel = getSelector(el);
        if (r85Seen.has(sel)) continue;
        r85Seen.add(sel);
        r85Count++;
        results.push({
          ruleId: "SIA-R85",
          type: "Best Practice",
          impact: "minor",
          description:
            "Paragraph text is fully italic — avoid for long passages",
          element: outerHtmlSnippet(el),
          selector: sel,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R26: <abbr> without title attribute (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("abbr").forEach((el) => {
      if (!isVisible(el)) return;
      if (!el.getAttribute("title")?.trim()) {
        results.push({
          ruleId: "SIA-R26",
          type: "Best Practice",
          impact: "minor",
          description: `<abbr> element "${el.textContent?.trim()}" has no title attribute`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R79: <pre> element contains text outside <code>/<kbd>/<samp> (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("pre").forEach((el) => {
      if (!isRendered(el)) return;
      if (!isVisible(el)) return;
      if (!!el.closest("figure")) return;
      function hasUnwrappedText(node: Node): boolean {
        if (
          node.nodeType === Node.TEXT_NODE &&
          (node.textContent?.trim().length || 0) > 0
        )
          return true;
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = (node as Element).tagName.toLowerCase();
          if (["code", "kbd", "samp"].includes(tag)) return false;
          for (const child of Array.from(node.childNodes))
            if (hasUnwrappedText(child)) return true;
        }
        return false;
      }
      if (hasUnwrappedText(el)) {
        results.push({
          ruleId: "SIA-R79",
          type: "Best Practice",
          impact: "minor",
          description:
            "<pre> element contains text not wrapped in <code>, <kbd>, or <samp>",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R84(link): Link opens in new window without warning (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("a[target='_blank']").forEach((el) => {
      if (!isVisible(el)) return;
      const text = (el.textContent || "").toLowerCase();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();
      const hasWarning = ["new window", "new tab", "opens in", "external"].some(
        (w) => text.includes(w) || ariaLabel.includes(w) || title.includes(w),
      );
      const hasIconHint = el.querySelector(
        "[aria-label*='new'], [title*='new'], [aria-label*='external'], [title*='external']",
      );
      if (!hasWarning && !hasIconHint) {
        results.push({
          ruleId: "SIA-R84(link)",
          type: "Best Practice",
          impact: "moderate",
          description: "Link opens in a new window/tab without warning",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R91: letter-spacing set with !important below 0.12× (WCAG 1.4.12)
    // SIA-R92: word-spacing set with !important below 0.16× (WCAG 1.4.12)
    // SIA-R93: line-height set with !important below 1.5× (WCAG 1.4.12)
    // Alfa sia-r91/r92/r93: checks only elements where spacing is !important-locked.
    // ════════════════════════════════════════════════════════════════════════
    {
      const textEls = Array.from(
        document.querySelectorAll(
          "p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote",
        ),
      ).slice(0, 400);
      let r91Count = 0,
        r92Count = 0,
        r93Count = 0;
      const r91Seen = new Set<string>(),
        r92Seen = new Set<string>(),
        r93Seen = new Set<string>();

      for (const el of textEls) {
        if (!(el instanceof HTMLElement)) continue;
        if (!isVisible(el)) continue;
        const hasDirectText = Array.from(el.childNodes).some(
          (n) =>
            n.nodeType === Node.TEXT_NODE &&
            (n.textContent?.trim()?.length || 0) > 0,
        );
        if (!hasDirectText) continue;
        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        if (isNaN(fontSize) || fontSize <= 0) continue;

        // R91: letter-spacing
        {
          const origLSStr = style.letterSpacing;
          if (origLSStr && origLSStr !== "normal") {
            const origLS = parseFloat(origLSStr);
            if (!isNaN(origLS) && origLS / fontSize < 0.12) {
              if (isImportantBlocked(el, "letter-spacing", "999px")) {
                const sel = getSelector(el);
                if (!r91Seen.has(sel)) {
                  r91Seen.add(sel);
                  r91Count++;
                  results.push({
                    ruleId: "SIA-R91",
                    type: "Potential Issue",
                    impact: "moderate",
                    description: `letter-spacing is locked with !important (${origLS.toFixed(1)}px, ${(origLS / fontSize).toFixed(3)}× font-size) below 0.12× minimum`,
                    element: outerHtmlSnippet(el),
                    selector: sel,
                  });
                }
              }
            }
          }
        }

        // R92: word-spacing
        {
          const wsRaw = style.wordSpacing;
          if (wsRaw && wsRaw !== "normal") {
            const origWS = parseFloat(wsRaw);
            if (!isNaN(origWS) && origWS / fontSize < 0.16) {
              if (isImportantBlocked(el, "word-spacing", "999px")) {
                const sel = getSelector(el);
                if (!r92Seen.has(sel)) {
                  r92Seen.add(sel);
                  r92Count++;
                  results.push({
                    ruleId: "SIA-R92",
                    type: "Potential Issue",
                    impact: "moderate",
                    description: `word-spacing is locked with !important (${origWS.toFixed(1)}px, ${(origWS / fontSize).toFixed(3)}× font-size) below 0.16× minimum`,
                    element: outerHtmlSnippet(el),
                    selector: sel,
                  });
                }
              }
            }
          }
        }

        // R93: line-height
        {
          const lhRaw = style.lineHeight;
          if (lhRaw && lhRaw !== "normal") {
            const origLH = parseFloat(lhRaw);
            if (!isNaN(origLH) && origLH / fontSize < 1.5) {
              if (isImportantBlocked(el, "line-height", "999")) {
                const sel = getSelector(el);
                if (!r93Seen.has(sel)) {
                  r93Seen.add(sel);
                  r93Count++;
                  results.push({
                    ruleId: "SIA-R93",
                    type: "Potential Issue",
                    impact: "moderate",
                    description: `line-height is locked with !important (${(origLH / fontSize).toFixed(2)}× below 1.5× minimum)`,
                    element: outerHtmlSnippet(el),
                    selector: sel,
                  });
                }
              }
            }
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R94 (radio grouping): Radio buttons not in fieldset (WCAG 1.3.1)
    // ════════════════════════════════════════════════════════════════════════
    {
      const radioGroups: Record<string, HTMLInputElement[]> = {};
      document
        .querySelectorAll("input[type='radio']:not([disabled])")
        .forEach((el) => {
          const input = el as HTMLInputElement;
          if (!isVisible(input)) return;
          const name = input.name || "_ungrouped_";
          if (!radioGroups[name]) radioGroups[name] = [];
          radioGroups[name].push(input);
        });
      Object.values(radioGroups).forEach((inputs) => {
        if (inputs.length < 2) return;
        if (!inputs[0].closest("fieldset")) {
          results.push({
            ruleId: "SIA-R94",
            type: "Issue",
            impact: "moderate",
            description: `Radio button group "${inputs[0].name}" is not wrapped in a <fieldset> with <legend>`,
            element: outerHtmlSnippet(inputs[0]),
            selector: getSelector(inputs[0]),
          });
        }
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R98: Section landmark with no heading or accessible label
    // ════════════════════════════════════════════════════════════════════════
    document
      .querySelectorAll(
        "main, nav, aside, section, [role='region'], [role='complementary']",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        if (!!el.querySelector("h1,h2,h3,h4,h5,h6")) return;
        if (el.getAttribute("aria-label")?.trim()) return;
        if (el.getAttribute("aria-labelledby")) return;
        results.push({
          ruleId: "SIA-R98",
          type: "Potential Issue",
          impact: "minor",
          description: `${el.tagName.toLowerCase()} landmark region has no heading or accessible label`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R100: PDF link without accessible alternative (Best Practice)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("a[href]").forEach((el) => {
      if (!isVisible(el)) return;
      const href = (el as HTMLAnchorElement).href || "";
      if (!/\.pdf(\?|$|#)/i.test(href)) return;
      const nearby = el.parentElement?.textContent?.toLowerCase() || "";
      if (
        !/html version|accessible version|text version|word version|alternative format/i.test(
          nearby,
        )
      ) {
        results.push({
          ruleId: "SIA-R100",
          type: "Best Practice",
          impact: "moderate",
          description: `Link to PDF "${el.textContent?.trim() || href.split("/").pop()}" has no adjacent accessible alternative`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R115: Heading immediately followed by heading at same/higher level
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
      if (!isVisible(el)) return;
      let next = el.nextElementSibling;
      while (next && next.textContent?.trim() === "")
        next = next.nextElementSibling;
      if (!next) return;
      const nextTag = next.tagName?.toLowerCase();
      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(nextTag)) {
        const thisLevel = parseInt(el.tagName[1]);
        const nextLevel = parseInt(nextTag[1]);
        if (nextLevel <= thisLevel) {
          results.push({
            ruleId: "SIA-R115",
            type: "Potential Issue",
            impact: "minor",
            description: `<${el.tagName.toLowerCase()}> heading immediately followed by another heading at same/higher level`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIA-R117: element with role='img' has no accessible name (WCAG 1.1.1)
    // ════════════════════════════════════════════════════════════════════════
    document.querySelectorAll("[role='img']").forEach((el) => {
      if (!isVisible(el)) return;
      if (!getAccessibleName(el)) {
        results.push({
          ruleId: "SIA-R117",
          type: "Issue",
          impact: "critical",
          description:
            "Element with role='img' has no accessible name — add aria-label or aria-labelledby",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    return results;
  });

  // ─── Map results → ScanIssue with WCAG metadata ──────────────────────────
  const issues: ScanIssue[] = [];
  for (const r of results) {
    const wcag = WCAG_MAPPING[r.ruleId];
    const desc = RULE_DESCRIPTIONS[r.ruleId];
    const meta = RULE_DESCRIPTIONS[r.ruleId];
    issues.push({
      ruleId: r.ruleId,
      type: meta.type,
      impact: r.impact as ScanIssue["impact"],
      description: desc?.description
        ? `${desc.description}: ${r.description}`
        : r.description,
      element: r.element,
      wcagCriteria: wcag ? wcag.sc.join(", ") : null,
      wcagLevel: wcag ? wcag.level.join(", ") : null,
      selector: r.selector,
      remediation: desc?.remediation || null,
      legal: getLegalCompliance(wcag?.level || []),
    });
  }

  return issues;
  console.log(JSON.stringify(issues, null, 2));
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
