import { getEffectiveAriaRole } from "../aria-data";
import { composedParent, isAlfaIncludedInAccessibilityTree, isAlfaRendered, isAlfaVisible } from "../alfa-helpers";
import { getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";
import { safeDisplayCollapseTarget } from "./collapse-instrument";

function flatChildren(node: Node): Node[] {
  if (node instanceof HTMLSlotElement) {
    const assigned = node.assignedNodes({ flatten: true });
    if (assigned.length) return assigned;
  }
  if (node instanceof Element && node.shadowRoot) return Array.from(node.shadowRoot.childNodes);
  return Array.from(node.childNodes);
}

function textParent(node: Node): Element | null {
  const parent = composedParent(node);
  return parent instanceof Element ? parent : null;
}

/** Both channels must be hidden. Offscreen-only or aria-hidden-only is insufficient. */
function fullyHidden(node: Node): boolean {
  const element = node instanceof Element ? node : textParent(node);
  if (!element) return true;
  if (node.nodeType === Node.TEXT_NODE) {
    // Presentation roles do not hide descendant text from assistive technology.
    return !isAlfaVisible(element) && !isAlfaRendered(element);
  }
  return !isAlfaVisible(element) && !isAlfaIncludedInAccessibilityTree(element);
}

/**
 * R97: https://alfa.siteimprove.com/rules/sia-r97
 *
 * This is a page-level, semi-automated check of repeated content BEFORE main,
 * not a disclosure ARIA/keyboard check. Landmark roles do not prove repetition
 * across pages. Covering ALL preceding content proves the expectation for any
 * repeated subset; uncovered content asks for review, never a definite failure.
 * Missing main identification stays undetermined in all selection modes.
 */
export function runRepeatedContentCollapseRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  if (document.documentElement.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
    document.documentElement.localName !== "html") return;
  pushStat("ACT-R97", 1, "page");
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
  const positions = new Map(nodes.map((node, index) => [node, index]));
  const main = nodes.find((node): node is Element =>
    node instanceof Element && getEffectiveAriaRole(node) === "main" &&
    isAlfaIncludedInAccessibilityTree(node));
  if (!main) return;
  const mainStart = positions.get(main)!;
  const bodyStart = positions.get(document.body);
  if (bodyStart === undefined) return;
  const contains = (container: Node, node: Node): boolean => {
    const start = positions.get(container);
    const position = positions.get(node);
    return start !== undefined && position !== undefined &&
      position >= start && position < ends.get(container)!;
  };
  const elements = nodes.filter((node): node is Element => node instanceof Element);
  const controllers: Element[] = [];
  const targets: (HTMLElement | SVGElement)[] = [];
  const nativeDetails: { details: HTMLDetailsElement; summary: Element }[] = [];
  for (const element of elements) {
    if (element instanceof HTMLDetailsElement) {
      const summary = Array.from(element.children).find(child => child.localName === "summary");
      if (summary && isAlfaVisible(summary) && isAlfaIncludedInAccessibilityTree(summary)) {
        nativeDetails.push({ details: element, summary });
        controllers.push(summary);
      }
    }
    if (!element.hasAttribute("onclick") || !isAlfaVisible(element) ||
      !isAlfaIncludedInAccessibilityTree(element)) continue;
    const target = safeDisplayCollapseTarget(element);
    if (target) {
      controllers.push(element);
      if (!targets.includes(target)) targets.push(target);
    }
  }
  const content = nodes.slice(bodyStart + 1, mainStart).filter(node => {
    if (controllers.some(control => contains(control, node))) return false;
    if (node.nodeType === Node.TEXT_NODE) {
      return !!node.textContent?.trim() && !fullyHidden(node);
    }
    if (!(node instanceof Element)) return false;
    // Only complete blocks before main qualify, not ancestors containing main.
    if (ends.get(node)! > mainStart) return false;
    const isBlock = ["banner", "navigation", "complementary"].includes(getEffectiveAriaRole(node));
    const isContent = flatChildren(node).length === 0 ||
      node.matches("audio,canvas,embed,iframe,img,input,object,video");
    return (isBlock || isContent) && !fullyHidden(node);
  });
  if (content.length === 0) return; // No preceding content => no repeated blocks.

  const covered = new Set<Node>();
  for (const { details, summary } of nativeDetails) {
    for (const node of content) {
      if (contains(details, node) && node !== details && !contains(summary, node)) covered.add(node);
    }
  }
  for (const target of targets) {
    const affected = content.filter(node => contains(target, node));
    if (!affected.length) continue;
    // Verify the known display:none effect against the actual CSS cascade.
    // Do not activate the control or run page scripts. Restore exact authored
    // style, including priorities and absent vs empty attributes, on every path.
    const originalStyle = target.getAttribute("style");
    try {
      target.style.display = "none";
      for (const node of affected) if (fullyHidden(node)) covered.add(node);
    } finally {
      // Reset CSSOM before removing an originally absent attribute; otherwise
      // Chromium can lazily serialize a stale empty style attribute afterward.
      target.setAttribute("style", originalStyle || "");
      if (originalStyle === null) target.removeAttribute("style");
    }
  }
  const unresolved = content.filter(node => !covered.has(node));
  if (unresolved.length === 0) return;
  const contexts = [...new Set(unresolved.map(node =>
    node instanceof Element ? getSelector(node) : getSelector(textParent(node)!),
  ))].slice(0, 8);
  results.push({
    ruleId: "ACT-R97", type: "Potential Issue", impact: "moderate",
    displayTitle: "Can repeated content before main content be collapsed?",
    description: "Verify each repeated block before main content has a mechanism that makes every node both not visible and excluded from the accessibility tree. No supported complete collapse mechanism was established for all preceding content.",
    element: outerHtmlSnippet(document.documentElement), selector: "html",
    elementContext: `Page-level review. Main content: ${getSelector(main)}. Unresolved preceding content: ${contexts.join(", ")}. Confirm which blocks repeat across pages and test any custom controls. Unique content is not a failure. Offscreen-only hiding is insufficient. Arbitrary scripts were not executed; missing aria-expanded and keyboard activation are separate checks.`,
  });
}
