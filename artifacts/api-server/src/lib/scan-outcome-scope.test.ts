import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { excludesBestPracticeOutcomes, filterScanOutcomes, scanOutcomeVisibilitySql } from "./scan-outcome-scope";

describe("Best Practice outcome scope", () => {
  const issues = [
    { ruleId: "ACT-R80", type: "Best Practice", wcagLevel: "AAA" },
    { ruleId: "ACT-R87", type: "Best Practice", wcagLevel: "A" },
    { ruleId: "ACT-R82", type: "Issue", wcagLevel: "A" },
    { ruleId: "ACT-R82", type: "Potential Issue", wcagLevel: "A" },
    { ruleId: "ACT-R40", type: "WAI-ARIA" },
  ];

  it("excludes all advisory outcomes when A/AA/ARIA were selected without BP", () => {
    const options = { wcagLevels: ["A", "AA", "WAI-ARIA"] };
    expect(excludesBestPracticeOutcomes(options)).toBe(true);
    expect(filterScanOutcomes(issues, options)).toEqual(issues.slice(2));
    expect(issues).toHaveLength(5);
  });

  it("does not drop Issue or Potential Issue outcomes from the same rule", () => {
    const mixed = ["Best Practice", "Issue", "Potential Issue"].map(type => ({ ruleId: "ACT-R80", type }));
    expect(filterScanOutcomes(mixed, { wcagLevels: ["AA"] }).map(issue => issue.type))
      .toEqual(["Issue", "Potential Issue"]);
  });

  it("applies the same policy to persisted incremental rows", () => {
    expect(filterScanOutcomes([
      { ruleType: "Best Practice" }, { ruleType: "Issue" }, { ruleType: null },
    ], { wcagLevels: ["A"] })).toEqual([{ ruleType: "Issue" }, { ruleType: null }]);
  });

  it("can produce an empty result without changing the original findings", () => {
    const advisories = [{ type: "Best Practice" }];
    expect(filterScanOutcomes(advisories, { wcagLevels: ["AAA"] })).toEqual([]);
    expect(advisories).toEqual([{ type: "Best Practice" }]);
  });

  it.each([undefined, null, {}, { wcagLevels: [] }, { wcagLevels: "AA" },
    { wcagLevels: ["unknown"] }, { wcagLevels: ["Best Practice"] },
    { wcagLevels: ["A", "AA", "Best Practice"] }])("preserves legacy/all or opted-in outcomes: %j", (options) => {
    expect(excludesBestPracticeOutcomes(options)).toBe(false);
    expect(filterScanOutcomes(issues, options)).toEqual(issues);
  });

  it("does not let explicit rules bypass an explicit outcome exclusion", () => {
    expect(filterScanOutcomes(issues, { wcagLevels: ["AA"], rules: ["ACT-R80"] }))
      .not.toContainEqual(issues[0]);
    // A legacy explicit-rule-only scan still uses the all-outcomes default.
    expect(filterScanOutcomes(issues, { rules: ["ACT-R80"] })).toEqual(issues);
  });

  it("guards SQL reads by saved scan options, rather than WCAG level on the finding", () => {
    const condition = scanOutcomeVisibilitySql("ai.rule_type", "ss.options");
    expect(condition).toContain("COALESCE(ai.rule_type, 'Issue') <> 'Best Practice'");
    expect(condition).toContain("(ss.options)::jsonb->'wcagLevels'");
    expect(condition).not.toContain("wcag_level");
  });

  it("covers fresh scans, carry-forward, page reports, and exports", () => {
    const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
    expect(read("./scanner.ts")).toContain("issues: filterScanOutcomes(issues, options)");
    expect(read("./scanQueue.ts")).toContain("const carriedIssues = filterScanOutcomes(");
    expect(read("./scanQueue.ts")).toContain("wcagLevels: options.wcagLevels");
    const routes = read("../routes/scans.ts");
    expect(routes).toContain("LEFT JOIN accessibility_issues ai ON ai.page_id = pr.id AND ${sql.raw(scopedAiCondition)}");
    expect(routes).toContain("and(eq(accessibilityIssuesTable.pageId, pageResultsTable.id), scopedIssueCondition)");
    expect(routes).toContain("GROUP BY ai.impact");
    expect(routes).toContain("WHERE pr.scan_id = $1 AND ${scopedAiCondition}");
    expect(routes).toContain("if (scopedIssues.length > 0)");
    expect(routes).toContain("[newSession.id, completedPageIds, excludesBestPracticeOutcomes(opts)]");
    expect(routes).toContain("pagesWithIssues: sql<number>`count(*) filter (where ${scopedPageCount()} > 0)`");
  });
});
