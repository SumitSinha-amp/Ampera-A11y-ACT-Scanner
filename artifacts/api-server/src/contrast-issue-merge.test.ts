import { describe, expect, it } from "vitest";
import type { ScanIssue } from "./lib/scanner";
import { mergeContrastFindings } from "./lib/contrast-issue-merge";

function finding(overrides: Partial<ScanIssue> = {}): ScanIssue {
  return {
    ruleId: "ACT-R89",
    type: "Issue",
    impact: "minor",
    description: "CSS contrast 2.71:1",
    selector: "a.card > p",
    element: "<p>Card text</p>",
    elementContext: "Card text and surroundings",
    remediation: null,
    wcagCriteria: "1.4.6",
    wcagLevel: "AAA",
    legal: { ada: [], eaa: false },
    ...overrides,
  };
}

const pixel = (overrides: Partial<ScanIssue> = {}) => finding({
  description: "Pixel contrast 3.49:1",
  element: null,
  elementContext: null,
  bboxX: 10,
  bboxY: 1200,
  ...overrides,
});

describe("contrast evidence merging", () => {
  it("replaces a confirmed CSS finding with pixel evidence, retaining DOM context", () => {
    const merged = mergeContrastFindings([finding()], [pixel()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      description: "Pixel contrast 3.49:1",
      element: "<p>Card text</p>",
      elementContext: "Card text and surroundings",
      bboxY: 1200,
    });
  });

  it("promotes review stubs without dropping independent AA or AAA findings", () => {
    const merged = mergeContrastFindings([
      finding({ type: "Potential Issue" }),
      finding({ ruleId: "ACT-R88", type: "Potential Issue" }),
    ], [pixel()]);
    expect(merged).toHaveLength(2);
    expect(merged.find((issue) => issue.ruleId === "ACT-R89")?.type).toBe("Issue");
    expect(merged.find((issue) => issue.ruleId === "ACT-R88")?.type).toBe("Potential Issue");
  });

  it("keeps the same selector in different interaction states", () => {
    const merged = mergeContrastFindings([
      finding(),
      finding({ interactionStateKey: "open-menu" }),
    ], [pixel()]);
    expect(merged).toHaveLength(2);
    expect(merged.find((issue) => issue.interactionStateKey === "open-menu")?.description)
      .toBe("CSS contrast 2.71:1");
  });

  it("keeps unrelated rules and elements and deduplicates repeated pixel evidence", () => {
    const existing = [
      finding(),
      finding({ ruleId: "ACT-R11" }),
      finding({ selector: "a.other" }),
    ];
    expect(mergeContrastFindings(existing, [pixel(), pixel()])).toHaveLength(3);
    expect(existing[0].description).toBe("CSS contrast 2.71:1");
  });

  it("does not collapse findings without selectors", () => {
    expect(mergeContrastFindings([
      finding({ selector: null }),
    ], [pixel({ selector: null }), pixel({ selector: null })])).toHaveLength(3);
  });
});
