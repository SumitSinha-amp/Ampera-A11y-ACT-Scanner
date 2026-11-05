import { GLOBAL_ARIA_ATTRS, VALID_ROLES } from "../aria-data";

export const HTML = "http://www.w3.org/1999/xhtml";
export const named = (element: Element, ...names: string[]) =>
  element.namespaceURI === HTML && names.includes(element.localName);

export function flatParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

export function flatAncestors(element: Element): Element[] {
  const result: Element[] = [];
  for (let parent = flatParent(element); parent; parent = flatParent(parent)) result.push(parent);
  return result;
}

export function children(node: Node): Node[] {
  if (node instanceof HTMLSlotElement) return node.assignedNodes({ flatten: true });
  const parent = node instanceof Element ? node.shadowRoot || node : node;
  return Array.from(parent.childNodes).flatMap(child =>
    child instanceof HTMLSlotElement ? children(child) : [child]);
}

export function elementsInTree(): Element[] {
  const result: Element[] = [];
  const seen = new Set<Node>();
  const visit = (node: Node) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (node instanceof Element) result.push(node);
    for (const child of children(node)) visit(child);
  };
  visit(document);
  return result;
}

/** Alfa Style.isRendered: visibility/opacity/ARIA hiding are not exclusions. */
export function isRendered(element: Element): boolean {
  return ![element, ...flatAncestors(element)].some(node => {
    const parent = node.parentElement;
    const fallback = parent && (named(parent, "iframe") ||
      (named(parent, "audio", "video") && !named(node, "source", "track")));
    return fallback || getComputedStyle(node).display === "none";
  });
}

function inertFromAttribute(element: Element): boolean {
  for (const node of [element, ...flatAncestors(element)]) {
    if (node.hasAttribute("inert")) return true;
    if (named(node, "dialog") && node.hasAttribute("open")) return false;
  }
  return false;
}

/**
 * R121 asks specifically for aria.Inert, not invisibility. Visibility-hidden
 * nodes remain ARIA containers; aria-owns changes the AT ancestry, not rendering.
 */
export function listInertPredicate(elements: Element[]): (element: Element) => boolean {
  const owners = new Map<Element, Element>();
  for (const owner of elements) {
    const root = owner.getRootNode() as Document | ShadowRoot;
    for (const id of (owner.getAttribute("aria-owns") || "").trim().split(/\s+/).filter(Boolean)) {
      const child = root.getElementById(id);
      if (!child || child === owner || child.contains(owner) || owners.has(child)) continue;
      let cyclic = false;
      for (let parent: Element | undefined = owner; parent; parent = owners.get(parent)) {
        if (parent === child) { cyclic = true; break; }
      }
      if (!cyclic) owners.set(child, owner);
    }
  }
  const openDialogAncestors = new Set<Element>();
  for (const dialog of elements.filter(element => named(element, "dialog") && element.hasAttribute("open"))) {
    for (const node of [dialog, ...flatAncestors(dialog)]) openDialogAncestors.add(node);
  }
  return (element: Element) => {
    const seen = new Set<Element>();
    let escapedInert = false;
    for (let node: Element | null = element; node; node = owners.get(node) || flatParent(node)) {
      if (seen.has(node)) return true;
      seen.add(node);
      if (!isRendered(node) || node.getAttribute("aria-hidden")?.toLowerCase() === "true") return true;
      if (named(node, "dialog") && node.hasAttribute("open") && !node.hasAttribute("inert")) escapedInert = true;
      if (!escapedInert && inertFromAttribute(node) && !openDialogAncestors.has(node)) return true;
    }
    return false;
  };
}

// The shared concrete-role set predates these standard roles. Keep the
// additional names local; changing other rules' role resolution is out of scope.
const roles = new Set([...VALID_ROLES, "blockquote", "caption", "code", "deletion",
  "emphasis", "generic", "insertion", "meter", "paragraph", "strong", "subscript", "superscript", "time"]);

export function isExplicitlyPresentational(element: Element): boolean {
  const tabIndex = parseInt(element.getAttribute("tabindex") || "", 10);
  const parent = flatParent(element);
  const focusable = (Number.isFinite(tabIndex) && tabIndex === (tabIndex | 0)) ||
    (element instanceof HTMLElement && element.isContentEditable && !(parent instanceof HTMLElement && parent.isContentEditable));
  const allowed = !focusable && !Array.from(element.attributes).some(attr => GLOBAL_ARIA_ATTRS.has(attr.name));
  const explicit = (element.getAttribute("role") || "").trim().toLowerCase().split(/\s+/)
    .filter(role => roles.has(role))
    .find(role => allowed || (role !== "none" && role !== "presentation"));
  return explicit === "none" || explicit === "presentation";
}
