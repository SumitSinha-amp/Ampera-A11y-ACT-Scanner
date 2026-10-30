import type { PushStatFn, ScanRawResult } from "../types";
import { getEffectiveAriaRole } from "../aria-data";
import { composedAncestors, isAlfaIncludedInAccessibilityTree, isAlfaRendered } from "../alfa-helpers";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const REPLACED = new Set(["audio", "canvas", "embed", "iframe", "img", "input", "object", "video"]);

function childrenOf(node: Node): Node[] {
  if (node instanceof HTMLSlotElement) {
    const assigned = node.assignedNodes({ flatten: true });
    if (assigned.length) return assigned;
  }
  if (node instanceof Element && node.shadowRoot) return Array.from(node.shadowRoot.childNodes);
  return Array.from(node.childNodes);
}

function isIncluded(element: Element): boolean {
  if (!isAlfaIncludedInAccessibilityTree(element)) return false;
  if (element.matches("script,style,template,noscript,input[type='hidden']")) return false;
  // Native empty-alt images are decorative unless an explicit semantic role
  // or author name restores them to the accessibility tree.
  if (element.matches("img[alt='']") && !element.hasAttribute("aria-label") &&
    !element.hasAttribute("aria-labelledby") && !element.hasAttribute("role")) return false;
  return true;
}

function isClosedDetailsSummaryHeading(heading: Element): boolean {
  return composedAncestors(heading).some(ancestor => {
    if (!ancestor.matches("summary")) return false;
    const details = ancestor.parentElement;
    return !!details?.matches("details:not([open])") &&
      details.querySelector(":scope > summary") === ancestor;
  });
}

function headingLevel(heading: Element): number {
  const explicit = heading.getAttribute("aria-level");
  if (explicit !== null && /^[1-9]\d*$/.test(explicit.trim())) return Number(explicit);
  const native = /^h([1-6])$/i.exec(heading.localName);
  return native ? Number(native[1]) : 2;
}

/**
 * Siteimprove sia-r78: inspect accessible content after the heading's subtree,
 * up to the next applicable heading of the same or higher rank (or document end).
 * Deliberate product exception: retain Issue / WCAG 2.4.6 AA classification.
 * Reference: packages/alfa-rules/src/sia-r78/rule.ts and its rule.spec.tsx.
 */
export function runHeadingSectionContentRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const nodes: Node[] = [];
  const subtreeEnd = new Map<Node, number>();
  const seen = new Set<Node>();
  const visit = (node: Node): void => {
    if (seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
    for (const child of childrenOf(node)) visit(child);
    subtreeEnd.set(node, nodes.length);
  };
  visit(document);
  const positions = new Map(nodes.map((node, index) => [node, index]));
  const headings = nodes.filter((node): node is Element =>
    node instanceof Element && node.namespaceURI === HTML_NAMESPACE &&
    getEffectiveAriaRole(node) === "heading" && isIncluded(node) &&
    !isClosedDetailsSummaryHeading(node),
  ).filter(heading => {
    const start = positions.get(heading)! + 1;
    const end = subtreeEnd.get(heading)!;
    return !nodes.slice(start, end).some(node => node instanceof Element &&
      ["button", "link"].includes(getEffectiveAriaRole(node)));
  });

  // Prefix counts make content lookup linear even for deeply nested headings.
  // Like Alfa's isContent, a content node is a leaf or a replaced element, not
  // a structural wrapper containing the next heading.
  const contentCounts = [0];
  for (const node of nodes) {
    let content = false;
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement || (node.getRootNode() as ShadowRoot).host;
      // A presentational wrapper may itself be ignored while its text remains
      // exposed. Do not require the parent to have an accessibility-tree role.
      content = !!node.textContent?.trim() && !!parent && isAlfaRendered(parent) &&
        !parent.matches("script,style,template,noscript");
    } else if (node instanceof Element) {
      content = isIncluded(node) &&
        (childrenOf(node).length === 0 || REPLACED.has(node.localName));
    }
    contentCounts.push(contentCounts[contentCounts.length - 1] + Number(content));
  }
  if (headings.length) pushStat("ACT-R78", headings.length, "element");
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const level = headingLevel(heading);
    const next = headings.slice(index + 1).find(candidate => headingLevel(candidate) <= level);
    const start = subtreeEnd.get(heading)!;
    const end = next ? positions.get(next)! : nodes.length;
    if (contentCounts[end] > contentCounts[start]) continue;
    results.push({
      ruleId: "ACT-R78", type: "Issue", impact: "moderate",
      description: next
        ? `There is no accessible content after this heading before the next heading of the same or higher level (level ${headingLevel(next)})`
        : "There is no accessible content after this heading before the end of the document",
      element: outerHtmlSnippet(heading),
      elementContext: elementContextForAI(heading),
      selector: getSelector(heading),
    });
  }
}
