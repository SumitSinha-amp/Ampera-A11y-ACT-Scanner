import { getEffectiveAriaRole, getImplicitAriaRole } from "../aria-data";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isIncludedInAccessibilityTree, isVisible } from "../visibility";
import type { PushStatFn, ScanRawResult } from "../types";
import { HTML_NAMESPACE as HTML, modelNativeTable } from "./table-model";

function cellRole(element: Element): string {
  const role = getEffectiveAriaRole(element);
  // The tree predicate resolves presentational-role conflicts (focus/name).
  // If that role is ignored, retain the native cell/header semantics.
  if ((role === "none" || role === "presentation") && isIncludedInAccessibilityTree(element)) {
    return getImplicitAriaRole(element);
  }
  return role;
}

/**
 * SIA-R46: https://alfa.siteimprove.com/rules/sia-r46
 * Targets visible, AT-exposed native th cells, not unassigned td cells (R77)
 * or tables without headers (R76). Assignment follows Alfa, including implicit
 * scope, spans/groups, empty-cell inference, and headers-attribute overrides.
 */
export function runTableHeaderDataRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  let checked = 0;
  for (const table of Array.from(document.querySelectorAll("table"))) {
    if (table.namespaceURI !== HTML || !isIncludedInAccessibilityTree(table)) continue;
    const model = modelNativeTable(table);
    for (const header of model.cells) {
      const native = header.element;
      if (native.namespaceURI !== HTML || native.localName !== "th" ||
        native.closest("table") !== table) continue;
      const role = cellRole(native);
      if (role !== "rowheader" && role !== "columnheader") continue;
      if (!isVisible(native) || !isIncludedInAccessibilityTree(native)) continue;
      checked++;
      const assigned = model.cells.some(cell => {
        const data = cell.element;
        // Alfa role.is("cell") includes gridcell and the two header roles.
        // The expectation does not require this assigned cell to be visible.
        const dataRole = cellRole(data);
        return ["cell", "gridcell", "rowheader", "columnheader"].includes(dataRole) &&
          cell.headers.has(header);
      });
      if (assigned) continue;
      results.push({
        ruleId: "ACT-R46", type: "Issue", impact: "serious",
        description: "Table header cell is not assigned to any data cell. Correct its position, scope, spans, or headers references so it labels at least one cell in the same table; use <td> if it is not a header.",
        selector: getSelector(native), element: outerHtmlSnippet(native), elementContext: elementContextForAI(native),
      });
    }
  }
  pushStat("ACT-R46", checked, "element");
}
