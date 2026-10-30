import type { ScanRawResult, PushStatFn } from "../types";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isActuallyTabbable, isIncludedInAccessibilityTree, isVisible } from "../visibility";
import { runControlGroupNameRule } from "./control-group-names";
import { runCustomKeyboardRule } from "./custom-keyboard";
import { runErrorIdentificationReviews } from "./error-identification";
import { runTableHeaderDataRule } from "./table-header-data";

export function runTablesFormsRules(results: ScanRawResult[], pushStat: PushStatFn): void {
  // ACT-R45: headers attribute refers to valid cells in the same table.
  // Current Alfa R45 validates explicit headers tokens; header-to-data
  // assignment is R46 and data-to-header assignment is R77.
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("table").forEach((table) => {
    if (!isVisible(table)) return;
    table.querySelectorAll("td, th").forEach((cell) => {
      const headersAttr = cell.getAttribute("headers");
      if (!headersAttr) return;
      const headersTokens = headersAttr.trim().split(/\s+/).filter(Boolean);
      const tableCells = Array.from(table.querySelectorAll("td, th"));
      const validTargets = headersTokens
        .map((token) => tableCells.find((candidate) => candidate.id === token))
        .filter((target): target is Element => !!target);
      const hasInvalidTarget = validTargets.length !== headersTokens.length;
      const referencesSelf = !!cell.id && headersTokens.includes(cell.id);
      if (hasInvalidTarget || referencesSelf) {
        results.push({ ruleId: "ACT-R45", type: "Issue", impact: "moderate", description: hasInvalidTarget
          ? "The headers attribute refers to a cell that is not present in the same table"
          : "The headers attribute refers to the cell defining it", element: outerHtmlSnippet(cell), elementContext: elementContextForAI(cell), selector: getSelector(cell) });
      }
    });
  });

  runTableHeaderDataRule(results, pushStat);

  // ACT-R76: Data table has no header cells (WCAG 1.3.1)
  let headerlessTablesChecked = 0;
  document.querySelectorAll("table").forEach((table) => {
    if (!isVisible(table) || !isIncludedInAccessibilityTree(table)) return;
    // Descendants of nested tables cannot supply headers or rows to this one.
    const own = (selector: string) => Array.from(table.querySelectorAll(selector))
      .filter(el => el.closest("table") === table);
    headerlessTablesChecked++;
    if (own("th").length === 0 && own("td").length > 0 && own("tr").length > 1) {
      results.push({ ruleId: "ACT-R76", type: "Issue", impact: "serious", description: "Data table has no header cells (<th>) — use <th> to identify column and row headers", element: outerHtmlSnippet(table), elementContext: elementContextForAI(table), selector: getSelector(table) });
    }
  });
  pushStat("ACT-R76", headerlessTablesChecked, "element");

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R60: Related control groups need a programmatic group name
  // ════════════════════════════════════════════════════════════════════════
  runControlGroupNameRule(results, pushStat);

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R84: Scrollable element not keyboard accessible (WCAG 2.1.1)
  // ════════════════════════════════════════════════════════════════════════
  {
    const isScrollable = (el: HTMLElement) => {
      const style = window.getComputedStyle(el);
      const canScrollY = (style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 4;
      // Alfa alignment: horizontal scroll is only applicable with white-space:
      // nowrap — otherwise text wraps and no real scrolling occurs.
      const canScrollX = (style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 4 && style.whiteSpace === "nowrap";
      return canScrollY || canScrollX;
    };
    const isKeyboardAccessible = (el: HTMLElement) =>
      isActuallyTabbable(el) ||
      Array.from(el.querySelectorAll("*")).some((descendant) => isActuallyTabbable(descendant));
    const isExcluded = (el: HTMLElement) => {
      const cls = typeof el.className === "string" ? el.className : "";
      if (cls.includes("sr-only") || cls.includes("visually-hidden") || cls.includes("screen-reader-only")) return true;
      if (el.closest('[aria-hidden="true"]')) return true;
      if (el.matches("iframe, object, embed, portal")) return true;
      const style = window.getComputedStyle(el);
      return style.display === "none" || style.visibility === "hidden";
    };
    const scrollableCandidates = Array.from(document.querySelectorAll("*"))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)
      .filter((el) => el !== document.documentElement && el !== document.body)
      .filter((el) => !isExcluded(el))
      .filter((el) => isScrollable(el));
    const inaccessible = scrollableCandidates.filter((el) => !isKeyboardAccessible(el));
    const deepest = inaccessible.filter((el) => !inaccessible.some((other) => other !== el && other.contains(el)));
    deepest.forEach((el) => {
      results.push({ ruleId: "ACT-R84", type: "Issue", impact: "moderate", description: "Scrollable element is not keyboard accessible — add tabindex='0'", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R107: Custom interactive element not keyboard accessible (WCAG 2.1.1)
  // ════════════════════════════════════════════════════════════════════════
  runCustomKeyboardRule(results, pushStat);

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R82: Form error message does not describe the invalid value (WCAG 3.3.1)
  // ════════════════════════════════════════════════════════════════════════
  {
    const invalidInputs = Array.from(document.querySelectorAll(
      "input[aria-invalid='true'], textarea[aria-invalid='true'], select[aria-invalid='true']"
    ));
    invalidInputs.forEach((input) => {
      if (!isVisible(input)) return;
      // Check aria-describedby → the target must exist and contain meaningful error text
      const describedBy = input.getAttribute("aria-describedby");
      if (describedBy) {
        const ids = describedBy.trim().split(/\s+/);
        const allTargetsHaveText = ids.every((id) => {
          const el = document.getElementById(id);
          return el && (el.textContent?.trim().length ?? 0) > 3;
        });
        if (allTargetsHaveText) return;
      }
      // Check for a sibling or parent-relative error element (common patterns)
      const parent = input.closest("div,fieldset,li,td,p,.form-group,.field,.input-wrapper,.form-field");
      if (parent) {
        const errorEl = parent.querySelector("[role='alert'],[class*='error'],[class*='invalid'],[class*='validation'],[id*='error']");
        if (errorEl && (errorEl.textContent?.trim().length ?? 0) > 3) return;
      }
      results.push({
        ruleId: "ACT-R82",
        type: "Issue",
        impact: "moderate",
        description: "Input marked aria-invalid but has no associated error message — add aria-describedby pointing to a descriptive error element",
        element: outerHtmlSnippet(input),
        elementContext: elementContextForAI(input),
        selector: getSelector(input),
      });
    });
  }

  // Keep the existing automatic R82 detector above intact. Broader Alfa
  // questions and inferred generic errors are separate Potential Issues.
  runErrorIdentificationReviews(results, pushStat);

  // ── Scoring stats: total elements checked per rule ────────────────────────
  const tableEls = document.querySelectorAll("table").length;
  if (tableEls > 0) {
    pushStat("ACT-R45", document.querySelectorAll("th").length, "element");
  }
  const scrollableEls = document.querySelectorAll("[style*='overflow'],[class*='scroll'],[class*='overflow']").length;
  if (scrollableEls > 0) pushStat("ACT-R84", scrollableEls, "element");

  // ════════════════════════════════════════════════════════════════════════
}
