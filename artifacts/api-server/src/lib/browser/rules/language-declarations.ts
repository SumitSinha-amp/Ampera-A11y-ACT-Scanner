import { language as registeredLanguage } from "language-tags";
import { getAccessibleName } from "../accname";
import { getEffectiveAriaRole } from "../aria-data";
import { composedAncestors, isAlfaIncludedInAccessibilityTree } from "../alfa-helpers";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";

/** Same primary-subtag expectation as Alfa Language.parse, not full-tag grammar. */
export function hasRegisteredPrimaryLanguage(value: string): boolean {
  return !!registeredLanguage(value.split("-")[0]);
}

function visibleText(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent || parent.closest("script,style,noscript,template")) return false;
  const style = getComputedStyle(parent);
  if (style.visibility !== "visible") return false;
  for (const ancestor of [parent, ...composedAncestors(parent)]) {
    const computed = getComputedStyle(ancestor);
    if (computed.display === "none" || Number(computed.opacity) === 0 ||
        computed.contentVisibility === "hidden") return false;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects()).some(rect => rect.width > 0 && rect.height > 0);
}

export function runLanguageDeclarationRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const targets = new Set<Element>();
  function visit(node: Node, owner: Element | null): void {
    if (node instanceof Element) {
      // Empty declarations do not replace the inherited target in SIA-R7.
      if ((node.getAttribute("lang") ?? "") !== "") owner = node;
      if (owner && getEffectiveAriaRole(node) !== "generic" &&
          isAlfaIncludedInAccessibilityTree(node) && getAccessibleName(node).trim()) {
        targets.add(owner);
      }
    } else if (node instanceof Text && node.data.trim() && owner) {
      const parent = node.parentElement;
      if (parent && !parent.closest("script,style,noscript,template") &&
          (visibleText(node) || isAlfaIncludedInAccessibilityTree(parent))) targets.add(owner);
    }
    const children = node instanceof HTMLSlotElement
      ? (node.assignedNodes().length ? node.assignedNodes({ flatten: true }) : Array.from(node.childNodes))
      : node instanceof Element && node.shadowRoot
        ? Array.from(node.shadowRoot.childNodes) : Array.from(node.childNodes);
    for (const child of children) visit(child, owner);
  }
  // SIA-R7 starts at body with no inherited html declaration; R5 handles html.
  if (document.body) visit(document.body, null);
  if (targets.size) pushStat("ACT-R7", targets.size, "element");
  for (const target of targets) {
    const value = target.getAttribute("lang") ?? "";
    if (hasRegisteredPrimaryLanguage(value)) continue;
    results.push({
      ruleId: "ACT-R7", displayTitle: "Language is not valid", type: "Issue", impact: "moderate",
      description: `lang attribute ${JSON.stringify(value)} does not have a registered primary language subtag`,
      element: outerHtmlSnippet(target), elementContext: elementContextForAI(target), selector: getSelector(target),
    });
  }
}
