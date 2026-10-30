import { getEffectiveAriaRole } from "../aria-data";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isIncludedInAccessibilityTree, isVisible } from "../visibility";
import type { PushStatFn, ScanRawResult } from "../types";

import { HTML_NAMESPACE as HTML, modelNativeTable } from "./table-model";

/**
 * ACT-R77: use Ampera's HTML table formation and header-assignment model,
 * not a column-index heuristic. This preserves scope, spans, groups, implicit
 * headers, empty cells, and the explicit headers attribute's override behavior.
 * Cells retain native DOM identities; no page mutation is needed.
 */
export function runTableDataHeaderRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  let checked = 0;
  for (const table of Array.from(document.querySelectorAll("table"))) {
    if (table.namespaceURI !== HTML || !isIncludedInAccessibilityTree(table)) continue;
    // Official R77 is inapplicable when the table has no native header cells.
    // Separate missing-header rules intentionally retain that coverage.
    if (!Array.from(table.querySelectorAll("th")).some(th => th.closest("table") === table)) continue;

    const model = modelNativeTable(table);
    if (!model.cells.some(cell => cell.isHeader)) continue;
    for (const cell of model.cells) {
      const native = cell.element;
      if (native.namespaceURI !== HTML || native.localName !== "td" ||
        native.closest("table") !== table) continue;
      const role = getEffectiveAriaRole(native);
      if (role !== "cell" && role !== "gridcell") continue;
      if (!isVisible(native) || !isIncludedInAccessibilityTree(native)) continue;
      checked++;
      if (cell.headers.size) continue;
      results.push({
        ruleId: "ACT-R77", type: "Issue", impact: "serious",
        description: "Table data cell is not assigned to any header cell. Use correctly positioned native <th> cells with appropriate scope, or an explicit headers attribute referencing the relevant cells in the same table.",
        selector: getSelector(native), element: outerHtmlSnippet(native), elementContext: elementContextForAI(native),
      });
    }
  }
  pushStat("ACT-R77", checked, "element");
}
