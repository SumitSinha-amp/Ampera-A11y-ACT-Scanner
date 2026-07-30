import { getSubtreeText } from "./dom-helpers";

export function isRendered(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  let node: HTMLElement | null = el;
  while (node) {
    if (node.hasAttribute("hidden")) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    node = node.parentElement;
  }
  return true;
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
  if (!(el instanceof HTMLElement)) return false;
  if (!isRendered(el)) return false;
  let node: HTMLElement | null = el;
  while (node) {
    const style = window.getComputedStyle(node);
    if (parseFloat(style.opacity) === 0) return false;
    node = node.parentElement;
  }
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
  if (el.getAttribute("aria-hidden") === "true") return true;
  let node: Element | null = el;
  while (node) {
    if (node.getAttribute("aria-hidden") === "true") return true;
    // Alfa addition: inert attribute hides from AT
    if (node.hasAttribute("inert")) return true;
    const cs = window.getComputedStyle(node as HTMLElement);
    if (cs.display === "none" || cs.visibility === "hidden") return true;
    // Alfa addition: content-visibility:hidden hides from AT
    if ((cs as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility === "hidden") return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Alfa's accessibility-tree applicability is intentionally separate from
 * visual geometry. An element can be in the tree while being off-screen or
 * zero-sized, but it is excluded when it is hidden from assistive technology
 * or is not rendered at all.
 */
export function isIncludedInAccessibilityTree(el: Element): boolean {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return false;
  if (isProgrammaticallyHidden(el)) return false;
  if (el.hasAttribute("hidden")) return false;
  const style = window.getComputedStyle(el as HTMLElement);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if ((style as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility === "hidden") return false;
  return true;
}

/**
 * Approximation of Alfa Style.isTabbable for the browser-side scanner.
 * This deliberately checks actual tab order rather than merely focusability:
 * tabindex="-1", disabled controls, hidden controls, and inert descendants
 * are not tabbable.
 */
export function isActuallyTabbable(el: Element): boolean {
  if (!(el instanceof HTMLElement) || !isIncludedInAccessibilityTree(el)) return false;
  if (el.getAttribute("tabindex") === "-1") return false;
  if (el.matches("input[type='hidden'], :disabled, [disabled]")) return false;
  const explicitTabIndex = el.getAttribute("tabindex");
  const hasNonNegativeTabIndex = explicitTabIndex !== null && Number.isFinite(Number(explicitTabIndex)) && Number(explicitTabIndex) >= 0;
  const hasNativeTabOrder = el.matches(
    "a[href], area[href], button, input:not([type='hidden']), select, textarea, summary, audio[controls], video[controls], iframe",
  );
  if (!hasNativeTabOrder && !hasNonNegativeTabIndex) return false;
  const rects = el.getClientRects();
  return rects.length > 0 || el.offsetParent !== null || hasNonNegativeTabIndex;
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
