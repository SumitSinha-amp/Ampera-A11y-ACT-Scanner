import { getEffectiveAriaRole } from "../aria-data";
import { isAlfaIncludedInAccessibilityTree } from "../alfa-helpers";
import { outerHtmlSnippet } from "../dom-helpers";
import { isVisible } from "../visibility";
import type { PushStatFn, ScanRawResult } from "../types";

function flatChildren(node: Node): Node[] {
  if (node instanceof HTMLSlotElement) {
    const assigned = node.assignedNodes({ flatten: true });
    if (assigned.length) return assigned;
  }
  if (node instanceof Element && node.shadowRoot) return Array.from(node.shadowRoot.childNodes);
  return Array.from(node.childNodes);
}

/** Content, rather than wrapper elements, can prevent a heading being at the start. */
function isPerceivableContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement || (node.getRootNode() as ShadowRoot).host;
    if (!node.textContent?.trim() || !parent ||
      parent.closest("script,style,template,noscript") ||
      !isVisible(parent)) return false;
    const range = document.createRange();
    range.selectNodeContents(node);
    return Array.from(range.getClientRects()).some(rect => rect.width > 0 && rect.height > 0);
  }
  if (!(node instanceof Element) || !isVisible(node) ||
    !isAlfaIncludedInAccessibilityTree(node)) return false;
  // Alfa Element.isContent: replaced elements or leaves, not content wrappers.
  if (node.matches("audio,canvas,embed,iframe,img,input,object,video")) return true;
  const role = getEffectiveAriaRole(node);
  return flatChildren(node).length === 0 && !!role &&
    !["generic", "none", "presentation"].includes(role);
}

/**
 * SIA-R98: https://github.com/Siteimprove/alfa/blob/main/packages/alfa-rules/src/sia-r98/rule.ts
 * One HTML-document outcome. Any main may satisfy it. Without a main-role
 * element, Alfa asks "main-landmark-elements"; no answer means can't tell,
 * NOT an automatic failure. Never infer a main from an id/class or inspect nav.
 */
export function runMainContentHeadingRule(
  results: ScanRawResult[],
  pushStat: PushStatFn,
): void {
  if (document.documentElement.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
    document.documentElement.localName !== "html") return;
  pushStat("ACT-R98", 1, "page");

  const nodes: Node[] = [];
  const ends = new Map<Node, number>();
  const seen = new Set<Node>();
  function visit(node: Node): void {
    if (seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
    for (const child of flatChildren(node)) visit(child);
    ends.set(node, nodes.length);
  }
  visit(document);
  const mains = nodes.filter((node): node is Element =>
    node instanceof Element && getEffectiveAriaRole(node) === "main");
  // An unanswered main-content-identification question is not a finding.
  // Selecting R98 or enabling other manual rules cannot supply that answer.
  if (mains.length === 0) return;

  for (const main of mains) {
    const start = nodes.indexOf(main);
    for (let index = start + 1; index < ends.get(main)!; index++) {
      const node = nodes[index];
      if (node instanceof Element && getEffectiveAriaRole(node) === "heading" &&
        isVisible(node) && isAlfaIncludedInAccessibilityTree(node)) return;
      if (isPerceivableContent(node)) break;
    }
  }
  results.push({
    ruleId: "ACT-R98", type: "Issue", impact: "minor",
    description: "The page has no visible, accessible heading at the start of its main content.",
    element: outerHtmlSnippet(document.documentElement), selector: "html",
    elementContext: `Page-level check across ${mains.length} main-role element(s). A heading later in the main content or an accessible label on the main container does not satisfy this rule.`,
  });
}
