import { getEffectiveAriaRole } from "./aria-data";

/**
 * Browser-side equivalents of the Alfa DOM/device predicates used by several
 * rules. These deliberately expose only behavior, never rule metadata.
 */
export function composedParent(node: Node): Node | null {
  if (node.parentNode) return node.parentNode;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

export function composedAncestors(node: Node): Element[] {
  const ancestors: Element[] = [];
  let current: Node | null = composedParent(node);
  while (current) {
    if (current instanceof Element) ancestors.push(current);
    current = composedParent(current);
  }
  return ancestors;
}

function isClosedDetailsDescendant(el: Element): boolean {
  const details = el.closest("details:not([open])");
  return !!details && !el.matches("summary") && !details.querySelector("summary")?.contains(el);
}

export function isAlfaProgrammaticallyHidden(el: Element): boolean {
  for (const node of [el, ...composedAncestors(el)]) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return true;
    if (node.hasAttribute("inert")) return true;
    const style = window.getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      (style as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility === "hidden"
    ) {
      return true;
    }
  }
  return isClosedDetailsDescendant(el);
}

export function isAlfaRendered(el: Element): boolean {
  return !isAlfaProgrammaticallyHidden(el);
}

export function isAlfaVisible(el: Element): boolean {
  if (!isAlfaRendered(el)) return false;
  for (const node of [el, ...composedAncestors(el)]) {
    if (Number.parseFloat(window.getComputedStyle(node).opacity) === 0) return false;
  }
  const rects = Array.from(el.getClientRects());
  if (rects.length === 0 || rects.every((rect) => rect.width <= 0 || rect.height <= 0)) return false;
  return true;
}

export function isAlfaIncludedInAccessibilityTree(el: Element): boolean {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return false;
  if (!isAlfaRendered(el)) return false;
  const role = getEffectiveAriaRole(el);
  if (role === "none" || role === "presentation") {
    // Presentational roles are ignored only while they have no author name or
    // keyboard exposure. This mirrors the ARIA conflict-resolution behavior
    // used by the bundled engine.
    const isFocusable =
      el.hasAttribute("tabindex") ||
      el.matches("a[href],button,input:not([type='hidden']),select,textarea,summary");
    if (
      !isFocusable &&
      !el.hasAttribute("aria-label") &&
      !el.hasAttribute("aria-labelledby")
    ) {
      return false;
    }
  }
  return true;
}

export function isAlfaTabbable(el: Element): boolean {
  if (!(el instanceof HTMLElement) || !isAlfaRendered(el)) return false;
  if (el.matches("input[type='hidden'],:disabled,[disabled]")) return false;
  const tabIndex = el.getAttribute("tabindex");
  if (tabIndex !== null) {
    const numeric = Number.parseInt(tabIndex, 10);
    return Number.isFinite(numeric) && numeric >= 0;
  }
  return el.matches(
    "a[href],area[href],button,input:not([type='hidden']),select,textarea,summary,iframe,audio[controls],video[controls]",
  );
}

export function isAlfaFocusable(el: Element): boolean {
  if (!(el instanceof HTMLElement) || !isAlfaRendered(el)) return false;
  if (el.matches("input[type='hidden'],:disabled,[disabled]")) return false;
  if (el.hasAttribute("tabindex")) return Number.isFinite(Number.parseInt(el.getAttribute("tabindex") || "", 10));
  return el.matches(
    "a[href],area[href],button,input:not([type='hidden']),select,textarea,summary,iframe,audio[controls],video[controls]",
  );
}

const WIDGET_ROLES = new Set([
  "button", "checkbox", "combobox", "link", "listbox", "menuitem",
  "menuitemcheckbox", "menuitemradio", "option", "radio", "searchbox",
  "slider", "spinbutton", "switch", "tab", "textbox", "treeitem",
]);

export function isAlfaPointerTarget(el: Element): boolean {
  if (!isAlfaFocusable(el) || !isAlfaIncludedInAccessibilityTree(el)) return false;
  const role = getEffectiveAriaRole(el);
  return WIDGET_ROLES.has(role) || el.matches("a[href],area[href],button,input,select,textarea,summary");
}

export function getAlfaPointerTargets(root: ParentNode = document): Element[] {
  const candidates = Array.from(
    root.querySelectorAll(
      "a[href],area[href],button,input:not([type='hidden']),select,textarea,summary,iframe,audio[controls],video[controls],[role]",
    ),
  ).filter(isAlfaPointerTarget);

  // The Alfa rule walks the full tree and suppresses inline descendants of an
  // already-selected block target. This avoids treating icon/text fragments
  // inside one control as independent touch targets.
  return candidates.filter((candidate) => {
    if (window.getComputedStyle(candidate).display !== "inline") return true;
    return !candidates.some(
      (ancestor) =>
        ancestor !== candidate &&
        ancestor.contains(candidate) &&
        window.getComputedStyle(ancestor).display === "block",
    );
  });
}

export function getAlfaTargetRects(el: Element): DOMRect[] {
  const own = Array.from(el.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (own.length === 0) return [];

  // Nested clickable descendants own their pointer regions. Excluding their
  // rectangles keeps the parent’s effective target close to Alfa tQ's
  // subtraction of interposed descendants.
  const nestedTargets = Array.from(el.querySelectorAll("*")).filter(
    (child) => child !== el && isAlfaPointerTarget(child),
  );
  return own.filter((rect) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return !nestedTargets.some((target) =>
      Array.from(target.getClientRects()).some(
        (nested) =>
          nested.width > 0 &&
          nested.height > 0 &&
          centerX >= nested.left &&
          centerX <= nested.right &&
          centerY >= nested.top &&
          centerY <= nested.bottom,
      ),
    );
  });
}

export function hasAlfaTargetSize(el: Element, size: number): boolean {
  return getAlfaTargetRects(el).some((rect) => rect.width >= size && rect.height >= size);
}

export function hasAlfaImageTargetSize(el: Element, size: number): boolean {
  if (!el.matches("a[href],area[href]")) return false;
  return Array.from(el.querySelectorAll("img,svg")).some((image) =>
    Array.from(image.getClientRects()).some(
      (rect) => rect.width >= size && rect.height >= size,
    ),
  );
}

function circleIntersectsRect(centerX: number, centerY: number, radius: number, rect: DOMRect): boolean {
  const nearestX = Math.max(rect.left, Math.min(centerX, rect.right));
  const nearestY = Math.max(rect.top, Math.min(centerY, rect.bottom));
  const dx = centerX - nearestX;
  const dy = centerY - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function hasAlfaTargetSpacing(el: Element, allTargets: Element[], size = 24): boolean {
  const rects = getAlfaTargetRects(el);
  if (rects.length === 0) return true;
  const radius = size / 2;
  return !allTargets.some((other) => {
    if (other === el) return false;
    return getAlfaTargetRects(other).some((otherRect) =>
      rects.some((rect) =>
        circleIntersectsRect(rect.left + rect.width / 2, rect.top + rect.height / 2, radius, otherRect),
      ),
    );
  });
}

const LANDMARK_ROLES = new Set([
  "banner", "complementary", "contentinfo", "form", "main", "navigation", "region", "search",
]);

export function isAlfaLandmark(el: Element): boolean {
  return LANDMARK_ROLES.has(getEffectiveAriaRole(el));
}

export function isInsideAlfaLandmarkOrDialog(el: Element): boolean {
  return composedAncestors(el).some((ancestor) => {
    const role = getEffectiveAriaRole(ancestor);
    return LANDMARK_ROLES.has(role) || role === "dialog";
  });
}

export function getAlfaTabOrder(root: ParentNode = document): Element[] {
  return Array.from(root.querySelectorAll("*"))
    .filter(isAlfaTabbable)
    .sort((left, right) => {
      const leftIndex = left.tabIndex;
      const rightIndex = right.tabIndex;
      const leftPositive = leftIndex > 0;
      const rightPositive = rightIndex > 0;
      if (leftPositive && rightPositive && leftIndex !== rightIndex) return leftIndex - rightIndex;
      if (leftPositive !== rightPositive) return leftPositive ? -1 : 1;
      return 0;
    });
}

function focusSignature(el: Element): string {
  const style = window.getComputedStyle(el);
  return [
    style.outlineColor, style.outlineStyle, style.outlineWidth, style.outlineOffset,
    style.boxShadow, style.textDecorationLine, style.textDecorationColor,
    style.color, style.backgroundColor,
    style.borderTopColor, style.borderTopStyle, style.borderTopWidth,
    style.borderRightColor, style.borderRightStyle, style.borderRightWidth,
    style.borderBottomColor, style.borderBottomStyle, style.borderBottomWidth,
    style.borderLeftColor, style.borderLeftStyle, style.borderLeftWidth,
  ].join("|");
}

/**
 * Mirrors Alfa R65's focus-state comparison: an indicator can be on the
 * focused target or any of its ancestors and may be an outline, decoration,
 * box-shadow, color/background, or border change.
 */
export function hasAlfaFocusIndicator(el: Element): boolean {
  if (!(el instanceof HTMLElement) || typeof el.focus !== "function") return false;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const watched = [el, ...composedAncestors(el)].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  const before = watched.map(focusSignature);
  try {
    el.focus({ preventScroll: true });
    const after = watched.map(focusSignature);
    return after.some((value, index) => value !== before[index]);
  } finally {
    if (active && active !== el && active.isConnected) {
      active.focus({ preventScroll: true });
    } else if (document.body) {
      document.body.focus({ preventScroll: true });
    }
  }
}