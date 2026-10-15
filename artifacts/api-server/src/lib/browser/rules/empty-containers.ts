import type { ScanRawResult } from "../types";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { composedAncestors } from "../alfa-helpers";
import { getImplicitAriaRole, GLOBAL_ARIA_ATTRS, VALID_ROLES } from "../aria-data";

// Siteimprove sia-r68 checks required owned roles, NOT arbitrary empty boxes.
// Paths are alternatives: table needs row OR rowgroup > row, for example.
// Source: packages/alfa-aria/src/role/data.ts and alfa-rules/src/sia-r68/rule.ts.
const REQUIRED_CHILDREN: Record<string, readonly (readonly string[])[]> = {
  feed: [["article"]],
  grid: [["row"], ["rowgroup", "row"]],
  list: [["listitem"]],
  listbox: [["group", "option"], ["option"]],
  menu: [["group", "menuitem"], ["group", "menuitemradio"], ["group", "menuitemcheckbox"],
    ["menuitem"], ["menuitemcheckbox"], ["menuitemradio"]],
  menubar: [["group", "menuitem"], ["group", "menuitemradio"], ["group", "menuitemcheckbox"],
    ["menuitem"], ["menuitemcheckbox"], ["menuitemradio"]],
  radiogroup: [["radio"]],
  row: [["cell"], ["columnheader"], ["gridcell"], ["rowheader"]],
  rowgroup: [["row"]],
  table: [["row"], ["rowgroup", "row"]],
  tablist: [["tab"]],
  tree: [["group", "treeitem"], ["treeitem"]],
  treegrid: [["row"], ["rowgroup", "row"]],
};
const PRESENTATIONAL_CHILDREN = new Set([
  "button", "checkbox", "img", "menuitemcheckbox", "menuitemradio", "meter",
  "option", "progressbar", "radio", "scrollbar", "separator", "slider", "switch", "tab",
]);

function flatChildren(element: Element): Element[] {
  if (element instanceof HTMLSlotElement) {
    const assigned = element.assignedNodes({ flatten: true });
    if (assigned.length) return assigned.filter((node): node is Element => node instanceof Element);
  }
  return Array.from((element.shadowRoot || element).children);
}

interface AccessibleElement {
  element: Element;
  role: string;
  children: AccessibleElement[];
}

/** Historical entry-point name retained; R68 is a required-owned-role check. */
export function runEmptyContainerRule(results: ScanRawResult[]): void {
  const elements: Element[] = [];
  const collect = (root: ParentNode): void => {
    for (const element of Array.from(root.children)) {
      elements.push(element);
      collect(element);
      if (element.shadowRoot) collect(element.shadowRoot);
    }
  };
  collect(document);

  // aria-owns relocates children in the accessibility tree. Resolve within the
  // same document/shadow root, first owner wins, and reject ownership cycles.
  const owners = new Map<Element, Element>();
  const owned = new Map<Element, Element[]>();
  const ownershipPath = (from: Element, target: Element, seen = new Set<Element>()): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (owned.get(from) || []).some((child) => ownershipPath(child, target, seen));
  };
  for (const element of elements) {
    const root = element.getRootNode() as Document | ShadowRoot;
    for (const id of (element.getAttribute("aria-owns") || "").trim().split(/\s+/)) {
      const child = root.getElementById(id);
      if (!child || child === element || child.contains(element) || owners.has(child)
        || ownershipPath(child, element)) continue;
      owners.set(child, element);
      owned.set(element, [...(owned.get(element) || []), child]);
    }
  }

  const seen = new Set<Element>();
  const nodes: AccessibleElement[] = [];
  const walk = (element: Element, presentational = false): AccessibleElement[] => {
    if (seen.has(element)) return [];
    seen.add(element);
    const ancestors = [element, ...composedAncestors(element)];
    // aria-busy is an applicability exception, not a general live-region or
    // framework exception. Do not require a bounding box, opacity or tab stop.
    if (ancestors.some((node) => node.hasAttribute("hidden") || node.hasAttribute("inert")
      || node.getAttribute("aria-hidden")?.toLowerCase() === "true"
      || window.getComputedStyle(node).display === "none"
      || window.getComputedStyle(node).contentVisibility === "hidden")) return [];
    if (element.matches("input[type='hidden'],script,style,template")) return [];
    const details = element.closest("details:not([open])");
    if (details && details !== element && !details.querySelector("summary")?.contains(element)) return [];

    const explicit = (element.getAttribute("role") || "").trim().toLowerCase().split(/\s+/)
      .find((role) => VALID_ROLES.has(role)
        && (!["none", "presentation"].includes(role)
          || !(element.hasAttribute("tabindex")
            || element.matches("a[href],button,input,select,textarea,summary")
            || Array.from(element.attributes).some((attr) => GLOBAL_ARIA_ATTRS.has(attr.name)))));
    const implicit = getImplicitAriaRole(element);
    const role = explicit || (presentational ? "presentation" : implicit);
    const isPresentational = role === "none" || role === "presentation";
    const childrenPresentational = isPresentational ? !!REQUIRED_CHILDREN[implicit] : PRESENTATIONAL_CHILDREN.has(role);
    const children = [
      ...flatChildren(element).filter((child) => !owners.has(child)),
      ...(owned.get(element) || []),
    ].flatMap((child) => walk(child, childrenPresentational));
    const style = window.getComputedStyle(element);
    // Alfa flattens uninteresting generic/presentational nodes, but a named,
    // focusable or aria-decorated wrapper is a real accessibility-tree boundary.
    const transparent = isPresentational || style.visibility !== "visible"
      || ((!role || role === "generic") && !element.hasAttribute("tabindex")
        && !Array.from(element.attributes).some((attr) => attr.name.startsWith("aria-")));
    if (transparent) return children;
    const node = { element, role, children };
    nodes.push(node);
    return [node];
  };
  if (document.documentElement) walk(document.documentElement);

  const matchesPath = (node: AccessibleElement, path: readonly string[]): boolean =>
    node.role === path[0] && (path.length === 1
      || node.children.some((child) => matchesPath(child, path.slice(1))));

  for (const { element, role, children } of nodes) {
    const required = REQUIRED_CHILDREN[role];
    if (!["http://www.w3.org/1999/xhtml", "http://www.w3.org/2000/svg"].includes(element.namespaceURI || "")
      || !required || [element, ...composedAncestors(element)]
      .some((node) => node.getAttribute("aria-busy") === "true")) continue;
    if (required.some((path) => children.some((child) => matchesPath(child, path)))) continue;
    results.push({
      ruleId: "ACT-R68",
      type: "Issue",
      impact: "serious",
      description: `Element with role="${role}" owns no elements as required by its semantic role. Expected ${required.map((path) => path.join(" > ")).join(" or ")}.`,
      element: outerHtmlSnippet(element),
      elementContext: elementContextForAI(element),
      selector: getSelector(element),
    });
  }
}
