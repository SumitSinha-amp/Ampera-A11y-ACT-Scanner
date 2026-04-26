import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { execSync } from "child_process";
import { mkdirSync, rmSync, existsSync, readdirSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger";

puppeteerExtra.use(StealthPlugin());

function getChromiumPath(): string | undefined {
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
}

const WCAG_MAPPING: Record<string, { sc: string[]; level: string[] }> = {
  "SIA-R1": { sc: ["2.4.2"], level: ["A"] },
  "SIA-R2": { sc: ["1.1.1"], level: ["A"] },
  "SIA-R3": { sc: ["4.1.1"], level: ["A"] },
  "SIA-R4": { sc: ["3.1.1"], level: ["A"] },
  "SIA-R5": { sc: ["3.1.1"], level: ["A"] },
  "SIA-R6": { sc: ["3.1.1"], level: ["A"] },
  "SIA-R7": { sc: ["3.1.2"], level: ["AA"] },
  "SIA-R8": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R9": { sc: ["2.2.1"], level: ["A"] },
  "SIA-R10": { sc: ["1.3.5"], level: ["AA"] },
  "SIA-R11": { sc: ["2.4.4"], level: ["A"] },
  "SIA-R12": { sc: ["4.1.2"], level: ["A"] },
  "SIA-R13": { sc: ["3.2.2"], level: ["A"] },
  "SIA-R14": { sc: ["2.5.3"], level: ["A"] },
  "SIA-R15": { sc: ["4.1.2"], level: ["A"] },
  "SIA-R16": { sc: ["1.3.1", "4.1.2"], level: ["A", "WAI-ARIA"] },
  "SIA-R17": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R18": { sc: [], level: ["WAI-ARIA"] },
  "SIA-R19": { sc: ["1.3.1"], level: ["A", "WAI-ARIA"] },
  "SIA-R20": { sc: [], level: ["WAI-ARIA"] },
  "SIA-R21": { sc: ["1.2.2"], level: ["A"] },
  "SIA-R22": { sc: ["1.2.2"], level: ["A"] },
  "SIA-R23": { sc: ["1.2.1", "1.2.3"], level: ["A"] },
  "SIA-R25": { sc: ["2.5.3"], level: ["A"] },
  "SIA-R26": { sc: ["1.2.1"], level: ["A"] },
  "SIA-R27": { sc: ["1.2.2"], level: ["A"] },
  "SIA-R28": { sc: ["1.1.1", "4.1.2"], level: ["A"] },
  "SIA-R29": { sc: ["1.2.1"], level: ["A"] },
  "SIA-R30": { sc: ["1.4.6"], level: ["AAA"] },
  "SIA-R31": { sc: ["1.2.1"], level: ["A"] },
  "SIA-R32": { sc: ["2.5.5"], level: ["AAA"] },
  "SIA-R33": { sc: ["1.2.1"], level: ["A"] },
  "SIA-R34": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R35": { sc: ["1.2.1"], level: ["A"] },
  "SIA-R36": { sc: ["1.2.1"], level: ["A"] },
  "SIA-R37": { sc: ["1.2.5"], level: ["AA"] },
  "SIA-R38": { sc: ["1.2.3", "1.2.5", "1.2.8"], level: ["A", "AA", "AAA"] },
  "SIA-R39": { sc: ["1.1.1"], level: ["A"] },
  "SIA-R40": { sc: [], level: ["WAI-ARIA"] },
  "SIA-R41": { sc: ["2.4.9"], level: ["AAA"] },
  "SIA-R42": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R43": { sc: ["1.1.1"], level: ["A"] },
  "SIA-R44": { sc: ["1.3.4"], level: ["AA"] },
  "SIA-R45": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R46": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R47": { sc: ["1.4.4", "1.4.10"], level: ["AA"] },
  "SIA-R48": { sc: ["1.2.1"], level: ["A"] },
  "SIA-R49": { sc: ["1.2.1"], level: ["A"] },
  "SIA-R50": { sc: ["1.4.2"], level: ["A"] },
  "SIA-R51": { sc: ["1.4.2"], level: ["A"] },
  "SIA-R52": { sc: [], level: [""] },
  "SIA-R53": { sc: [], level: [""] },
  "SIA-R54": { sc: ["3.3.1", "4.1.3"], level: ["A", "AA"] },
  "SIA-R55": { sc: [], level: [""] },
  "SIA-R56": { sc: [], level: [""] },
  "SIA-R57": { sc: [], level: [""] },
  "SIA-R58": { sc: ["2.4.1"], level: ["A"] },
  "SIA-R59": { sc: [], level: [""] },
  "SIA-R60": { sc: [], level: [""] },
  "SIA-R61": { sc: [], level: [""] },
  "SIA-R62": { sc: ["1.4.1"], level: ["A"] },
  "SIA-R63": { sc: ["1.1.1"], level: ["A"] },
  "SIA-R64": { sc: ["1.3.1", "2.4.6"], level: ["A", "AA"] },
  "SIA-R65": { sc: ["2.4.7"], level: ["AA"] },
  "SIA-R66": { sc: ["1.4.6"], level: ["AAA"] },
  "SIA-R67": { sc: ["1.1.1"], level: ["A"] },
  "SIA-R68": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R69": { sc: ["1.4.3", "1.4.6"], level: ["AA", "AAA"] },
  "SIA-R70": { sc: [], level: [""] },
  "SIA-R71": { sc: ["1.4.8"], level: ["AAA"] },
  "SIA-R72": { sc: [], level: [""] },
  "SIA-R73": { sc: ["1.4.8"], level: ["AAA"] },
  "SIA-R74": { sc: ["1.4.8"], level: ["AAA"] },
  "SIA-R75": { sc: [], level: [""] },
  "SIA-R76": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R77": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R78": { sc: [], level: [""] },
  "SIA-R79": { sc: [], level: [""] },
  "SIA-R80": { sc: ["1.4.8"], level: ["AAA"] },
  "SIA-R81": { sc: ["2.4.4", "2.4.9"], level: ["A", "AAA"] },
  "SIA-R82": { sc: ["1.3.1"], level: ["A"] },
  "SIA-R83": { sc: ["1.4.4"], level: ["AA"] },
  "SIA-R84": { sc: ["2.1.1", "2.1.3"], level: ["A", "AAA"] },
  "SIA-R85": { sc: [], level: [""] },
  "SIA-R86": { sc: [], level: [""] },
  "SIA-R87": { sc: [], level: [""] },
  "SIA-R88": { sc: ["1.4.3", "1.4.6"], level: ["AA", "AAA"] },
  "SIA-R89": { sc: ["1.4.6"], level: ["AAA"] },
  "SIA-R90": { sc: ["4.1.2"], level: ["A"] },
  "SIA-R91": { sc: ["1.4.12"], level: ["AA"] },
  "SIA-R92": { sc: ["1.4.12"], level: ["AA"] },
  "SIA-R93": { sc: ["1.4.12"], level: ["AA"] },
  "SIA-R94": { sc: ["4.1.2"], level: ["A"] },
  "SIA-R95": { sc: ["2.1.1", "2.1.3"], level: ["AA", "AAA"] },
  "SIA-R96": { sc: ["2.2.4", "3.2.5"], level: ["AAA"] },
  "SIA-R97": { sc: [], level: [""] },
  "SIA-R98": { sc: [], level: [""] },
  "SIA-R99": { sc: [], level: [""] },
  "SIA-R100": { sc: [], level: [""] },
  "SIA-R101": { sc: [], level: [""] },
  "SIA-R102": { sc: [], level: [""] },
  "SIA-R103": { sc: ["1.4.3", "1.4.6"], level: ["AA", "AAA"] },
  "SIA-R104": { sc: ["1.4.6"], level: ["AAA"] },
  "SIA-R105": { sc: [], level: [""] },
  "SIA-R106": { sc: [], level: [""] },
  "SIA-R107": { sc: [], level: [""] },
  "SIA-R108": { sc: [], level: [""] },
  "SIA-R109": { sc: ["3.1.1"], level: ["A"] },
  "SIA-R110": { sc: ["3.1.1"], level: ["A"] },
  "SIA-R111": { sc: ["2.5.5"], level: ["AAA"] },
  "SIA-R112": { sc: [], level: [""] },
  "SIA-R113": { sc: ["2.5.8"], level: ["AA"] },
  "SIA-R114": { sc: ["2.4.2"], level: ["A"] },
  "SIA-R115": { sc: ["2.4.6"], level: ["AA"] },
  "SIA-R116": { sc: ["4.1.2"], level: ["A"] },
  "SIA-R117": { sc: ["1.1.1"], level: ["A"] },
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
    description: "Form field is not labeled",
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
    description: "Visible label is not included in the accessible name",
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
  "SIA-R17(1)": {
    type: "Issue",
    description: "Role with implied hidden content has keyboard focus",
    remediation: "Remove role from element with focusable elements",
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
    type: "Potential Issue",
    description: "Media alternative may be insufficient",
    remediation: "Ensure media alternatives fully convey the same information",
  },
  "SIA-R25": {
    type: "Issue",
    description: "Accessible name does not match visible label",
    remediation: "Ensure accessible name matches or includes visible text",
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
    type: "Best Practice",
    description: "Line height is below recommended minimum",
    remediation: "Ensure line-height is at least 1.5 for better readability",
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
    type: "Potential Issue",
    description: "Media alternative may be missing or incomplete",
    remediation: "Provide complete alternative content",
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
    type: "Potential Issue",
    description: "Moving content may not be controllable",
    remediation: "Provide controls to pause, stop, or hide moving content",
  },
  "SIA-R53": {
    type: "Issue",
    description: "Headings are not structured properly",
    remediation: "Ensure logical heading order (h1 → h2 → h3)",
  },
  "SIA-R54": {
    type: "Issue",
    description: "Status message is not announced to assistive technologies",
    remediation: "Use aria-live or role='status' for dynamic messages",
  },
  "SIA-R55": {
    type: "Potential Issue",
    description: "Sections with same name may serve different purposes",
    remediation: "Ensure consistent labeling and purpose of sections",
  },
  "SIA-R56": {
    type: "Potential Issue",
    description: "Region roles may be misused",
    remediation: "Ensure correct usage of ARIA landmark roles",
  },
  "SIA-R57": {
    type: "Issue",
    description: "Non-text contrast for UI components is insufficient",
    remediation: "Ensure contrast ratio of at least 3:1 for UI components",
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
    type: "Potential Issue",
    description: "Empty container element detected",
    remediation:
      "Remove empty elements or ensure they contain meaningful content",
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
    description: "Text spacing is inconsistent",
    remediation: "Ensure consistent and readable text spacing",
  },
  "SIA-R72": {
    type: "Best Practice",
    description: "Text is written in all capital letters",
    remediation: "Avoid using all caps for readability",
  },
  "SIA-R73": {
    type: "Best Practice",
    description: "Line height is too small",
    remediation: "Ensure line-height is at least 1.5",
  },
  "SIA-R74": {
    type: "Best Practice",
    description: "Font size is fixed",
    remediation: "Use relative units such as em or rem",
  },
  "SIA-R75": {
    type: "Potential Issue",
    description: "Font size may be too small",
    remediation: "Ensure text size is readable and scalable",
  },
  "SIA-R76": {
    type: "Issue",
    description: "Table header is missing or incorrectly defined",
    remediation: "Use proper <th> elements for table headers",
  },
  "SIA-R77": {
    type: "Issue",
    description: "Table data cells are not properly associated",
    remediation: "Ensure data cells are correctly associated with headers",
  },
  "SIA-R78": {
    type: "Potential Issue",
    description: "Heading is not followed by content",
    remediation: "Ensure headings are followed by meaningful content",
  },
  "SIA-R79": {
    type: "Best Practice",
    description: "Preformatted text element is misused",
    remediation: "Use <pre> only for preformatted content",
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
    description: "Semantic structure is missing",
    remediation: "Use proper HTML semantic elements",
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
    type: "Best Practice",
    description: "Word spacing is insufficient",
    remediation: "Ensure word spacing is at least 0.16em",
  },
  "SIA-R89": {
    type: "Best Practice",
    description: "Enhanced contrast is insufficient (AAA)",
    remediation: "Ensure contrast ratio of at least 7:1 where required",
  },
  "SIA-R90": {
    type: "Issue",
    description: "Element with ARIA role is incorrectly focusable",
    remediation: "Ensure correct use of tabindex and ARIA roles",
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

  logger.info(
    { profileDir: CHROME_PROFILE_DIR },
    "Launching browser for accessibility scanning",
  );

  const launchOptions = {
    headless: true as const,
    executablePath: getChromiumPath(),
    userDataDir: path.join(
      CHROME_PROFILE_DIR,
      `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ),
    args: PUPPETEER_LAUNCH_ARGS,
  };

  try {
    browserInstance = await puppeteerExtra.launch(launchOptions);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("SingletonLock") ||
      msg.includes("profile") ||
      msg.includes("already in use") ||
      msg.includes("process_singleton")
    ) {
      logger.warn(
        { error: msg },
        "Browser launch failed with profile lock error",
      );
    }
    throw err;
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
    executablePath: getChromiumPath(),
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
    waitForNetworkIdle?: boolean;
    bypassCSP?: boolean;
    rules?: string[];
    proxyPacUrl?: string;
    onStage?: (stage: string) => void | Promise<void>;
  } = {},
): Promise<PageScanResult> {
  const result = _scanMutex.then(() => _scanPageInternal(url, options));
  // Advance mutex even if this scan errors — never block the queue permanently
  _scanMutex = result.then(
    () => {},
    () => {},
  );
  return result;
}

async function _scanPageInternal(
  url: string,
  options: {
    timeout?: number;
    waitForNetworkIdle?: boolean;
    bypassCSP?: boolean;
    rules?: string[];
    proxyPacUrl?: string;
    onStage?: (stage: string) => void | Promise<void>;
  } = {},
): Promise<PageScanResult> {
  const {
    timeout = 180000,
    waitForNetworkIdle = true,
    bypassCSP = true,
    onStage,
  } = options;

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
    // Always navigate to domcontentloaded first — networkidle2 can hang forever on
    // pages with persistent analytics/tracking (long-polling, SSE, etc.)
    const httpResponse = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // Detect hard HTTP 4xx/5xx errors immediately (before any CF challenge handling)
    const httpStatus = httpResponse?.status() ?? 200;
    if (httpStatus === 404 || httpStatus === 410 || httpStatus === 403 || httpStatus >= 500) {
      logger.info({ url, httpStatus }, "HTTP error status — marking page as not available");
      return { url, issues: [], notAvailable: true, error: `HTTP ${httpStatus} – Page Not Available` };
    }

    await onStage?.("rendering");

    // Optionally wait for network to settle (up to 15s) — but never let it block scanning
    if (waitForNetworkIdle) {
      try {
        await page.waitForNetworkIdle({ idleTime: 400, timeout: 10000 });
      } catch {
        // Network didn't fully settle — that's fine, the DOM is ready; continue scanning
        logger.info(
          { url },
          "Network idle timeout — proceeding with available DOM",
        );
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

    // Detect "page not available" content returned with a 200 status
    // (common on enterprise sites that have their own custom 404 pages)
    // Only check the page <title> and the first <h1> — checking full body text
    // causes false positives when nav/footer menus mention these phrases.
    const isContentNotAvailable = await page.evaluate((): boolean => {
      const title = document.title.toLowerCase();
      const h1 = (document.querySelector("h1") as HTMLElement | null)?.innerText?.toLowerCase() ?? "";
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
      logger.info({ url }, "Page content indicates 'not available' — skipping scan");
      return { url, issues: [], notAvailable: true, error: "Page Not Available" };
    }

    logger.info({ url }, "Scrolling page to trigger lazy-loaded content");
    await fullyRenderPage(page, timeout);

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

        // ✅ THIS IS WHAT YOU WANT
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

    return { url, issues, screenshot, pageHtml };
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
          const cls = current.className
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .join(".");
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
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity) === 0
      )
        return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    }

    function getAccessibleName(el: Element): string {
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        return labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || "")
          .join(" ")
          .trim();
      }
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();
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
          // Return label text minus the control's own text
          const clone = parentLabel.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("input,select,textarea")
            .forEach((c) => c.remove());
          return clone.textContent?.trim() || "";
        }
        // Placeholder is the de-facto visible label when no explicit <label> exists
        if (el instanceof HTMLInputElement && el.placeholder)
          return el.placeholder;
        if (el instanceof HTMLTextAreaElement && el.placeholder)
          return el.placeholder;
      }
      return el.textContent?.trim() || "";
    }

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
          if (
            node.hasAttribute("aria-label") ||
            node.hasAttribute("aria-labelledby") ||
            node.hasAttribute("title")
          )
            return true;
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
      const rgb = [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
      ].map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }

    function getEffectiveBackground(el: HTMLElement): string {
      let bgColor = window.getComputedStyle(el).backgroundColor;
      let parent: HTMLElement | null = el.parentElement as HTMLElement | null;
      while (
        (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") &&
        parent
      ) {
        bgColor = window.getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement as HTMLElement | null;
      }
      if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)")
        bgColor = "rgb(255,255,255)";
      return bgColor;
    }

    // ─── ARIA prohibited attributes lookup ──────────────────────────────────
    // Attributes prohibited on specific roles (subset of WAI-ARIA spec)
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
    const ALL_ARIA_ATTRS = [
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
    ];

    // ─── Rules ──────────────────────────────────────────────────────────────

    // SIA-R1: Page title
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

    // SIA-R4: HTML lang
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

    // SIA-R3: Duplicate IDs — only flag IDs actually used in accessibility relationships
    // (aria-labelledby, aria-describedby, aria-controls, label[for], anchor links)
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

    // SIA-R2: Images without alt
    document.querySelectorAll("img").forEach((img) => {
      if (!img.hasAttribute("alt") && isVisible(img)) {
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

    // SIA-R43: SVG without accessible name
    document.querySelectorAll("svg").forEach((svg) => {
      if (svg.getAttribute("aria-hidden") === "true") return;
      if (svg.closest('[aria-hidden="true"]')) return;
      if (
        !svg.getAttribute("aria-label") &&
        !svg.getAttribute("aria-labelledby") &&
        !svg.querySelector("title")
      ) {
        // Only flag SVGs with meaningful size (not icon sprites)
        const rect = svg.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 20 && isVisible(svg)) {
          results.push({
            ruleId: "SIA-R43",
            type: "Issue",
            impact: "moderate",
            description: "SVG is missing an accessible name",
            element: outerHtmlSnippet(svg),
            selector: getSelector(svg),
          });
        }
      }
    });

    // SIA-R8: Form fields without labels
    document
      .querySelectorAll(
        "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']), textarea",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        if (!getAccessibleName(el)) {
          results.push({
            ruleId: "SIA-R8",
            type: "Issue",
            impact: "critical",
            description: "Form field has no accessible name",
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // SIA-R84: Scrollable elements must be keyboard accessible

    const isFocusable = (el: HTMLElement) => {
      return (
        el.tabIndex >= 0 ||
        el.hasAttribute("tabindex") ||
        el.matches(
          ".hover, [role='region'], a[href], button, [role='button'], [role='link']",
        )
      );
    };
    const isScrollable = (el: HTMLElement | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;

      const style = window.getComputedStyle(el);
      const canScroll =
        ["auto", "scroll"].includes(style.overflowY) ||
        ["auto", "scroll"].includes(style.overflowX);
      if (!canScroll) return false;
      const isVerticallyScrollable =
        (el?.scrollHeight || 0) > (el?.clientHeight || 0) + 2;

      const isHorizontallyScrollable =
        (el?.scrollWidth || 0) > (el?.clientWidth || 0) + 2;
      const hasHoverClass = (el: HTMLElement) => {
        if (!el) return false;

        return Array.from(el.classList).some((cls) =>
          cls.toLowerCase().includes("hover"),
        );
      };
      return (
        isVerticallyScrollable || isHorizontallyScrollable || hasHoverClass(el)
      );
    };

    const hasScrollableContentDeep = (el: HTMLElement) => {
      // check self
      if (el.scrollHeight > el.clientHeight + 1) return true;

      // check children
      const children = el.querySelectorAll<HTMLElement>(
        ".hover, [role='region'], a[href], button, [role='button'], [role='link']",
      );

      for (const child of Array.from(children)) {
        if (!child || !(child instanceof HTMLElement)) continue;

        const style = window.getComputedStyle(child);

        const canScroll =
          ["auto", "scroll"].includes(style.overflowY) ||
          ["auto", "scroll"].includes(style.overflowX);

        if (!canScroll) continue;

        if (child.scrollHeight > child.clientHeight + 1) {
          return true;
        }
      }

      return false;
    };
    const isKeyboardAccessible = (el: HTMLElement) => {
      if (!el) return false;

      // Pass if the element itself is in the tab order
      if (el.tabIndex >= 0) return true;

      // Pass if it contains focusable descendants that are NOT hidden from screen readers
      const focusable = el.querySelectorAll(
        '[role="region"],a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );

      const hasAccessibleFocus = Array.from(focusable).some((child) => {
        // If the focusable child is inside an aria-hidden block, it doesn't count for accessibility
        return !child.closest('[aria-hidden="true"]');
      });

      return hasAccessibleFocus;
    };

    const hasHoverReveal = (el: HTMLElement) => {
      // check inline styles (rare but cheap)
      const style = window.getComputedStyle(el);

      // quick heuristic: cursor pointer or region role
      if (style.cursor === "pointer") return true;

      // check CSS rules applied to this element
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (!(rule instanceof CSSStyleRule)) continue;

            const selector = rule.selectorText || "";

            // match hover/focus selectors targeting this element
            if (
              selector.includes(":hover") ||
              selector.includes(":focus") ||
              selector.includes(":focus-within")
            ) {
              try {
                if (
                  el.matches(
                    selector.replace(/:(hover|focus|focus-within)/g, ""),
                  )
                ) {
                  return true;
                }
              } catch (e) {}
            }
          }
        } catch (e) {
          // ignore cross-origin stylesheets
        }
      }

      return false;
    };
    const isContentClipped = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      if (rect.height < 30 || rect.width < 30) return false;

      return (
        el.scrollHeight > el.clientHeight + 1 ||
        el.scrollWidth > el.clientWidth + 1
      );
    };

    const isRootElement = (el: HTMLElement) => {
      return el === document.documentElement || el === document.body;
    };

    const getDeepestElements = (elements: HTMLElement[]) => {
      return elements.filter((el) => {
        return !elements.some((other) => other !== el && other.contains(el));
      });
    };

    // 3. The final integrated detection
    const scrollableCandidates = Array.from(document.querySelectorAll("*"))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .filter((el) => !isRootElement(el))
      // We remove the top-level 'isVisible' filter because .card-hover is hidden by default
      .filter(isScrollable);

    const inaccessibleScrollables = scrollableCandidates.filter(
      (el) => !isKeyboardAccessible(el),
    );

    // Filter for deepest elements to avoid redundant flags
    const finalElements = getDeepestElements(inaccessibleScrollables);

    // Output results
    finalElements.forEach((el) => {
      results.push({
        ruleId: "SIA-R84",
        type: "Issue",
        impact: "moderate",
        description: "Scrollable elements must be keyboard accessible",
        element: outerHtmlSnippet(el),
        selector: getSelector(el),
      });
    });
    // SIA-R8: Select without accessible name
    document.querySelectorAll("select").forEach((sel) => {
      if (!isVisible(sel)) return;
      if (!getAccessibleName(sel)) {
        results.push({
          ruleId: "SIA-R8",
          type: "Issue",
          impact: "serious",
          description: "Select element has no accessible name",
          element: outerHtmlSnippet(sel),
          selector: getSelector(sel),
        });
      }
    });

    // SIA-R14: Label in Name — visible label not in accessible name
    document
      .querySelectorAll("input:not([type='hidden']), select, textarea")
      .forEach((el) => {
        if (!isVisible(el)) return;

        const visibleLabel = getVisibleLabel(el);
        const accName = getAccessibleName(el);

        if (!visibleLabel || !accName) return;

        if (!accName.toLowerCase().includes(visibleLabel.toLowerCase())) {
          results.push({
            ruleId: "SIA-R14",
            type: "Issue",
            impact: "moderate",
            description: "Visible label not included in accessible name",
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    // SIA-R25: Label in Name — visible label not in accessible name
    document
      .querySelectorAll("a[href], button, [role='button'], [role='link']")
      .forEach((el) => {
        if (!isVisible(el)) return;

        const visibleText = (el as HTMLElement).innerText?.trim();
        const accName = getAccessibleName(el);

        if (!visibleText || !accName) return;

        if (!accName.toLowerCase().includes(visibleText.toLowerCase())) {
          results.push({
            ruleId: "SIA-R25",
            type: "Issue",
            impact: "moderate",
            description: "Visible text not included in accessible name",
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // SIA-R64- Empty headings
    document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
      if (!isVisible(h)) return;

      if (!h.textContent || h.textContent.trim() === "") {
        results.push({
          ruleId: "SIA-R64",
          type: "Potential Issue",
          impact: "moderate",
          description: "Heading is empty",
          element: outerHtmlSnippet(h),
          selector: getSelector(h),
        });
      }
    });
    // Also check buttons, links, tabs for label-in-name
    // Use el.innerText (browser-rendered text) so sr-only spans are excluded,
    // and use getAccessibleName (handles aria-label AND aria-labelledby)
    document
      .querySelectorAll(
        "a[href], button, [role='button'], [role='link'], [role='tab'], [role='menuitem']",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        // Only check elements that have an explicit accessible name override
        const hasAriaLabel = el.hasAttribute("aria-label");
        const hasAriaLabelledby = el.hasAttribute("aria-labelledby");
        if (!hasAriaLabel && !hasAriaLabelledby) return;
        // Use innerText — the browser's own rendering of visually-presented text (excludes sr-only, clips, hidden spans)
        const rawVisible =
          (el instanceof HTMLElement
            ? el.innerText?.replace(/\s+/g, " ")?.trim()
            : "") || "";
        if (!rawVisible || rawVisible.length < 2 || rawVisible.includes("<"))
          return;
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

    // SIA-R11: Links without accessible names
    document.querySelectorAll("a[href]").forEach((link) => {
      if (!isVisible(link)) return;
      const name = getAccessibleName(link);
      if (!name) {
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

    // SIA-R12: Buttons without accessible names
    document.querySelectorAll("button, [role='button']").forEach((btn) => {
      if (!isVisible(btn)) return;
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

    // SIA-R32: Interactive element does not meet enhanced target size (2.5.5 AAA - 24×24px)
    let targetSizeFailCount = 0;
    document
      .querySelectorAll(
        "a, button, [role='button'], [role='link'], input[type='checkbox'], input[type='radio'], select",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        if (targetSizeFailCount >= 50) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 24) {
          targetSizeFailCount++;
          results.push({
            ruleId: "SIA-R32",
            type: "Issue",
            impact: "minor",
            description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px, below the 24×24px enhanced target size`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // SIA-R34: Content missing after heading (heading followed immediately by another heading)
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    headings.forEach((h, i) => {
      if (!isVisible(h)) return;
      const next = h.nextElementSibling;
      if (!next) return;
      const nextTag = next.tagName.toLowerCase();
      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(nextTag)) {
        results.push({
          ruleId: "SIA-R34",
          type: "Potential Issue",
          impact: "minor",
          description: `<${h.tagName.toLowerCase()}> heading "${(h.textContent || "").substring(0, 60)}" is immediately followed by another heading with no content between`,
          element: outerHtmlSnippet(h),
          selector: getSelector(h),
        });
      }
    });

    // Heading hierarchy — detect skipped heading levels (e.g. h1 → h3 without h2)
    // Siteimprove: "Headings are not structured" (Accessibility best practices)
    const visibleHeadings = headings.filter((h) => isVisible(h));
    visibleHeadings.forEach((h, i) => {
      if (i === 0) return; // first heading has no predecessor to compare
      const prev = visibleHeadings[i - 1];
      const prevLevel = parseInt(prev.tagName[1], 10);
      const currLevel = parseInt(h.tagName[1], 10);
      // A heading that jumps more than one level down (e.g. h1→h3) skips a level
      if (currLevel > prevLevel + 1) {
        results.push({
          ruleId: "SIA-R53",
          type: "Issue",
          impact: "moderate",
          description: `Heading level skipped: <${prev.tagName.toLowerCase()}> is followed by <${h.tagName.toLowerCase()}> — level ${prevLevel + 1} is missing. "${(h.textContent || "").substring(0, 60)}"`,
          element: outerHtmlSnippet(h),
          selector: getSelector(h),
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
        if (text.length < 15) return; // ignore very short fragments (icons, punctuation)
        const parent = node.parentElement;
        if (!parent || seenR35Parents.has(parent)) return;
        if (!isVisible(parent)) return;
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
        // Stop descending into landmark elements — their content is fine.
        // Must mirror isInsideLandmark() logic exactly: unnamed <section> and nested header/footer are NOT landmarks.
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
            el.hasAttribute("aria-labelledby") ||
            el.hasAttribute("title"))
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

    // SIA-R36: ARIA attribute unsupported or prohibited
    document.querySelectorAll("[role]").forEach((el) => {
      const roles = (el.getAttribute("role") || "").split(/\s+/);
      for (const role of roles) {
        const prohibited = ARIA_PROHIBITED[role] || [];
        for (const attr of prohibited) {
          if (el.hasAttribute(attr)) {
            results.push({
              ruleId: "SIA-R36",
              type: "Issue",
              impact: "moderate",
              description: `aria-attribute "${attr}" is prohibited on role="${role}"`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        }
      }
    });
    // Check for ARIA attributes on native elements where ARIA is prohibited
    // Deduplicate: only report each unique (element type, attribute) combination once
    const r36Seen = new Set<string>();
    document
      .querySelectorAll("input[type='hidden'], meta, script, style")
      .forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const inputType = el.getAttribute("type") || "";
        const key = `${tag}[type=${inputType}]`;
        el.getAttributeNames()
          .filter((a) => a.startsWith("aria-"))
          .forEach((attr) => {
            const dedupKey = `${key}::${attr}`;
            if (r36Seen.has(dedupKey)) return;
            r36Seen.add(dedupKey);
            results.push({
              ruleId: "SIA-R36",
              type: "Issue",
              impact: "moderate",
              description: `ARIA attribute "${attr}" is not permitted on <${tag}>`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          });
      });

    // SIA-R42: List items outside lists
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

    // SIA-R47: Viewport zoom disabled
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

    // ─── SIA-R22: Video without captions (WCAG 1.2.2) ───────────────────────────

    document.querySelectorAll("video").forEach((video) => {
      if (!(video instanceof HTMLVideoElement)) return;

      // ─────────────────────────────
      // 1. Skip non-relevant videos
      // ─────────────────────────────

      // Muted / decorative videos
      if (video.hasAttribute("muted")) return;

      // Hidden via aria
      if (
        video.getAttribute("aria-hidden") === "true" ||
        video.closest('[aria-hidden="true"]')
      )
        return;

      // Background/ambient video pattern
      if (
        video.hasAttribute("autoplay") &&
        video.hasAttribute("loop") &&
        video.hasAttribute("playsinline")
      )
        return;

      // Not visible
      if (!isVisible(video)) return;

      // Very small → likely decorative
      const rect = video.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return;

      // ─────────────────────────────
      // 2. Native caption detection
      // ─────────────────────────────

      const hasTrackCaptions = !!video.querySelector(
        'track[kind="captions"], track[kind="subtitles"]',
      );

      // Runtime tracks (may be added dynamically)
      const hasTextTracks =
        video.textTracks &&
        Array.from(video.textTracks).some(
          (t: any) => t.kind === "captions" || t.kind === "subtitles",
        );

      // ─────────────────────────────
      // 3. Video.js detection (CRITICAL)
      // ─────────────────────────────

      const videoJsContainer = video.closest(".video-js");

      const hasVideoJsCaptionsButton = !!videoJsContainer?.querySelector(
        ".vjs-subs-caps-button:not(.vjs-hidden)",
      );

      const hasActiveVideoJsCaption = !!videoJsContainer?.querySelector(
        ".vjs-menu-item.vjs-selected.vjs-subtitles-menu-item",
      );

      const hasVideoJsCaptions =
        hasVideoJsCaptionsButton && hasActiveVideoJsCaption;

      // ─────────────────────────────
      // 4. Final decision (Siteimprove-aligned)
      // ─────────────────────────────

      const hasAnyCaptions =
        hasTrackCaptions || hasTextTracks || hasVideoJsCaptions;

      if (!hasAnyCaptions) {
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

    // SIA-R48: Audio autoplay
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

    // SIA-R40: Tables without headers
    document.querySelectorAll("table").forEach((table) => {
      const headers = table.querySelectorAll("th");
      if (headers.length === 0 && !table.getAttribute("role")) {
        results.push({
          ruleId: "SIA-R40",
          type: "Potential Issue",
          impact: "serious",
          description: "Data table is missing header cells",
          element: outerHtmlSnippet(table),
          selector: getSelector(table),
        });
      }
    });

    // SIA-R114: Iframes without title
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (!iframe.getAttribute("title")) {
        results.push({
          ruleId: "SIA-R114",
          type: "Issue",
          impact: "serious",
          description: "Iframe is missing a title attribute",
          element: outerHtmlSnippet(iframe),
          selector: getSelector(iframe),
        });
      }
    });

    // SIA-R21: Invalid ARIA roles
    const validRoles = [
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
    ];
    document.querySelectorAll("[role]").forEach((el) => {
      const roles = (el.getAttribute("role") || "").split(/\s+/);
      for (const role of roles) {
        if (role && !validRoles.includes(role)) {
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

    // SIA-R16: Missing required ARIA attrs
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

    // SIA-R87: Landmark regions — only flag if <main> is truly absent (including common CMS patterns)
    let hasMainLandmark = !!document.querySelector(
      "main, [role='main'], #main, #main-content, #maincontent, .main-content, #page-content, #content-main, #primary-content",
    );
    // Also check: if a skip link exists that points to an anchor, treat that as evidence of a main area
    if (!hasMainLandmark) {
      const skipLinkHref =
        (document.querySelector("a[href^='#']") as HTMLAnchorElement)?.href ||
        "";
      const anchor = skipLinkHref ? skipLinkHref.split("#")[1] : null;
      if (anchor && document.getElementById(anchor)) hasMainLandmark = true;
    }
    if (!hasMainLandmark) {
      results.push({
        ruleId: "SIA-R87",
        type: "Best Practice",
        impact: "moderate",
        description: "Page is missing a <main> landmark region",
        element: "<body>",
        selector: "body",
      });
    }

    // SIA-R58: Skip to content link — look for a link with skip-related text targeting an anchor
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
        ruleId: "SIA-R87",
        type: "Best Practice",
        impact: "moderate",
        description:
          "Page is missing a skip navigation link (a visible-on-focus link to the main content)",
        element: "<body>",
        selector: "body",
      });
    }

    // SIA-R65: Focus visible — only flag if outline is removed AND no visual replacement is provided
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
              // Check if there's a visual replacement in the same rule
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

    // SIA-R69: AA Contrast (4.5:1 normal / 3:1 large text)
    // SIA-R30: AAA Enhanced Contrast (7:1 normal / 4.5:1 large text)
    // Target: elements that directly contain text nodes (not just structural containers)
    let contrastAAFails = 0;
    let contrastAAAFails = 0;
    const allDomEls = Array.from(
      document.querySelectorAll(
        "p, h1, h2, h3, h4, h5, h6, span, a, button, label, li, td, th, div, blockquote, cite, figcaption, dt, dd, summary",
      ),
    );
    const textLeafEls = allDomEls
      .filter((el) => {
        // Must have at least one direct text node with meaningful content
        return Array.from(el.childNodes).some(
          (n) =>
            n.nodeType === Node.TEXT_NODE &&
            (n.textContent?.trim()?.length || 0) > 3,
        );
      })
      .slice(0, 500);
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
      const isLarge =
        fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700);
      const aaMin = isLarge ? 3 : 4.5;
      const aaaMin = isLarge ? 4.5 : 7;
      if (ratio < aaMin && contrastAAFails < 15) {
        contrastAAFails++;
        results.push({
          ruleId: "SIA-R69",
          type: "Issue",
          impact: "serious",
          description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AA minimum (${aaMin}:1)`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      } else if (ratio < aaaMin && ratio >= aaMin && contrastAAAFails < 25) {
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

    // SIA-R31: Line height (1.4.8 AAA / 1.4.12 AA) — target text leaf nodes including AEM divs
    let lineHeightFails = 0;
    const lineHeightEls = allDomEls
      .filter((el) => {
        return Array.from(el.childNodes).some(
          (n) =>
            n.nodeType === Node.TEXT_NODE &&
            (n.textContent?.trim()?.length || 0) > 15,
        );
      })
      .slice(0, 300);
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
        results.push({
          ruleId: "SIA-R31",
          type: "Best Practice",
          impact: "moderate",
          description: `Line height ${ratio.toFixed(2)}× is below the minimum 1.5× (font-size: ${Math.round(fontSize)}px, line-height: ${Math.round(lineHeight)}px)`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    }

    // SIA-R83: Text clipped when resized (1.4.4 Resize Text)
    // Flag elements with overflow:hidden + fixed height that contain text — at larger font sizes
    // the content will clip. This is a static/potential check (Siteimprove behaviour), not requiring
    // actual overflow at 1× zoom.
    // ─── SIA-R83: Text clipped when resized (WCAG 1.4.4) ───────────────────────

    let clippedCount = 0;
    const seen = new Set<string>();

    document.querySelectorAll("*").forEach((el) => {
      if (clippedCount >= 25) return;
      if (!(el instanceof HTMLElement)) return;
      if (!isVisible(el)) return;

      const style = window.getComputedStyle(el);

      // Skip hidden / sr-only
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

      if (
        style.position === "absolute" &&
        (parseFloat(style.marginLeft) < -100 ||
          parseFloat(style.marginTop) < -100)
      )
        return;

      if (el.clientHeight <= 1 || el.clientWidth <= 1) return;

      // Must contain visible text somewhere
      const text = el.textContent?.trim() || "";
      if (text.length < 10) return;

      // Overflow check
      const hasHiddenOverflow =
        ["hidden", "clip"].includes(style.overflow) ||
        ["hidden", "clip"].includes(style.overflowY) ||
        ["hidden", "clip"].includes(style.overflowX);

      if (!hasHiddenOverflow) return;

      // Fixed height check
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

      // ✅ KEY FIX: only pick deepest clipping element
      const childHasSameClipping = Array.from(el.children).some((child) => {
        if (!(child instanceof HTMLElement)) return false;

        const cs = window.getComputedStyle(child);

        const childOverflow =
          ["hidden", "clip"].includes(cs.overflow) ||
          ["hidden", "clip"].includes(cs.overflowY) ||
          ["hidden", "clip"].includes(cs.overflowX);

        const childHeight = parseFloat(cs.height);

        return (
          childOverflow &&
          !isNaN(childHeight) &&
          childHeight <= 80 &&
          (child.textContent?.trim()?.length || 0) > 0
        );
      });

      if (childHasSameClipping) return;
      const tag = el.tagName.toLowerCase();

      // Skip interactive containers
      if (["a", "button"].includes(tag)) return;

      // Skip common layout wrappers
      if (
        ["section", "article", "nav"].includes(tag) ||
        el.classList.contains("card") ||
        el.className.toLowerCase().includes("wrapper") ||
        el.className.toLowerCase().includes("container") ||
        el.className.toLowerCase().includes("grid")
      ) {
        return;
      }
      const textNode = Array.from(el.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim().length,
      );

      // If NO direct text AND multiple children → likely wrapper
      if (!textNode && el.children.length > 1) return;
      const deeperTextContainer = el.querySelector("*:not(script):not(style)");

      if (deeperTextContainer && deeperTextContainer !== el) {
        const childStyle = window.getComputedStyle(deeperTextContainer);

        const childOverflow =
          ["hidden", "clip"].includes(childStyle.overflow) ||
          ["hidden", "clip"].includes(childStyle.overflowY) ||
          ["hidden", "clip"].includes(childStyle.overflowX);

        if (childOverflow) return;
      }
      // Skip flex-based containers (buttons, CTAs, layout wrappers)
      if (style.display === "flex" || style.display === "inline-flex") {
        return;
      }
      const paddingTop = parseFloat(style.paddingTop);
      const paddingBottom = parseFloat(style.paddingBottom);

      // If element has enough vertical padding → it's likely a button/CTA
      const hasComfortPadding = paddingTop + paddingBottom >= 10;
      if (hasComfortPadding) return;

      //Skip if text is primarily inside an interactive child (like <a>, <button>)
      const hasInteractiveTextChild = Array.from(el.children).some((child) => {
        if (!(child instanceof HTMLElement)) return false;

        const tag = child.tagName.toLowerCase();

        const isInteractive = ["a", "button"].includes(tag);

        const hasText = (child.textContent?.trim()?.length || 0) > 0;

        return isInteractive && hasText;
      });

      if (hasInteractiveTextChild) return;
      // Resize risk
      const clientH = el.clientHeight;
      const scrollH = el.scrollHeight;

      //  Stronger condition: must already be tight or overflowing
      const isTightlyPacked = scrollH >= clientH * 0.9;

      // OR already overflowing (best signal)
      const isAlreadyClipping = scrollH > clientH;

      if (!isTightlyPacked && !isAlreadyClipping) return;

      // Deduplicate
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
    });

    // ─── SIA-R64: Empty headings ───────────────────────────────────────────────
    document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => {
      if (!isVisible(el)) return;
      const text = el.textContent?.trim() || "";
      const ariaLabel = el.getAttribute("aria-label")?.trim() || "";
      const labelledBy = el.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() || "")
            .join(" ")
            .trim()
        : "";
      if (!text && !ariaLabel && !labelledText) {
        results.push({
          ruleId: "SIA-R64",
          type: "Issue",
          impact: "moderate",
          description: `Empty ${el.tagName.toLowerCase()} element provides no accessible heading`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R9: Links open new window without warning ──────a��────────────────
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
          // Check for sr-only child with warning text
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
              description: `Link opens in a new window without warning the user`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        }
      });

    // ─── SIA-R23: Audio/video without transcript ──────────────────────────────
    document.querySelectorAll("audio, video").forEach((el) => {
      if (!isVisible(el)) return;
      // Look for a link or nearby text referencing a transcript
      const parent = el.parentElement;
      const nearby = parent ? parent.textContent?.toLowerCase() || "" : "";
      const transcriptKeywords = [
        "transcript",
        "text version",
        "text alternative",
        "caption",
      ];
      // Also check for aria-describedby pointing to transcript
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

    // ─── SIA-R37: Video without audio description (WCAG 1.2.5) ─────────────────

    document.querySelectorAll("video").forEach((video) => {
      if (!(video instanceof HTMLVideoElement)) return;
      if (!isVisible(video)) return;

      // ─────────────────────────────
      // 1. Native + runtime tracks
      // ─────────────────────────────

      const tracks = Array.from(video.textTracks || []);

      const hasCaptions = tracks.some(
        (t: any) => t.kind === "captions" || t.kind === "subtitles",
      );

      const hasDescriptions = tracks.some(
        (t: any) => t.kind === "descriptions",
      );

      // ─────────────────────────────
      // 2. Video.js detection (CRITICAL)
      // ─────────────────────────────

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

      // ─────────────────────────────
      // 3. Final decision (Siteimprove logic)
      // ─────────────────────────────

      const hasAnyCaptions = hasCaptions || hasVideoJsCaptions;

      const hasAnyDescriptions = hasDescriptions || hasVideoJsDescriptions;

      //  KEY: captions act as fallback → don't flag
      if (!hasAnyDescriptions && !hasAnyCaptions) {
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
    // ─── SIA-R17(1): Role with implied hidden content has keyboard focus ────────────────────────────
    const interactiveSelector =
      "a[href], button, input, select, textarea, [role='button'], [role='link'], [role='menuitem'], [role='tab'], [tabindex]:not([tabindex='-1'])";
    const roleSelector =
      "[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='option'],[role='switch'],[role='checkbox'],[role='radio'],[role='treeitem'],[role='menuitemcheckbox'],[role='menuitemradio']";
    const seenR17 = new Set<string>();
    document.querySelectorAll(roleSelector).forEach((el) => {
      const nestedInteractive = Array.from(
        el.querySelectorAll(interactiveSelector),
      ).filter((child) => child !== el);
      nestedInteractive.forEach((child) => {
        const key = `${getSelector(el)}|${getSelector(child)}`;
        if (seenR17.has(key)) return;
        seenR17.add(key);
        results.push({
          ruleId: "SIA-R17(1)",
          type: "Issue",
          impact: "serious",
          description:
            "Element with an interactive role contains nested interactive content.",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      });
    });
    document.querySelectorAll("a[href],button").forEach((el) => {
      const nestedRole = Array.from(el.querySelectorAll(roleSelector)).find(
        (child) => child !== el,
      );
      if (!nestedRole) return;
      const key = `${getSelector(el)}|${getSelector(nestedRole)}`;
      if (seenR17.has(key)) return;
      seenR17.add(key);
      results.push({
        ruleId: "SIA-R17(1)",
        type: "Issue",
        impact: "serious",
        description:
          "Interactive content contains an element with an interactive role.",
        element: outerHtmlSnippet(el),
        selector: getSelector(el),
      });
    });
    document.querySelectorAll(interactiveSelector).forEach((el) => {
      const ancestorInteractive = el.parentElement?.closest(roleSelector);
      if (ancestorInteractive && ancestorInteractive !== el) {
        const key = `${getSelector(ancestorInteractive)}|${getSelector(el)}`;
        if (seenR17.has(key)) return;
        seenR17.add(key);
        results.push({
          ruleId: "SIA-R17(1)",
          type: "Issue",
          impact: "serious",
          description:
            "Focusable interactive content is nested inside an interactive container.",
          element: outerHtmlSnippet(ancestorInteractive),
          selector: getSelector(ancestorInteractive),
        });
      }
    });

    // ─── SIA-R26: Abbreviation without title ──────────────────────────────────
    document.querySelectorAll("abbr").forEach((el) => {
      if (!isVisible(el)) return;
      const title = el.getAttribute("title")?.trim() || "";
      if (!title) {
        results.push({
          ruleId: "SIA-R26",
          type: "Best Practice",
          impact: "minor",
          description: `<abbr> element "${el.textContent?.trim()}" has no title attribute explaining the abbreviation`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R45: Table without caption ───────────────────────────────────────
    document.querySelectorAll("table").forEach((el) => {
      if (!isVisible(el)) return;
      const hasCaption = el.querySelector("caption") !== null;
      const hasSummary = el.getAttribute("summary")?.trim();
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() || "")
            .join(" ")
            .trim()
        : "";
      if (!hasCaption && !hasSummary && !ariaLabel && !labelledText) {
        results.push({
          ruleId: "SIA-R41",
          type: "Best Practice",
          impact: "moderate",
          description: `Table is missing a <caption> or accessible label to describe its purpose`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R10: Inputs missing autocomplete for personal data ───────────────
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
      username: ["username", "login", "user-name"],
      "new-password": ["password", "passwd", "pwd"],
      "current-password": [],
      "cc-number": ["card", "credit", "cardnumber"],
    };
    document
      .querySelectorAll(
        "input[type='text'], input[type='email'], input[type='tel'], input[type='password'], input:not([type])",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        const input = el as HTMLInputElement;
        if (
          input.getAttribute("autocomplete") &&
          input.getAttribute("autocomplete") !== "off"
        )
          return;
        const name = (input.name || "").toLowerCase();
        const id = (input.id || "").toLowerCase();
        const placeholder = (input.placeholder || "").toLowerCase();
        const combined = name + " " + id + " " + placeholder;
        for (const [token, patterns] of Object.entries(autocompleteMap)) {
          if (
            patterns.some((p) => combined.includes(p)) ||
            combined.includes(token)
          ) {
            results.push({
              ruleId: "SIA-R10",
              impact: "moderate",
              type: "Issue",
              description: `Input collecting "${token}" data is missing autocomplete="${token}" attribute`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
            break;
          }
        }
      });

    // ─── SIA-R113: Touch target too small (<24×24px) ───────────────────────────
    const interactiveTags = [
      "a",
      "button",
      "input",
      "select",
      "textarea",
      "summary",
      "[role='button']",
      "[role='link']",
      "[role='menuitem']",
      "[role='tab']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='switch']",
      "[tabindex]",
    ];
    document.querySelectorAll(interactiveTags.join(", ")).forEach((el) => {
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      if (rect.width < 24 || rect.height < 24) {
        results.push({
          ruleId: "SIA-R113",
          type: "Issue",
          impact: "moderate",
          description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px — below the 24×24px minimum touch target size (WCAG 2.5.8)`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R54: Status messages not in ARIA live region ─────────────────────
    // Look for elements that look like status/alert messages but lack live region markup
    const statusSelectors = [
      ".alert",
      ".notification",
      ".toast",
      ".message",
      ".success",
      ".error",
      ".warning",
      ".info",
      "[class*='alert']",
      "[class*='notification']",
      "[class*='toast']",
      "[class*='status']",
      "[class*='message']",
    ];
    document.querySelectorAll(statusSelectors.join(", ")).forEach((el) => {
      if (!isVisible(el)) return;
      if (
        el.tagName === "BODY" ||
        el.tagName === "MAIN" ||
        el.tagName === "HEADER" ||
        el.tagName === "FOOTER"
      )
        return;
      const role = el.getAttribute("role");
      const ariaLive = el.getAttribute("aria-live");
      const ariaAtomic = el.getAttribute("aria-atomic");
      if (!role && !ariaLive && !ariaAtomic) {
        const liveRoles = ["status", "alert", "log", "marquee", "timer"];
        if (!liveRoles.includes(role || "")) {
          results.push({
            ruleId: "SIA-R54",
            type: "Issue",
            impact: "moderate",
            description: `Element appears to be a status message but lacks aria-live or role="status"/"alert"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      }
    });

    // ─── SIA-R69: Non-text contrast for UI components ─────────────────────────
    function getLuminanceFromColor(colorStr: string): number | null {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
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
    document
      .querySelectorAll("input, select, textarea, button, a")
      .forEach((el) => {
        if (!isVisible(el)) return;
        const style = window.getComputedStyle(el);
        const borderColor = style.borderColor;
        const bgColor = style.backgroundColor;
        if (
          !borderColor ||
          borderColor === "transparent" ||
          borderColor === "rgba(0, 0, 0, 0)"
        )
          return;
        const borderLum = getLuminanceFromColor(borderColor);
        const bgLum = getLuminanceFromColor(bgColor || "#ffffff");
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

    // ─── SIA-R81: Ambiguous link text ─────────────────────────────────────────
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

    // ─── SIA-R98: Content section missing a heading ───────────────────────────
    const sectionLandmarks = [
      "main",
      "nav",
      "aside",
      "section",
      "[role='region']",
      "[role='complementary']",
    ];
    document.querySelectorAll(sectionLandmarks.join(", ")).forEach((el) => {
      if (!isVisible(el)) return;
      const hasHeading = el.querySelector("h1,h2,h3,h4,h5,h6") !== null;
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      if (!hasHeading && !ariaLabel && !labelledBy) {
        results.push({
          ruleId: "SIA-R98",
          type: "Potential Issue",
          impact: "minor",
          description: `${el.tagName.toLowerCase()} landmark region has no heading or accessible label`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R54: Form error not associated with its field ────────────────────
    const errorSelectors = [
      ".error",
      ".invalid",
      ".field-error",
      "[class*='error']",
      "[class*='invalid']",
      "[aria-invalid='true']",
    ];
    document.querySelectorAll(errorSelectors.join(", ")).forEach((el) => {
      if (!isVisible(el)) return;
      const text = el.textContent?.trim() || "";
      if (!text || text.length < 3) return;
      // It's a message — check if it's associated with a field
      const id = el.getAttribute("id");
      if (id) {
        // Good if some input points back to this id via aria-describedby
        const associated = document.querySelector(
          `[aria-describedby~="${CSS.escape(id)}"]`,
        );
        if (associated) return;
      }
      // Check parent form for aria-invalid inputs
      const parentForm = el.closest("form");
      if (parentForm) {
        const invalidInputs = parentForm.querySelectorAll(
          "[aria-invalid='true']",
        );
        if (invalidInputs.length > 0) return;
      }
      results.push({
        ruleId: "SIA-R54",
        type: "Issue",
        impact: "serious",
        description: `Error message "${text.substring(0, 80)}" is not programmatically associated with its form field via aria-describedby`,
        element: outerHtmlSnippet(el),
        selector: getSelector(el),
      });
    });

    // ─── SIA-R8: Form field missing label ────────────────────────────────────
    document
      .querySelectorAll(
        "input:not([type='hidden']):not([type='submit']):not([type='reset']):not([type='button']):not([type='image']), select, textarea",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        const name = getAccessibleName(el).trim();
        if (!name) {
          results.push({
            ruleId: "SIA-R8",
            type: "Issue",
            impact: "serious",
            description: `Form field has no associated label, aria-label, or aria-labelledby`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // ─── SIA-R75: Image of text -font size too small───────────────────────────────────────────────
    // Heuristic: img elements whose alt text contains word-like content (not empty, not "*", not pure symbols)
    // and are used in contexts that suggest they replace real text (nav, headings, buttons)
    document.querySelectorAll("img").forEach((el) => {
      if (!isVisible(el)) return;
      const alt = (el as HTMLImageElement).alt?.trim();
      if (!alt || alt.length < 3) return;
      // Skip purely decorative/icon images
      if (
        /^(icon|logo|image|photo|picture|thumbnail|avatar|banner|bg|background)$/i.test(
          alt,
        )
      )
        return;
      // Only flag images inside navigation, headings, or buttons — likely text replacement
      const inNavOrHeading = el.closest(
        "nav, h1, h2, h3, h4, h5, h6, button, [role='button'], [role='heading']",
      );
      if (!inNavOrHeading) return;
      // Flag if alt text is a phrase (contains spaces = text-like)
      if (alt.includes(" ") && alt.split(" ").length >= 2) {
        results.push({
          ruleId: "SIA-R75",
          type: "Potential Issue",
          impact: "moderate",
          description: `Image with alt="${alt}" inside a navigational or heading element may be an image of text`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R88: Word spacing too low ───────────────────────────────────────
    document
      .querySelectorAll(
        "p, li, td, th, div, span, article, section, main, h1, h2, h3, h4, h5, h6",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        if (!el.textContent?.trim()) return;
        const style = window.getComputedStyle(el);
        const wordSpacing = style.wordSpacing;
        const fontSize = parseFloat(style.fontSize);
        if (
          !wordSpacing ||
          wordSpacing === "normal" ||
          isNaN(fontSize) ||
          fontSize === 0
        )
          return;
        const wordSpacingPx = parseFloat(wordSpacing);
        if (isNaN(wordSpacingPx)) return;
        const minWordSpacing = 0.16 * fontSize;
        if (wordSpacingPx < -0.01 && Math.abs(wordSpacingPx) > minWordSpacing) {
          results.push({
            ruleId: "SIA-R88",
            type: "Best Practice",
            impact: "minor",
            description: `word-spacing is ${wordSpacing} (${(wordSpacingPx / fontSize).toFixed(2)}em) — negative word spacing below -0.16em may hinder readability`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // ─── SIA-R45: Table <th> missing scope attribute ──────────────────────────
    document.querySelectorAll("table").forEach((table) => {
      if (!isVisible(table)) return;
      table.querySelectorAll("th").forEach((th) => {
        const scope = th.getAttribute("scope");
        const ariaSort = th.getAttribute("aria-sort");
        if (!scope && !ariaSort) {
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
    });

    // ─── SIA-R60: Fieldset without legend ────────────────────────────────────
    document.querySelectorAll("fieldset").forEach((el) => {
      if (!isVisible(el)) return;
      const legend = el.querySelector("legend");
      if (!legend || !legend.textContent?.trim()) {
        results.push({
          ruleId: "SIA-R60",
          type: "Issue",
          impact: "serious",
          description: `<fieldset> is missing a <legend> element to describe the group of form controls`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R16: Expandable elements missing aria-expanded ──────────────────
    // Detect buttons/links that control collapsible panels but lack aria-expanded
    document
      .querySelectorAll(
        "button, [role='button'], a[href='#'], a[href='javascript:void(0)'], a[href='javascript:;']",
      )
      .forEach((el) => {
        if (!isVisible(el)) return;
        if (el.getAttribute("aria-expanded") !== null) return;
        if (el.getAttribute("aria-haspopup")) return;
        // Check if it controls something via aria-controls
        const controls = el.getAttribute("aria-controls");
        if (!controls) return;
        const controlled = document.getElementById(controls);
        if (controlled) {
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

    // ─── SIA-R17: aria-hidden has focusable element ────────────────────────────
    document.querySelectorAll("[aria-hidden='true']").forEach((el) => {
      const focusable = el.querySelectorAll(
        "a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      focusable.forEach((child) => {
        const tabindex = child.getAttribute("tabindex");
        if (tabindex === "-1") return;
        results.push({
          ruleId: "SIA-R17",
          type: "Issue",
          impact: "serious",
          description: `Focusable element is inside an aria-hidden="true" container — keyboard users can focus it but screen readers will not announce it`,
          element: outerHtmlSnippet(child),
          selector: getSelector(child),
        });
      });
    });
    // ─── SIA-R17(1): Role with implied hidden content has keyboard focus ────────────────────────────
    const hiddenInteractiveSelector =
      "a[href], button, input, select, textarea, [role='button'], [role='link'], [role='menuitem'], [role='tab'], [tabindex]:not([tabindex='-1'])";
    const hiddenRoleSelector =
      "[role='button'],[role='link'],[role='menuitem'],[role='tab'],[role='option'],[role='switch'],[role='checkbox'],[role='radio'],[role='treeitem'],[role='menuitemcheckbox'],[role='menuitemradio']";
    const hiddenSeenR17 = new Set<string>();
    document.querySelectorAll(hiddenRoleSelector).forEach((el) => {
      const nestedInteractive = Array.from(
        el.querySelectorAll(hiddenInteractiveSelector),
      ).filter((child) => child !== el);
      nestedInteractive.forEach((child) => {
        const key = `${getSelector(el)}|${getSelector(child)}`;
        if (hiddenSeenR17.has(key)) return;
        hiddenSeenR17.add(key);
        results.push({
          ruleId: "SIA-R17(1)",
          type: "Issue",
          impact: "serious",
          description:
            "Element with an interactive role contains nested interactive content.",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      });
    });
    document.querySelectorAll("a[href],button").forEach((el) => {
      const nestedRole = Array.from(
        el.querySelectorAll(hiddenRoleSelector),
      ).find((child) => child !== el);
      if (!nestedRole) return;
      const key = `${getSelector(el)}|${getSelector(nestedRole)}`;
      if (hiddenSeenR17.has(key)) return;
      hiddenSeenR17.add(key);
      results.push({
        ruleId: "SIA-R17(1)",
        type: "Issue",
        impact: "serious",
        description:
          "Interactive content contains an element with an interactive role.",
        element: outerHtmlSnippet(el),
        selector: getSelector(el),
      });
    });
    document.querySelectorAll(hiddenInteractiveSelector).forEach((el) => {
      const ancestorInteractive = el.parentElement?.closest(hiddenRoleSelector);
      if (ancestorInteractive && ancestorInteractive !== el) {
        const key = `${getSelector(ancestorInteractive)}|${getSelector(el)}`;
        if (hiddenSeenR17.has(key)) return;
        hiddenSeenR17.add(key);
        results.push({
          ruleId: "SIA-R17(1)",
          type: "Issue",
          impact: "serious",
          description:
            "Focusable interactive content is nested inside an interactive container.",
          element: outerHtmlSnippet(ancestorInteractive),
          selector: getSelector(ancestorInteractive),
        });
      }
    });
    // ─── SIA-R100: PDF links without accessible alternative ──────────────────
    document.querySelectorAll("a[href]").forEach((el) => {
      if (!isVisible(el)) return;
      const href = (el as HTMLAnchorElement).href || "";
      if (!/\.pdf(\?|$|#)/i.test(href)) return;
      // Check if there's a nearby "HTML version" or "accessible version" link
      const parent = el.parentElement;
      const nearby = parent?.textContent?.toLowerCase() || "";
      const hasAlternative =
        /html version|accessible version|text version|word version|alternative format/i.test(
          nearby,
        );
      if (!hasAlternative) {
        results.push({
          ruleId: "SIA-R100",
          type: "Best Practice",
          impact: "moderate",
          description: `Link to PDF "${el.textContent?.trim() || href.split("/").pop()}" has no adjacent accessible alternative format`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R9: Meta refresh causing auto-redirect or reload ───────────────
    document.querySelectorAll("meta[http-equiv='refresh']").forEach((el) => {
      const content = el.getAttribute("content") || "";
      const match = content.match(/(\d+)/);
      const seconds = match ? parseInt(match[1], 10) : 0;
      if (seconds === 0) {
        results.push({
          ruleId: "SIA-R9",
          type: "Issue",
          impact: "serious",
          description: `<meta http-equiv="refresh"> causes an immediate page redirect — users have no control over timing`,
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

    // ─── SIA-R41: Multiple links with same text → different destinations ─────
    const linkTextMap: Map<string, Set<string>> = new Map();
    document.querySelectorAll("a[href]").forEach((el) => {
      if (!isVisible(el)) return;
      const text = getAccessibleName(el)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (!text || text.length < 2) return;
      const href = (el as HTMLAnchorElement).href || "";
      if (!href || href === window.location.href + "#" || href === "#") return;
      if (!linkTextMap.has(text)) linkTextMap.set(text, new Set());
      linkTextMap.get(text)!.add(href);
    });
    linkTextMap.forEach((hrefs, text) => {
      if (hrefs.size > 1) {
        document.querySelectorAll("a[href]").forEach((el) => {
          if (!isVisible(el)) return;
          const elText = getAccessibleName(el)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
          if (elText === text) {
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
    });

    // ─── SIA-R107: Custom interactive element not keyboard accessible ──────────
    document.querySelectorAll("[onclick], [ondblclick]").forEach((el) => {
      if (!isVisible(el)) return;
      const tag = el.tagName.toLowerCase();
      // Native interactive elements are fine
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
      const role = el.getAttribute("role");
      const isKeyboardAccessible = tabindex !== null && tabindex !== "-1";
      const hasKeyboardHandler =
        el.getAttribute("onkeydown") ||
        el.getAttribute("onkeyup") ||
        el.getAttribute("onkeypress");
      if (!isKeyboardAccessible || !hasKeyboardHandler) {
        results.push({
          ruleId: "SIA-R107",
          type: "Issue",
          impact: "serious",
          description: `<${tag}> element has an onclick handler but is ${!isKeyboardAccessible ? "not keyboard focusable (missing tabindex)" : "missing keyboard event handler (onkeydown)"}`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R2: Figure missing figcaption-Image missing text alternative ──────────────────────────────────
    document.querySelectorAll("figure").forEach((el) => {
      if (!isVisible(el)) return;
      const figcaption = el.querySelector("figcaption");
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      if (!figcaption && !ariaLabel && !labelledBy) {
        results.push({
          ruleId: "SIA-R2",
          type: "Issue",
          impact: "minor",
          description: `<figure> element has no <figcaption> or accessible label to describe its content`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R116: Details element summary has no accessible name ─────────────
    document.querySelectorAll("details").forEach((el) => {
      if (!isVisible(el)) return;
      const summary = el.querySelector("summary");
      if (!summary) {
        results.push({
          ruleId: "SIA-R116",
          type: "Issue",
          impact: "serious",
          description: `<details> element is missing a <summary> child — screen readers cannot announce the disclosure widget`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
        return;
      }
      const text = summary.textContent?.trim() || "";
      const ariaLabel = summary.getAttribute("aria-label")?.trim() || "";
      if (!text && !ariaLabel) {
        results.push({
          ruleId: "SIA-R116",
          type: "Issue",
          impact: "serious",
          description: `<summary> element is empty — provide descriptive text so screen readers can announce the disclosure widget`,
          element: outerHtmlSnippet(summary),
          selector: getSelector(summary),
        });
      }
    });

    // ─── SIA-R63: Object element without accessible name ────────────────────
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
          description: `<object> element has no title, aria-label, or fallback text content`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R5: Page language is not a valid BCP 47 code ───────────────────
    {
      const lang = document.documentElement.getAttribute("lang")?.trim();
      if (lang) {
        // Simple BCP 47 validation: primary subtag 2–3 letters, optional subtags
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

    // ─── SIA-R6: Inconsistent lang declarations ──────────────────────────────
    {
      const rootLang = document.documentElement
        .getAttribute("lang")
        ?.trim()
        .split("-")[0]
        .toLowerCase();
      if (rootLang) {
        document.querySelectorAll("[lang]").forEach((el) => {
          if (el === document.documentElement) return;
          const elLang = el
            .getAttribute("lang")
            ?.trim()
            .split("-")[0]
            .toLowerCase();
          if (!elLang) return;
          // Flag only if the content element has exactly the same lang as root (redundant)
          // OR has an obviously invalid value
          const BCP47_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
          if (!BCP47_RE.test(el.getAttribute("lang") || "")) {
            results.push({
              ruleId: "SIA-R6",
              type: "Potential Issue",
              impact: "moderate",
              description: `Element has an invalid lang attribute "${el.getAttribute("lang")}"`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        });
      }
    }

    // ─── SIA-R13: Inline frame does not have an accessible name ─────────────
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

    // ─── SIA-R15: Multiple frames have identical accessible names ────────────
    {
      const frameTitles: Record<string, number> = {};
      document.querySelectorAll("iframe[title], frame[title]").forEach((el) => {
        const title = (el.getAttribute("title") || "").toLowerCase().trim();
        if (title) frameTitles[title] = (frameTitles[title] || 0) + 1;
      });
      document.querySelectorAll("iframe[title], frame[title]").forEach((el) => {
        const title = (el.getAttribute("title") || "").toLowerCase().trim();
        if (title && frameTitles[title] > 1) {
          results.push({
            ruleId: "SIA-R15",
            type: "Potential Issue",
            impact: "moderate",
            description: `Multiple frames share the same title "${el.getAttribute("title")}" — each frame should have a unique descriptive title`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ─── SIA-R20: Non-existent ARIA attribute ─i��──────────────────────────────
    {
      document.querySelectorAll("*").forEach((el) => {
        Array.from(el.attributes).forEach((attr) => {
          if (
            attr.name.startsWith("aria-") &&
            !ALL_ARIA_ATTRS.includes(attr.name)
          ) {
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
    }

    // ─── SIA-R19: Invalid value for ARIA attributes with allowed values ───────
    {
      const ARIA_BOOLEAN_ATTRS = [
        "aria-atomic",
        "aria-busy",
        "aria-disabled",
        "aria-modal",
        "aria-multiline",
        "aria-multiselectable",
        "aria-readonly",
        "aria-required",
      ];
      const ARIA_TRISTATE = [
        "aria-checked",
        "aria-pressed",
        "aria-selected",
        "aria-grabbed",
      ];
      const ARIA_LIVE_VALUES = ["off", "polite", "assertive"];
      const ARIA_ORIENTATION_VALUES = ["horizontal", "vertical"];
      const ARIA_SORT_VALUES = ["ascending", "descending", "none", "other"];
      const ARIA_CURRENT_VALUES = [
        "page",
        "step",
        "location",
        "date",
        "time",
        "true",
        "false",
      ];
      const ARIA_HASPOPUP_VALUES = [
        "false",
        "true",
        "menu",
        "listbox",
        "tree",
        "grid",
        "dialog",
      ];
      const ARIA_AUTOCOMPLETE_VALUES = ["inline", "list", "both", "none"];
      const ARIA_RELEVANT_VALUES = [
        "additions",
        "all",
        "removals",
        "text",
        "additions text",
      ];
      const ARIA_DROPEFFECT_VALUES = [
        "copy",
        "execute",
        "link",
        "move",
        "none",
        "popup",
      ];

      document.querySelectorAll("*").forEach((el) => {
        ARIA_BOOLEAN_ATTRS.forEach((attr) => {
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
        const live = el.getAttribute("aria-live");
        if (live !== null && !ARIA_LIVE_VALUES.includes(live)) {
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
        if (orient !== null && !ARIA_ORIENTATION_VALUES.includes(orient)) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-orientation="${orient}" is not valid — use "horizontal" or "vertical"`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const sort = el.getAttribute("aria-sort");
        if (sort !== null && !ARIA_SORT_VALUES.includes(sort)) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-sort="${sort}" is not valid — allowed: ascending, descending, none, other`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const current = el.getAttribute("aria-current");
        if (current !== null && !ARIA_CURRENT_VALUES.includes(current)) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-current="${current}" is not valid — allowed: page, step, location, date, time, true, false`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const haspopup = el.getAttribute("aria-haspopup");
        if (haspopup !== null && !ARIA_HASPOPUP_VALUES.includes(haspopup)) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-haspopup="${haspopup}" is not valid — use one of: false, true, menu, listbox, tree, grid, dialog`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
        const autocomplete = el.getAttribute("aria-autocomplete");
        if (
          autocomplete !== null &&
          !ARIA_AUTOCOMPLETE_VALUES.includes(autocomplete)
        ) {
          results.push({
            ruleId: "SIA-R19",
            type: "Issue",
            impact: "moderate",
            description: `aria-autocomplete="${autocomplete}" is not valid — use one of: inline, list, both, none`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ─── SIA-R28: Image button without accessible name ──────────────────────
    document.querySelectorAll("input[type='image']").forEach((el) => {
      if (!isVisible(el)) return;
      const alt = (el as HTMLInputElement).alt?.trim();
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      const title = el.getAttribute("title")?.trim();
      if (!alt && !ariaLabel && !labelledBy && !title) {
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

    // ─── SIA-R39: Image filename used as alt text ────────────────────────────
    document.querySelectorAll("img[alt]").forEach((el) => {
      if (!isVisible(el)) return;
      const alt = (el as HTMLImageElement).alt?.trim();
      if (!alt) return;
      // Check if alt looks like a filename: ends with extension or contains underscores/hyphens only
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

    // ─── SIA-R44: Orientation is restricted (CSS orientation lock) ──────────
    {
      const styles = Array.from(document.styleSheets);
      let hasOrientationLock = false;
      try {
        styles.forEach((sheet) => {
          try {
            Array.from(sheet.cssRules || []).forEach((rule) => {
              if (rule instanceof CSSMediaRule) {
                const cond =
                  rule.conditionText ||
                  (rule as unknown as { media: { mediaText: string } }).media
                    ?.mediaText ||
                  "";
                if (cond.includes("orientation") && cond.includes(":")) {
                  // Check if it completely hides content in one orientation
                  Array.from(rule.cssRules || []).forEach((inner) => {
                    if (inner instanceof CSSStyleRule) {
                      const decl = inner.style;
                      if (
                        decl.display === "none" ||
                        decl.visibility === "hidden"
                      ) {
                        hasOrientationLock = true;
                      }
                    }
                  });
                }
              }
            });
          } catch {
            /* cross-origin stylesheet */
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
            "Content or functionality appears to be restricted to a specific screen orientation via CSS",
          element: null,
          selector: null,
        });
      }
    }

    // ─── SIA-R46: Table data cells not associated with headers ───────────────
    document.querySelectorAll("table").forEach((table) => {
      if (!isVisible(table)) return;
      const hasHeaders = table.querySelector(
        "th, [role='columnheader'], [role='rowheader']",
      );
      if (!hasHeaders) return;
      const dataCells = table.querySelectorAll("td");
      dataCells.forEach((td) => {
        const headersAttr = td.getAttribute("headers");
        const scope = td
          .closest("tr")
          ?.querySelector("th[scope='row'], th[scope='rowgroup']");
        // Check if any th covers this td via column position
        const row = td.closest("tr");
        const colIdx = Array.from(row?.children || []).indexOf(td);
        const colHeader = table.querySelector(
          `thead th:nth-child(${colIdx + 1}), thead td:nth-child(${colIdx + 1})`,
        );
        if (!headersAttr && !scope && !colHeader) {
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

    // ─── SIA-R50: Auto-playing audio without controls ────────────────────────
    document.querySelectorAll("audio").forEach((el) => {
      if (
        (el as HTMLAudioElement).autoplay &&
        !(el as HTMLAudioElement).controls
      ) {
        results.push({
          ruleId: "SIA-R50",
          type: "Issue",
          impact: "serious",
          description:
            "Audio element auto-plays without visible controls — users cannot pause or stop it",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R51: Audio without controls attribute ───────────────────────────
    document.querySelectorAll("audio:not([controls])").forEach((el) => {
      if (!isVisible(el)) return;
      if ((el as HTMLAudioElement).autoplay) return; // already caught by R50
      results.push({
        ruleId: "SIA-R51",
        type: "Issue",
        impact: "serious",
        description:
          "Audio element is missing the controls attribute — users cannot control playback",
        element: outerHtmlSnippet(el),
        selector: getSelector(el),
      });
    });

    // ─── SIA-R52: Auto-playing video without controls ────────────────────────
    document
      .querySelectorAll("video[autoplay]:not([controls])")
      .forEach((el) => {
        if (!isVisible(el)) return;
        results.push({
          ruleId: "SIA-R52",
          type: "Issue",
          impact: "serious",
          description:
            "Video auto-plays without controls — users cannot pause, stop, or hide it",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      });

    // ─── SIA-R55: Landmark regions with duplicate accessible names ───────────
    {
      const regionNames: Record<string, number> = {};
      document
        .querySelectorAll(
          "section[aria-label], section[aria-labelledby], [role='region'][aria-label], [role='region'][aria-labelledby]",
        )
        .forEach((el) => {
          const name = (
            el.getAttribute("aria-label") ||
            document.getElementById(el.getAttribute("aria-labelledby") || "")
              ?.textContent ||
            ""
          )
            .toLowerCase()
            .trim();
          if (name) regionNames[name] = (regionNames[name] || 0) + 1;
        });
      document
        .querySelectorAll(
          "section[aria-label], section[aria-labelledby], [role='region'][aria-label], [role='region'][aria-labelledby]",
        )
        .forEach((el) => {
          const name = (
            el.getAttribute("aria-label") ||
            document.getElementById(el.getAttribute("aria-labelledby") || "")
              ?.textContent ||
            ""
          )
            .toLowerCase()
            .trim();
          if (name && regionNames[name] > 1) {
            results.push({
              ruleId: "SIA-R55",
              type: "Potential Issue",
              impact: "moderate",
              description: `Multiple landmark regions share the same accessible name "${name}" — each region should have a unique label`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        });
    }

    // ─── SIA-R62: Color used as the only visual means of conveying information
    {
      // Flag links that use only color to distinguish from surrounding text (no underline, no weight)
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
        // Check if color is the ONLY differentiator
        const linkColor = style.color;
        const parentColor = parentStyle.color;
        if (
          linkColor !== parentColor &&
          !hasUnderline &&
          !hasBold &&
          !hasOutline
        ) {
          results.push({
            ruleId: "SIA-R62",
            type: "Issue",
            impact: "serious",
            description:
              "Link uses color as the only visual means to distinguish it from surrounding text — add underline, bold, or another non-color indicator",
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ─── SIA-R67: Decorative image has non-empty alt text ───────────────────
    document
      .querySelectorAll("img[role='presentation'], img[role='none']")
      .forEach((el) => {
        const alt = (el as HTMLImageElement).alt;
        if (alt && alt.trim() !== "") {
          results.push({
            ruleId: "SIA-R67",
            type: "Issue",
            impact: "minor",
            description: `Decorative image (role="${el.getAttribute("role")}") has non-empty alt text "${alt}" — use alt="" for decorative images`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });

    // ─── SIA-R68: Empty heading element ─────────────────────────────────────
    document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
      if (!isVisible(el)) return;
      const text = getAccessibleName(el);
      if (!text) {
        results.push({
          ruleId: "SIA-R68",
          type: "Issue",
          impact: "serious",
          description: `<${el.tagName.toLowerCase()}> heading element is empty — provide descriptive heading text`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R70: Deprecated HTML elements   �f��────────────────────────────────
    {
      const DEPRECATED = [
        "marquee",
        "blink",
        "center",
        "font",
        "big",
        "strike",
        "tt",
        "u",
        "s",
        "acronym",
        "applet",
        "basefont",
        "dir",
        "listing",
        "plaintext",
        "xmp",
      ];
      DEPRECATED.forEach((tag) => {
        document.querySelectorAll(tag).forEach((el) => {
          if (!isVisible(el)) return;
          results.push({
            ruleId: "SIA-R70",
            type: "Issue",
            impact: "minor",
            description: `Deprecated HTML element <${tag}> is used — replace with a CSS equivalent or semantic alternative`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        });
      });
    }

    // ─── SIA-R72: Text in ALL CAPS ──────────────────────────────────────────
    {
      const TEXT_ELEMENTS = "p, li, td, th, span, div, label, dt, dd";
      document.querySelectorAll(TEXT_ELEMENTS).forEach((el) => {
        if (!isVisible(el)) return;
        // Only look at direct text nodes
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent || "")
          .join("")
          .trim();
        const style = window.getComputedStyle(el);
        const isAllCaps = style.textTransform === "uppercase";
        const hasLongAllCapsText =
          directText.length > 20 &&
          directText === directText.toUpperCase() &&
          /[A-Z]{5,}/.test(directText);
        if ((isAllCaps || hasLongAllCapsText) && directText.length > 20) {
          results.push({
            ruleId: "SIA-R72",
            type: "Issue",
            impact: "minor",
            description: `Text block uses ALL CAPS which reduces readability — avoid text-transform:uppercase or all-caps text for long passages`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ─── SIA-R76: Table missing header row or column ────────────────────────
    document.querySelectorAll("table").forEach((table) => {
      if (!isVisible(table)) return;
      const hasAnyTh = table.querySelector("th") !== null;
      const hasCaption = table.querySelector("caption") !== null;
      const hasAriaLabel =
        table.getAttribute("aria-label") ||
        table.getAttribute("aria-labelledby");
      const rows = table.querySelectorAll("tr");
      const hasMeaningfulData = rows.length > 1;
      if (!hasAnyTh && hasMeaningfulData) {
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

    // ─── SIA-R77: TH without scope attribute ────────────────────────────────
    document.querySelectorAll("table th").forEach((el) => {
      if (!isVisible(el)) return;
      const scope = el.getAttribute("scope");
      const id = el.getAttribute("id");
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      // If no scope and not referenced by any td[headers], flag it
      if (!scope && !ariaLabel) {
        results.push({
          ruleId: "SIA-R77",
          type: "Potential Issue",
          impact: "moderate",
          description: `<th> is missing a scope attribute — add scope="col" or scope="row" to clarify the header's direction`,
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R79: Link opens in new window without warning ──────────────────
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
          ruleId: "SIA-R79",
          type: "Issue",
          impact: "moderate",
          description:
            "Link opens in a new window/tab without warning — inform users by adding text like '(opens in new tab)' or a visually-hidden equivalent",
          element: outerHtmlSnippet(el),
          selector: getSelector(el),
        });
      }
    });

    // ─── SIA-R85: Form without a submit button ──────────────────────────────
    document.querySelectorAll("form").forEach((form) => {
      if (!isVisible(form)) return;
      const hasSubmit =
        form.querySelector(
          "button[type='submit'], input[type='submit'], button:not([type]), [role='button']",
        ) || form.closest("[data-submit]");
      if (!hasSubmit) {
        results.push({
          ruleId: "SIA-R85",
          type: "Potential Issue",
          impact: "moderate",
          description:
            "Form has no submit button — ensure users can submit the form via a button or other explicit control",
          element: outerHtmlSnippet(form),
          selector: getSelector(form),
        });
      }
    });

    // ─── SIA-R90: aria-hidden content contains focusable elements ───────────
    document.querySelectorAll("[aria-hidden='true']").forEach((container) => {
      const focusable = container.querySelectorAll(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (focusable.length > 0) {
        results.push({
          ruleId: "SIA-R90",
          type: "Issue",
          impact: "serious",
          description: `aria-hidden="true" container has ${focusable.length} focusable element(s) inside — focusable elements must not be inside aria-hidden regions`,
          element: outerHtmlSnippet(container),
          selector: getSelector(container),
        });
      }
    });

    // ─── SIA-R91: Letter-spacing too tight (text spacing) ───────────────────
    {
      const TEXT_NODES = "p, li, td, th, h1, h2, h3, h4, h5, h6";
      document.querySelectorAll(TEXT_NODES).forEach((el) => {
        if (!isVisible(el)) return;
        const style = window.getComputedStyle(el);
        const letterSpacing = parseFloat(style.letterSpacing);
        const fontSize = parseFloat(style.fontSize);
        // WCAG 1.4.12: letter spacing at least 0.12em
        if (!isNaN(letterSpacing) && !isNaN(fontSize) && fontSize > 0) {
          if (letterSpacing < 0 || letterSpacing / fontSize < -0.05) {
            results.push({
              ruleId: "SIA-R91",
              type: "Potential Issue",
              impact: "minor",
              description: `Letter spacing (${letterSpacing.toFixed(2)}px on ${fontSize.toFixed(0)}px font) is unusually tight and may reduce readability`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        }
      });
    }

    // ─── SIA-R93: Line height too small ─────────────────────────────────────
    {
      document.querySelectorAll("p, li, td, blockquote").forEach((el) => {
        if (!isVisible(el)) return;
        const style = window.getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight);
        const fontSize = parseFloat(style.fontSize);
        if (!isNaN(lineHeight) && !isNaN(fontSize) && fontSize > 0) {
          // WCAG 1.4.12: line height at least 1.5 times font size
          if (lineHeight / fontSize < 1.1) {
            results.push({
              ruleId: "SIA-R93",
              type: "Potential Issue",
              impact: "minor",
              description: `Line height (${(lineHeight / fontSize).toFixed(2)}em) is below the recommended 1.5em — increase for better readability`,
              element: outerHtmlSnippet(el),
              selector: getSelector(el),
            });
          }
        }
      });
    }

    // ─── SIA-R94: Group of inputs not in a fieldset ─────────────────────────
    {
      // Find radio buttons and checkboxes not inside fieldset
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
        const firstInFieldset = inputs[0].closest("fieldset");
        if (!firstInFieldset) {
          results.push({
            ruleId: "SIA-R94",
            type: "Issue",
            impact: "moderate",
            description: `Radio button group "${inputs[0].name}" is not wrapped in a <fieldset> with <legend> — group related controls for screen reader context`,
            element: outerHtmlSnippet(inputs[0]),
            selector: getSelector(inputs[0]),
          });
        }
      });
    }

    // ─── SIA-R99: Missing main landmark ─────────────────────────────────────
    {
      const hasMain = document.querySelector("main, [role='main']");
      if (!hasMain) {
        results.push({
          ruleId: "SIA-R99",
          type: "Issue",
          impact: "moderate",
          description:
            "Page has no <main> landmark — add a <main> element to identify the primary content region",
          element: null,
          selector: null,
        });
      }
    }

    // ─── SIA-R105: Multiple links with same text to different destinations ────
    {
      const linkMap: Record<string, Set<string>> = {};
      document.querySelectorAll("a[href]").forEach((el) => {
        if (!isVisible(el)) return;
        const text = getAccessibleName(el).toLowerCase().trim();
        const href = el.getAttribute("href") || "";
        if (!text || text.length < 2) return;
        if (!linkMap[text]) linkMap[text] = new Set();
        linkMap[text].add(href);
      });
      const seenText = new Set<string>();
      document.querySelectorAll("a[href]").forEach((el) => {
        if (!isVisible(el)) return;
        const text = getAccessibleName(el).toLowerCase().trim();
        if (!text || seenText.has(text)) return;
        if (linkMap[text] && linkMap[text].size > 1) {
          seenText.add(text);
          results.push({
            ruleId: "SIA-R105",
            type: "Potential Issue",
            impact: "moderate",
            description: `${linkMap[text].size} links share the text "${getAccessibleName(el)}" but point to different URLs — ensure link text is unique or use aria-label to disambiguate`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ─── SIA-R110: Invalid language code on HTML element ────────────────────
    {
      const lang = document.documentElement.getAttribute("lang")?.trim();
      if (lang) {
        // BCP 47: primary subtag must be 2-3 letters (ISO 639)
        const primary = lang.split("-")[0];
        const VALID_PRIMARY = /^[a-zA-Z]{2,3}$/;
        if (!VALID_PRIMARY.test(primary)) {
          results.push({
            ruleId: "SIA-R110",
            type: "Issue",
            impact: "serious",
            description: `HTML lang="${lang}" has an invalid primary language subtag "${primary}" — use a valid ISO 639 code (e.g., "en", "fr", "de")`,
            element: `<html lang="${lang}">`,
            selector: "html",
          });
        }
      }
    }

    // ─── SIA-R111: Touch target too small (< 24×24px) ───────────────────────
    {
      const INTERACTIVE =
        "a, button, input, select, textarea, [role='button'], [role='link'], [tabindex]:not([tabindex='-1'])";
      document.querySelectorAll(INTERACTIVE).forEach((el) => {
        if (!isVisible(el)) return;
        const rect = el.getBoundingClientRect();
        if (
          rect.width < 24 &&
          rect.height < 24 &&
          rect.width > 0 &&
          rect.height > 0
        ) {
          results.push({
            ruleId: "SIA-R111",
            type: "Potential Issue",
            impact: "moderate",
            description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px — WCAG 2.5.5 recommends at least 24×24px touch target`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      });
    }

    // ─── SIA-R115: Heading followed by no content ────────────────────────────
    document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
      if (!isVisible(el)) return;
      let next = el.nextElementSibling;
      // Skip whitespace-only elements
      while (next && next.textContent?.trim() === "")
        next = next.nextElementSibling;
      // If the next visible sibling is another heading of same or higher level (or nothing), flag it
      if (!next) return; // end of parent — not an issue
      const nextTag = next?.tagName?.toLowerCase();
      const tags = ["h1", "h2", "h3", "h4", "h5", "h6"];
      if (nextTag && tags.includes(nextTag)) {
        const thisLevel = parseInt(el.tagName[1]);
        const nextLevel = parseInt(nextTag[1]);
        if (nextLevel <= thisLevel) {
          results.push({
            ruleId: "SIA-R115",
            type: "Potential Issue",
            impact: "minor",
            description: `<${el.tagName.toLowerCase()}> heading "${el.textContent?.trim()?.substring(0, 60)}" is immediately followed by another heading at the same or higher level with no content between them`,
            element: outerHtmlSnippet(el),
            selector: getSelector(el),
          });
        }
      }
    });

    // ─── SIA-R117: role=img element without an accessible name ──────────────
    document.querySelectorAll("[role='img']").forEach((el) => {
      if (!isVisible(el)) return;
      const ariaLabel = el.getAttribute("aria-label")?.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      const title = el.getAttribute("title")?.trim();
      const text = el.textContent?.trim();
      if (!ariaLabel && !labelledBy && !title && !text) {
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
