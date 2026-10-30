import { getEffectiveAriaRole } from "../aria-data";
import { isAlfaFocusable, isAlfaIncludedInAccessibilityTree, isAlfaRendered, isAlfaTabbable } from "../alfa-helpers";
import { getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

function fragmentTarget(value: string): Element | null {
  try {
    const url = new URL(value, document.baseURI);
    const current = new URL(document.URL);
    if (url.origin !== current.origin || url.pathname !== current.pathname ||
      url.search !== current.search || !url.hash) return null;
    const id = decodeURIComponent(url.hash.slice(1));
    return document.getElementById(id) ||
      Array.from(document.getElementsByName(id)).find(element => element.localName === "a") || null;
  } catch { return null; }
}

/**
 * Recognize only complete, literal inline focus/fragment handlers. Do not
 * execute arbitrary application code or mistake a string/comment mentioning
 * focus for a working instrument. Listener-based and complex scripted
 * instruments remain reviewable instead of being labelled definite failures.
 */
function simpleScriptTarget(element: Element): Element | null {
  const handler = (element.getAttribute("onclick") || "").trim();
  const fragment = /^(?:window\.)?location\.assign\(\s*(["'])([^"']+)\1\s*\)\s*;?$/.exec(handler);
  if (fragment) return fragmentTarget(fragment[2]);
  const assignment = /^(?:window\.)?location(?:\.href)?\s*=\s*(["'])([^"']+)\1\s*;?$/.exec(handler);
  if (assignment) return fragmentTarget(assignment[2]);
  const focusId = /^document\.getElementById\(\s*(["'])([^"']+)\1\s*\)\.focus\(\s*\)\s*;?$/.exec(handler);
  if (focusId) {
    const target = document.getElementById(focusId[2]);
    return target && isAlfaFocusable(target) ? target : null;
  }
  const focusSelector = /^document\.querySelector\(\s*(["'])([^"']+)\1\s*\)\.focus\(\s*\)\s*;?$/.exec(handler);
  if (focusSelector) {
    try {
      const target = document.querySelector(focusSelector[2]);
      return target && isAlfaFocusable(target) ? target : null;
    } catch { return null; }
  }
  return null;
}

function flatChildren(node: Node): Node[] {
  if (node instanceof HTMLSlotElement) {
    const assigned = node.assignedNodes({ flatten: true });
    if (assigned.length) return assigned;
  }
  if (node instanceof Element && node.shadowRoot) return Array.from(node.shadowRoot.childNodes);
  return Array.from(node.childNodes);
}

/**
 * SIA-R100, "Document has instrument to main content".
 * Published contract: https://alfa.siteimprove.com/rules/sia-r100
 *
 * Native fragment instruments and simple literal script instruments can be
 * recognized conservatively. Otherwise ask the rule's existence question:
 * arbitrary JS and identifying the true main content require human review.
 * This is not R87 (first focusable link), R101 (repeated-block bypass), or a
 * PDF-tagging rule. The product retains WCAG 2.4.1 Level A by user request,
 * although the upstream rule itself has no direct conformance requirement.
 */
export function runMainContentInstrumentRule(
  results: ScanRawResult[],
  emitManualReview: boolean,
  pushStat: PushStatFn,
): void {
  if (document.documentElement.namespaceURI !== HTML_NAMESPACE ||
    document.documentElement.localName !== "html") return;
  pushStat("ACT-R100", 1, "page");
  if (!emitManualReview) return;

  const nodes: Node[] = [];
  const subtreeEnds = new Map<Node, number>();
  const seen = new Set<Node>();
  const visit = (node: Node) => {
    if (seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
    for (const child of flatChildren(node)) visit(child);
    subtreeEnds.set(node, nodes.length - 1);
  };
  visit(document);
  const positions = new Map(nodes.map((node, index) => [node, index]));
  const elements = nodes.filter((node): node is Element => node instanceof Element);
  const mains = elements.filter(element =>
    getEffectiveAriaRole(element) === "main" && isAlfaIncludedInAccessibilityTree(element));
  const isPerceivable = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement || (node.getRootNode() as ShadowRoot).host;
      return !!node.textContent?.trim() && !!parent && isAlfaRendered(parent) &&
        !parent.closest("script,style,template,noscript");
    }
    return node instanceof Element && isAlfaIncludedInAccessibilityTree(node) &&
      (node.matches("img,svg,canvas,video,audio,iframe,object,embed,input,select,textarea,hr") ||
        isAlfaTabbable(node));
  };
  const perceivable = nodes.filter(isPerceivable);
  // Flat-tree containment also works for slotted/shadow-root children.
  const starts = mains.map(main => {
    const start = positions.get(main)!;
    const end = subtreeEnds.get(main)!;
    const first = perceivable.find(node => positions.get(node)! >= start && positions.get(node)! <= end);
    return { start, first: first ? positions.get(first)! : start };
  });
  const isAtStart = (target: Element): boolean => {
    if (!isAlfaRendered(target)) return false;
    const index = positions.get(target);
    if (index === undefined) return false;
    return starts.some(({ start, first }) =>
      // The main container, its first content, or an empty node preceding that
      // content. A target later in the main block is NOT its start.
      (index >= start && index <= first) ||
      (index < start && !perceivable.some(node => {
        const position = positions.get(node)!;
        return position >= index && position < start;
      })),
    );
  };

  for (const element of elements) {
    if (!isAlfaTabbable(element) || !isAlfaIncludedInAccessibilityTree(element) ||
      element.getAttribute("aria-disabled") === "true") continue;
    let target: Element | null = null;
    if (element.matches("a[href],area[href]") && !element.hasAttribute("download") &&
      (!element.getAttribute("target") || element.getAttribute("target") === "_self")) {
      target = element.hasAttribute("onclick")
        ? simpleScriptTarget(element)
        : fragmentTarget(element.getAttribute("href")!);
    } else if (getEffectiveAriaRole(element) === "button" || getEffectiveAriaRole(element) === "link") {
      target = simpleScriptTarget(element);
    }
    if (target && isAtStart(target)) return;
  }

  results.push({
    ruleId: "ACT-R100", type: "Potential Issue", impact: "moderate",
    description: "Does this page contain an instrument that moves focus to the start of its main content? No supported instrument was established from the markup. Verify skip links and scripted controls anywhere on the page; a missing main landmark alone does not establish failure.",
    element: outerHtmlSnippet(document.documentElement),
    elementContext: `Page-level review. Main-content landmarks: ${mains.map(getSelector).join(", ") || "not identified; locate the main content manually"}. Arbitrary scripted controls were not activated. PDF tags and document alternatives are not assessed by this rule.`,
    selector: "html",
  });
}
