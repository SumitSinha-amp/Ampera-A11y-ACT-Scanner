import {
  isAlfaIncludedInAccessibilityTree,
  isAlfaProgrammaticallyHidden,
  isAlfaRendered,
  isAlfaTabbable,
  isAlfaVisible,
} from "./alfa-helpers";

export function isRendered(el: Element): boolean {
  return isAlfaRendered(el);
}

// ─── HELPER: isVisible ───────────────────────────────────────────────────────
// Alfa "isVisible" = full: isRendered + opacity > 0.
// Memoized per scan pass — called from hot loops (contrast/text/link rules)
// and the ancestor clip-box walk does layout reads.
const _visCache = new WeakMap<Element, boolean>();
export function isVisible(el: Element): boolean {
  const cached = _visCache.get(el);
  if (cached !== undefined) return cached;
  const v = computeIsVisible(el);
  _visCache.set(el, v);
  return v;
}

function computeIsVisible(el: Element): boolean {
  if (!isAlfaVisible(el)) return false;
  const cs = window.getComputedStyle(el);
  const cp = cs.clipPath;
  if (cp && cp !== "none") {
    if (/inset\(\s*100%/.test(cp)) return false;
    if (/polygon\(\s*0\s*[a-z%]*\s*,\s*0\s*[a-z%]*\s*,\s*0\s*[a-z%]*\s*,\s*0\s*[a-z%]*\s*\)/i.test(cp))
      return false;
  }
  // Alfa clip handling: an element fully outside an overflow-hidden ancestor's
  // box (e.g. off-slide carousel cards) is not visible
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    let anc: HTMLElement | null = el.parentElement;
    while (anc) {
      const as = window.getComputedStyle(anc);
      if (/(hidden|clip)/.test(as.overflowX + " " + as.overflowY)) {
        const ar = anc.getBoundingClientRect();
        if (ar.width > 0 && ar.height > 0) {
          const noOverlap = rect.right <= ar.left + 1 || rect.left >= ar.right - 1 || rect.bottom <= ar.top + 1 || rect.top >= ar.bottom - 1;
          if (noOverlap) return false;
        }
      }
      anc = anc.parentElement;
    }
  }
  return true;
}

// ─── HELPER: isVisibleRect ───────────────────────────────────────────────────
export function isVisibleRect(el: Element): boolean {
  if (!isVisible(el)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// ─── HELPER: isProgrammaticallyHidden ────────────────────────────────────────
// Alfa-aligned: display:none | visibility:hidden | aria-hidden="true" | inert | content-visibility:hidden
export function isProgrammaticallyHidden(el: Element): boolean {
  return isAlfaProgrammaticallyHidden(el);
}

/**
 * Alfa's accessibility-tree applicability is intentionally separate from
 * visual geometry. An element can be in the tree while being off-screen or
 * zero-sized, but it is excluded when it is hidden from assistive technology
 * or is not rendered at all.
 */
export function isIncludedInAccessibilityTree(el: Element): boolean {
  return isAlfaIncludedInAccessibilityTree(el);
}

/**
 * Approximation of Alfa Style.isTabbable for the browser-side scanner.
 * This deliberately checks actual tab order rather than merely focusability:
 * tabindex="-1", disabled controls, hidden controls, and inert descendants
 * are not tabbable.
 */
export function isActuallyTabbable(el: Element): boolean {
  return isAlfaTabbable(el);
}

// ─── HELPER: isCssHidden ─────────────────────────────────────────────────────
// CSS-only hidden — does NOT check aria-hidden. Used for R11/R12 (link/button names).
export function isCssHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  let node: HTMLElement | null = el;
  while (node) {
    const cs = window.getComputedStyle(node);
    if (cs.display === "none" || cs.visibility === "hidden") return true;
    node = node.parentElement;
  }
  return false;
}

// ─── HELPER: getSubtreeText ───────────────────────────────────────────────────
// AccName subtree: skips aria-hidden subtrees, resolves img alt.
// Alfa improvement: adds block/inline spacing for multi-word names.
