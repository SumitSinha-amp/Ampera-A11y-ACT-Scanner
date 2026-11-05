import { getAccessibleName } from "../accname";
import { getEffectiveAriaRole } from "../aria-data";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";
import { isIncludedInAccessibilityTree } from "../visibility";

// Match @siteimprove/alfa-string String.normalize, without compatibility folding.
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const HTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";

function parentOf(el: Element): Element | null {
  return el.assignedSlot || el.parentElement ||
    (el.getRootNode() instanceof ShadowRoot ? (el.getRootNode() as ShadowRoot).host : null);
}

function contextOf(link: Element): Set<Element> {
  // Port of sia-r81/linkContext: node identity, not textual equality.
  const context = new Set<Element>();
  let paragraphFound = false, cellFound = false;
  for (let el = parentOf(link); el; el = parentOf(el)) {
    const role = getEffectiveAriaRole(el);
    if (role === "listitem") context.add(el);
    if (!paragraphFound && el.localName === "p") {
      context.add(el);
      paragraphFound = true;
    }
    if (!cellFound && (role === "cell" || role === "gridcell")) {
      context.add(el);
      cellFound = true;
    }
  }
  const root = link.getRootNode() as Document | ShadowRoot;
  for (const id of (link.getAttribute("aria-describedby") || "").trim().split(/\s+/)) {
    if (!id) continue;
    const reference = root.getElementById?.(id);
    if (reference) context.add(reference);
  }
  // Upstream also leaves associated table-header context as a TODO.
  return context;
}

function destinationOf(link: Element): string | null {
  // referenceSameResource handles a/area href, not arbitrary scripted links.
  if (link.localName !== "a" && link.localName !== "area") return null;
  const href = link.getAttribute("href");
  if (href === null) return null;
  try {
    // The upstream helper receives the page response URL, not <base href>.
    return new URL(href, document.URL).href;
  } catch { return null; }
}

/** R81: repeated accessible names in matching contexts, not a generic-word blacklist.
 * Different URLs cannot establish resource inequivalence (redirects, translations,
 * equivalent content); report each member for review without following links.
 */
export function runLinkPurposeRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const groups = new Map<string, { el: Element; name: string; destination: string | null }[]>();
  const contextIds = new WeakMap<Element, number>();
  let nextContextId = 0;
  const contextKey = (link: Element) => [...contextOf(link)].map(el => {
    let id = contextIds.get(el);
    if (id === undefined) { id = nextContextId++; contextIds.set(el, id); }
    return id;
  }).sort((a, b) => a - b);
  const seen = new Set<Node>();
  let checked = 0;
  const visit = (node: Node) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (node instanceof Element) {
      if ((node.namespaceURI === HTML || node.namespaceURI === SVG) &&
        getEffectiveAriaRole(node) === "link" && isIncludedInAccessibilityTree(node)) {
        const name = getAccessibleName(node).trim().replace(/\s+/g, " ");
        if (name) {
          checked++;
          const key = JSON.stringify([normalize(name), contextKey(node)]);
          const group = groups.get(key) || [];
          group.push({ el: node, name, destination: destinationOf(node) });
          groups.set(key, group);
        }
      }
      if (node.shadowRoot) { visit(node.shadowRoot); return; }
      if (node instanceof HTMLSlotElement) {
        const assigned = node.assignedNodes({ flatten: true });
        for (const child of assigned.length ? assigned : node.childNodes) visit(child);
        return;
      }
    }
    for (const child of node.childNodes) visit(child);
  };
  visit(document);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    if (first.destination !== null && group.every(item =>
      item.el.localName === first.el.localName && item.destination === first.destination)) continue;
    for (const { el, name, destination } of group) {
      results.push({
        ruleId: "ACT-R81", type: "Potential Issue", impact: "moderate",
        description: `${group.length} links share accessible name "${name}" and matching programmatic context, but have different or unresolved destinations. This link targets ${destination ? JSON.stringify(destination) : "an unresolved resource"}. Review whether the resources serve equivalent purposes, including any redirects; otherwise disambiguate the accessible names.`,
        element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el),
      });
    }
  }
  pushStat("ACT-R81", checked, "element");
}
