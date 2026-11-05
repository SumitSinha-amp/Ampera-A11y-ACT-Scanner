import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";
import { HTML, named, children, elementsInTree, isRendered, listInertPredicate, isExplicitlyPresentational } from "./list-accesskey-tree";

// Custom ACT-R130/R131 follow upstream sia-r121/r122, respectively.
// Use native element names, not ARIA roles, for HTML content-model validation.
const hasText = (element: Element) => children(element).some(node =>
  node.nodeType === Node.TEXT_NODE && (node.textContent || "").trim() !== "");
const straySlots = (element: Element) => Array.from(element.children).filter(child =>
  child instanceof HTMLSlotElement && !(child.getRootNode() instanceof ShadowRoot));
const contentElements = (element: Element, isInert: (element: Element) => boolean) => children(element)
  .filter((node): node is Element => node instanceof Element)
  .filter(child => !named(child, "script", "template") && !isInert(child));

function listProblem(target: Element, isInert: (element: Element) => boolean): string | undefined {
  if (hasText(target)) return "The list contains direct text outside its permitted child elements.";
  const items = contentElements(target, isInert);
  const invalid = [...items.filter(item => !named(item,
    ...(named(target, "dl") ? ["div", "dt", "dd"] : ["li"]))), ...straySlots(target)];
  if (invalid.length) {
    return `The list contains disallowed child elements: ${invalid.map(getSelector).join(", ")}. Required native HTML elements cannot be replaced by ARIA roles.`;
  }
  if (!named(target, "dl")) return;
  const wrappers = items.filter(item => named(item, "div"));
  if (wrappers.length) {
    if (items.some(item => named(item, "dt", "dd"))) {
      return "The description list mixes div-wrapped groups with unwrapped dt/dd elements.";
    }
    const malformed = wrappers.filter(wrapper => {
      if (hasText(wrapper) || straySlots(wrapper).length) return true;
      const group = contentElements(wrapper, isInert);
      const firstDescription = group.findIndex(item => !named(item, "dt"));
      return firstDescription <= 0 || !group.slice(firstDescription).every(item => named(item, "dd"));
    });
    if (malformed.length) {
      return `Each div must contain exactly one group of one or more dt elements followed by one or more dd elements. Malformed groups: ${malformed.map(getSelector).join(", ")}.`;
    }
  } else if (items.length && (named(items[0], "dd") || named(items[items.length - 1], "dt"))) {
    return "Every description-list group must have one or more dt elements followed by one or more dd elements; a leading dd or trailing dt has no matching group.";
  }
  return undefined;
}

function finding(ruleId: string, target: Element, description: string): ScanRawResult {
  return {
    ruleId, type: ruleId === "ACT-R130" ? "Issue" : "Best Practice",
    impact: ruleId === "ACT-R130" ? "serious" : "moderate",
    description, selector: getSelector(target), element: outerHtmlSnippet(target),
    elementContext: elementContextForAI(target),
  };
}

export function runListContentRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const elements = elementsInTree();
  const isInert = listInertPredicate(elements);
  const lists = elements.filter(element =>
    named(element, "ul", "ol", "dl") && !isInert(element) && !isExplicitlyPresentational(element));
  pushStat("ACT-R130", lists.length, "element");
  for (const list of lists) {
    const problem = listProblem(list, isInert);
    if (problem) results.push(finding("ACT-R130", list, problem));
  }
}

// Upstream Style.isRendered checks display:none, not accessibility-tree
// inclusion: aria-hidden/inert, opacity and visibility do not remove a key
// from this check. Do not use isAlfaRendered (it also excludes aria-hidden).
export interface AccesskeyTarget {
  tokens: string[];
  selector: string | null;
  element: string | null;
  elementContext?: string | null;
}

export function collectAccesskeyTargets(): AccesskeyTarget[] {
  return elementsInTree().filter(element =>
    element.namespaceURI === HTML && element.hasAttribute("accesskey") && isRendered(element))
    .map(element => ({
      selector: getSelector(element), element: outerHtmlSnippet(element),
      elementContext: elementContextForAI(element),
      tokens: (element.getAttribute("accesskey") || "").trim().split(/\s+/).filter(Boolean),
    })).filter(target => target.tokens.length);
}

/** One atomic target result, with all three independent expectations. */
export function evaluateAccesskeyTargets(targets: AccesskeyTarget[]): ScanRawResult[] {
  const results: ScanRawResult[] = [];
  const owners = new Map<string, Set<AccesskeyTarget>>();
  for (const target of targets) for (const token of target.tokens) {
    const key = token.toLowerCase();
    if (!owners.has(key)) owners.set(key, new Set());
    owners.get(key)!.add(target);
  }
  for (const target of targets) {
    const { tokens } = target;
    const keys = tokens.map(token => token.toLowerCase());
    const contested = [...new Set(keys.filter(key => owners.get(key)!.size > 1))];
    const tooLong = [...new Set(tokens.filter(token => token.length !== 1))];
    const repeated = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
    const problems: string[] = [];
    if (contested.length) problems.push(`Access keys declared by another rendered element: ${JSON.stringify(contested)}.`);
    if (tooLong.length) problems.push(`Access-key tokens must be single characters: ${JSON.stringify(tooLong)}.`);
    if (repeated.length) problems.push(`Access keys repeated within this element (case-insensitive): ${JSON.stringify(repeated)}.`);
    if (problems.length) results.push({
      ruleId: "ACT-R131", type: "Best Practice", impact: "moderate",
      selector: target.selector, element: target.element, elementContext: target.elementContext,
      description: problems.join(" "),
    });
  }
  return results;
}

export function runAccesskeyRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const targets = collectAccesskeyTargets();
  pushStat("ACT-R131", targets.length, "element");
  results.push(...evaluateAccesskeyTargets(targets));
}
