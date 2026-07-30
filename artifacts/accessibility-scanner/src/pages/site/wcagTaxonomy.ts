// WCAG 2.1/2.2 taxonomy used to render the Compliance report pages
// (WCAG guidelines / European Accessibility Act / ADA Title II).
// EAA (EN 301 549) numbers each clause with a "9." prefix over the same WCAG
// success criteria; ADA Title II's DOJ rule adopts WCAG 2.1 AA verbatim, so
// all three frameworks share this same taxonomy — only the SC prefix/label
// and framing copy differ per framework.

export interface SuccessCriterion {
  sc: string;
  name: string;
  level: "A" | "AA" | "AAA";
}

export interface Category {
  id: string;
  name: string;
  criteria: SuccessCriterion[];
}

export interface Principle {
  id: string;
  name: string;
  description: string;
  categories: Category[];
}

export const WCAG_TAXONOMY: Principle[] = [
  {
    id: "1",
    name: "Principle 1: Perceivable",
    description: "Information and user interface components must be perceivable to all users.",
    categories: [
      {
        id: "1.1", name: "1.1 Text Alternatives", criteria: [
          { sc: "1.1.1", name: "Non-text Content", level: "A" },
        ],
      },
      {
        id: "1.2", name: "1.2 Time-based Media", criteria: [
          { sc: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A" },
          { sc: "1.2.2", name: "Captions (Prerecorded)", level: "A" },
          { sc: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A" },
          { sc: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA" },
          { sc: "1.2.8", name: "Media Alternative (Prerecorded)", level: "AAA" },
        ],
      },
      {
        id: "1.3", name: "1.3 Adaptable", criteria: [
          { sc: "1.3.1", name: "Info and Relationships", level: "A" },
          { sc: "1.3.4", name: "Orientation", level: "AA" },
          { sc: "1.3.5", name: "Identify Input Purpose", level: "AA" },
        ],
      },
      {
        id: "1.4", name: "1.4 Distinguishable", criteria: [
          { sc: "1.4.1", name: "Use of Color", level: "A" },
          { sc: "1.4.2", name: "Audio Control", level: "A" },
          { sc: "1.4.3", name: "Contrast (Minimum)", level: "AA" },
          { sc: "1.4.4", name: "Resize text", level: "AA" },
          { sc: "1.4.6", name: "Contrast (Enhanced)", level: "AAA" },
          { sc: "1.4.8", name: "Visual Presentation", level: "AAA" },
          { sc: "1.4.10", name: "Reflow", level: "AA" },
          { sc: "1.4.12", name: "Text Spacing", level: "AA" },
        ],
      },
    ],
  },
  {
    id: "2",
    name: "Principle 2: Operable",
    description: "Users must be able to navigate your site and operate its interface.",
    categories: [
      {
        id: "2.1", name: "2.1 Keyboard Accessible", criteria: [
          { sc: "2.1.1", name: "Keyboard", level: "A" },
        ],
      },
      {
        id: "2.2", name: "2.2 Enough Time", criteria: [
          { sc: "2.2.1", name: "Timing Adjustable", level: "A" },
        ],
      },
      {
        id: "2.4", name: "2.4 Navigable", criteria: [
          { sc: "2.4.1", name: "Bypass Blocks", level: "A" },
          { sc: "2.4.2", name: "Page Titled", level: "A" },
          { sc: "2.4.4", name: "Link Purpose (In Context)", level: "A" },
          { sc: "2.4.6", name: "Headings and Labels", level: "AA" },
          { sc: "2.4.7", name: "Focus Visible", level: "AA" },
          { sc: "2.4.9", name: "Link Purpose (Link Only)", level: "AAA" },
          { sc: "2.4.11", name: "Focus Not Obscured (Minimum)", level: "AA" },
        ],
      },
      {
        id: "2.5", name: "2.5 Input Modalities", criteria: [
          { sc: "2.5.3", name: "Label in Name", level: "A" },
          { sc: "2.5.5", name: "Target Size (Enhanced)", level: "AAA" },
          { sc: "2.5.7", name: "Dragging Movements", level: "AA" },
          { sc: "2.5.8", name: "Target Size (Minimum)", level: "AA" },
        ],
      },
    ],
  },
  {
    id: "3",
    name: "Principle 3: Understandable",
    description: "Your site must be readable and understandable, with a predictable user experience.",
    categories: [
      {
        id: "3.1", name: "3.1 Readable", criteria: [
          { sc: "3.1.1", name: "Language of Page", level: "A" },
          { sc: "3.1.2", name: "Language of Parts", level: "AA" },
        ],
      },
      {
        id: "3.2", name: "3.2 Predictable", criteria: [
          { sc: "3.2.6", name: "Consistent Help", level: "A" },
        ],
      },
      {
        id: "3.3", name: "3.3 Input Assistance", criteria: [
          { sc: "3.3.1", name: "Error Identification", level: "A" },
          { sc: "3.3.7", name: "Redundant Entry", level: "A" },
          { sc: "3.3.8", name: "Accessible Authentication", level: "AA" },
        ],
      },
    ],
  },
  {
    id: "4",
    name: "Principle 4: Robust",
    description: "Content must be compatible with assistive technology — and robust enough to remain accessible over time.",
    categories: [
      {
        id: "4.1", name: "4.1 Compatible", criteria: [
          { sc: "4.1.1", name: "Parsing", level: "A" },
          { sc: "4.1.2", name: "Name, Role, Value", level: "A" },
          { sc: "4.1.3", name: "Status Messages", level: "AA" },
        ],
      },
    ],
  },
];

export type Framework = "wcag" | "eaa" | "ada";

export const FRAMEWORK_META: Record<Framework, { title: string; blurb: string; scPrefix: string }> = {
  wcag: {
    title: "WCAG guidelines",
    blurb: "Web Content Accessibility Guidelines (WCAG) 2.1/2.2 conformance, organized by the four core principles.",
    scPrefix: "",
  },
  eaa: {
    title: "European Accessibility Act",
    blurb: "EN 301 549 harmonizes the EU's European Accessibility Act with WCAG 2.1 AA. Clauses are numbered under section 9 (Web).",
    scPrefix: "9.",
  },
  ada: {
    title: "ADA Title II",
    blurb: "The DOJ's Title II rule requires state and local government web content to conform to WCAG 2.1 Level AA.",
    scPrefix: "",
  },
};

export function formatScLabel(framework: Framework, sc: string, name: string): string {
  const prefix = FRAMEWORK_META[framework].scPrefix;
  return `${prefix}${sc}: ${name}`;
}
