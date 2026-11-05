import type { ScanRawResult } from "../types";
import { getEffectiveAriaRole } from "../aria-data";
import { isAlfaIncludedInAccessibilityTree, isAlfaRendered } from "../alfa-helpers";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";

/**
 * SIA-R101 asks whether repeated content precedes main content. Missing main
 * semantics leave main identification unanswered; they do not make the rule
 * pass or inapplicable. Repetition and bypass sufficiency need human review.
 */
export function runRepeatedContentRule(results: ScanRawResult[]): void {
  if (document.documentElement.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
    document.documentElement.localName !== "html") return;

  const nodes: Node[] = [];
  const seen = new Set<Node>();
  const visit = (node: Node): void => {
    if (seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
    let children: Node[];
    if (node instanceof HTMLSlotElement && node.assignedNodes({ flatten: true }).length) {
      children = node.assignedNodes({ flatten: true });
    } else if (node instanceof Element && node.shadowRoot) {
      children = Array.from(node.shadowRoot.childNodes);
    } else children = Array.from(node.childNodes);
    for (const child of children) visit(child);
  };
  visit(document);
  const main = nodes.find((node): node is Element =>
    node instanceof Element && getEffectiveAriaRole(node) === "main" &&
    isAlfaIncludedInAccessibilityTree(node));

  if (main) {
    const hasContentBefore = nodes.slice(0, nodes.indexOf(main)).some(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement || (node.getRootNode() as ShadowRoot).host;
        return !!node.textContent?.trim() && !!parent && isAlfaRendered(parent) &&
          !parent.closest("script,style,template,noscript,head");
      }
      // A wrapper's descendant text is not content before main. Only inspect
      // text nodes and intrinsically meaningful elements in traversal order.
      return node instanceof Element && isAlfaIncludedInAccessibilityTree(node) &&
        node.matches("img,svg,canvas,video,audio,iframe,object,embed,input,select,textarea,hr,button");
    });
    if (!hasContentBefore) return;
  }

  const target = main || document.body || document.documentElement;
  results.push({
    ruleId: "ACT-R101",
    type: "Potential Issue",
    impact: "moderate",
    description: main
      ? "Content precedes the main content — verify whether it is repeated and whether keyboard users can bypass it"
      : "Main content is not identified by an accessible main landmark — identify the primary content and verify whether repeated header and navigation content before it can be bypassed by keyboard users",
    element: outerHtmlSnippet(target),
    elementContext: elementContextForAI(target),
    selector: main ? getSelector(main) : (target === document.body ? "body" : "html"),
  });
}
