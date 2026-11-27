import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const routes = source("../routes/scans.ts");
const detail = routes.slice(routes.indexOf('router.get("/scans/:id",'), routes.indexOf('router.get("/scans/:id/status",'));

describe("scan performance contracts", () => {
  it("does not re-run correlated scope counts for every page or issue in scan details", () => {
    expect(detail).not.toContain("scopedPageCount(");
    expect(detail).not.toContain("scopedScanCount(");
    expect(detail).not.toContain("and(scopedIssueCondition");
    expect(detail).toContain("excludesBestPracticeOutcomes(row.options)");
    expect(detail).toContain("await applyPageCountScope(pages, row.options, row.id)");
    expect(routes).toContain("GROUP BY ai.page_id");
    expect(routes).toContain("COALESCE(ai.rule_type, 'Issue') <> 'Best Practice'");
    expect(routes).toContain("byPage.get(page.id)?.total ?? 0");
  });

  it("groups rule statuses before transferring them from the database", () => {
    expect(detail).toContain("GROUP BY rs.rule_id, rs.status, rs.execution_tier");
    expect(detail).toContain("count: Number(status.count)");
  });

  it("starts progress independently and avoids rapid full-result polling", () => {
    const page = source("../../../accessibility-scanner/src/pages/scan-detail.tsx");
    expect(page).not.toContain("enabled: !!scanId && (isActive || isUpdatingResults)");
    expect(page).toContain("Retry loading results");
    const home = source("../../../accessibility-scanner/src/pages/home.tsx");
    const monitor = home.slice(home.indexOf("function InlineScanMonitor("), home.indexOf("function InlineScanMonitor(") + 4500);
    expect(monitor).toContain("? 30_000 : false");
    expect(monitor).not.toContain("enabled: isRunning");
  });

  it("budgets post-baseline work and persists review limitations for selected rules", () => {
    const scanner = source("./scanner.ts");
    expect(scanner).toContain("(options.deadlineAt ?? Infinity) - 10_000");
    expect(scanner).toContain("for (const ruleId of unobscuredContrastRules) issues.push(");
    expect(scanner).toContain('ruleId, type: "Potential Issue"');
    expect(scanner).toContain('element: "<body>", selector: "body"');
    expect(scanner).toContain('stage: "zoom-contrast"');
  });
});
