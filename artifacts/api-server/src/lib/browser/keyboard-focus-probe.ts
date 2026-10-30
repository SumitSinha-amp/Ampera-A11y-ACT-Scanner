import { composedAncestors, isAlfaVisible } from "./alfa-helpers";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "./dom-helpers";
import type { ScanRawResult } from "./types";

type Box = { left: number; top: number; right: number; bottom: number };
function intersect(a: Box, b: Box): Box | null {
  const box = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return box.right > box.left && box.bottom > box.top ? box : null;
}
function subtract(a: Box, b: Box): Box[] {
  const cut = intersect(a, b);
  if (!cut) return [a];
  return [
    { ...a, bottom: cut.top }, { ...a, top: cut.bottom },
    { left: a.left, right: cut.left, top: cut.top, bottom: cut.bottom },
    { left: cut.right, right: a.right, top: cut.top, bottom: cut.bottom },
  ].filter(box => box.right > box.left && box.bottom > box.top);
}
function activeElement(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}
function opaqueColor(color: string): boolean {
  // Browser computed colors use rgb()/rgba(). Unknown color spaces remain
  // reviewable, not confirmed. A transparent hit-test layer is NOT an occluder.
  return /^rgb\(/.test(color) || /^rgba\([^)]*,\s*1(?:\.0*)?\s*\)$/.test(color);
}
function hasPlainPaint(element: Element): boolean {
  const style = getComputedStyle(element);
  return opaqueColor(style.backgroundColor) && style.clipPath === "none" &&
    style.transform === "none" && style.filter === "none" &&
    style.mixBlendMode === "normal" && style.maskImage === "none" &&
    [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius]
      .every(radius => Number.parseFloat(radius) === 0) &&
    [element, ...composedAncestors(element)].every(node => {
      const s = getComputedStyle(node);
      return Number(s.opacity) === 1 && s.visibility === "visible" &&
        s.clipPath === "none" && s.transform === "none" && s.filter === "none" &&
        s.maskImage === "none" && s.mixBlendMode === "normal";
    });
}

/**
 * Browser half of the trusted-keyboard probe. This never activates controls or
 * submits forms. Puppeteer supplies real Tab/Shift+Tab so author focus handlers,
 * native scrolling, focus traps and positive tabindex order are actually used.
 */
export function createKeyboardFocusProbe() {
  const originalFocus = activeElement();
  const originalScroll = { x: scrollX, y: scrollY };
  const elements: Element[] = [];
  const collect = (root: Document | ShadowRoot) => {
    for (const element of root.querySelectorAll("*")) {
      elements.push(element);
      if (element.shadowRoot) collect(element.shadowRoot);
    }
  };
  collect(document);
  const scrollables = elements.filter((el): el is HTMLElement => el instanceof HTMLElement &&
    (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth));
  const scrollState = scrollables.map(el => ({ el, x: el.scrollLeft, y: el.scrollTop }));
  const styles = [...new Set([document.documentElement, ...scrollables])].map(el => ({
    el, hadStyle: el.hasAttribute("style"), value: el.style.getPropertyValue("scroll-behavior"), priority: el.style.getPropertyPriority("scroll-behavior"),
  }));
  for (const { el } of styles) el.style.setProperty("scroll-behavior", "auto", "important");
  const selection = originalFocus instanceof HTMLInputElement || originalFocus instanceof HTMLTextAreaElement
    ? { start: originalFocus.selectionStart, end: originalFocus.selectionEnd, direction: originalFocus.selectionDirection }
    : null;
  const identities = new WeakMap<Element, number>();
  let nextIdentity = 0;

  function reset() {
    const root = document.documentElement;
    const tabindex = root.getAttribute("tabindex");
    try {
      root.setAttribute("tabindex", "-1");
      root.focus({ preventScroll: true });
    } finally {
      if (tabindex === null) root.removeAttribute("tabindex");
      else root.setAttribute("tabindex", tabindex);
    }
  }

  function inspect(): { id: number; unverifiedFrame?: boolean; issue?: ScanRawResult; box?: { x: number; y: number; width: number; height: number } } {
    const target = activeElement();
    if (!target || target === document.body || target === document.documentElement) return { id: 0 };
    if (!identities.has(target)) identities.set(target, ++nextIdentity);
    const id = identities.get(target)!;
    // Iframes are verified in their own document, not by treating their host
    // as the focused child. Off-viewport/clipped controls are not proven
    // author-content obscuration merely because Tab moved focus to them.
    if (target.matches("iframe")) return { id, unverifiedFrame: true };
    if (!isAlfaVisible(target) ||
      !(target instanceof HTMLElement)) return { id };
    const fragments = Array.from(target.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    if (!fragments.length || fragments.some(rect =>
      rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight)) return { id };

    // Hit-testing normally omits pointer-events:none artwork even when opaque.
    // Temporarily include such paint layers, restoring the exact declarations
    // synchronously before any event or screenshot can observe the override.
    const overrides: { el: HTMLElement | SVGElement; style: string | null }[] = [];
    const candidateBlockers = new Set<Element>();
    const root = target.getRootNode();
    const elementsAt = (x: number, y: number) => root instanceof ShadowRoot
      ? root.elementsFromPoint(x, y) : document.elementsFromPoint(x, y);
    try {
      if (getComputedStyle(target).pointerEvents === "none") {
        overrides.push({ el: target, style: target.getAttribute("style") });
        target.style.setProperty("pointer-events", "auto", "important");
      }
      for (const element of elements) {
        if (!(element instanceof HTMLElement || element instanceof SVGElement) ||
          element === target || target.contains(element) || composedAncestors(target).includes(element)) continue;
        if (getComputedStyle(element).pointerEvents !== "none") continue;
        const rect = element.getBoundingClientRect();
        if (!fragments.some(fragment => intersect(fragment, rect)) || !hasPlainPaint(element)) continue;
        overrides.push({ el: element, style: element.getAttribute("style") });
        element.style.setProperty("pointer-events", "auto", "important");
      }
      for (const rect of fragments) {
        for (const x of [rect.left + 0.1, (rect.left + rect.right) / 2, rect.right - 0.1]) {
          for (const y of [rect.top + 0.1, (rect.top + rect.bottom) / 2, rect.bottom - 0.1]) {
            for (const element of elementsAt(x, y)) {
              if (element === target || target.contains(element)) break;
              if (!composedAncestors(target).includes(element)) candidateBlockers.add(element);
            }
          }
        }
      }
      let uncovered: Box[] = fragments.map(rect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }));
      const blockers: Element[] = [];
      for (const blocker of candidateBlockers) {
        if (!hasPlainPaint(blocker)) continue;
        const rect = blocker.getBoundingClientRect();
        // Restrict painted rectangles to ancestor clipping areas.
        let painted: Box | null = rect;
        for (const ancestor of composedAncestors(blocker)) {
          if (!painted) break;
          const style = getComputedStyle(ancestor);
          const clip = ancestor.getBoundingClientRect();
          painted = intersect(painted, {
            left: style.overflowX === "visible" ? -Infinity : clip.left + ancestor.clientLeft,
            right: style.overflowX === "visible" ? Infinity : clip.left + ancestor.clientLeft + ancestor.clientWidth,
            top: style.overflowY === "visible" ? -Infinity : clip.top + ancestor.clientTop,
            bottom: style.overflowY === "visible" ? Infinity : clip.top + ancestor.clientTop + ancestor.clientHeight,
          });
        }
        if (!painted) continue;
        for (const area of [...uncovered]) {
          const overlap = intersect(area, painted);
          if (!overlap) continue;
          // Validate stacking over this whole rectangular intersection, not
          // merely a centre-point hit which would flag partially covered focus.
          const points = [
            [overlap.left + .1, overlap.top + .1], [overlap.right - .1, overlap.top + .1],
            [overlap.left + .1, overlap.bottom - .1], [overlap.right - .1, overlap.bottom - .1],
            [(overlap.left + overlap.right) / 2, (overlap.top + overlap.bottom) / 2],
          ];
          if (!points.every(([x, y]) => {
            const stack = elementsAt(x, y);
            const index = stack.indexOf(blocker);
            const targetIndex = stack.findIndex(node => node === target || target.contains(node));
            return index >= 0 && (targetIndex < 0 || index < targetIndex);
          })) continue;
          uncovered = uncovered.flatMap(piece => subtract(piece, overlap));
          blockers.push(blocker);
        }
        if (!uncovered.length) break;
      }
      if (uncovered.length) return { id };
      const rect = target.getBoundingClientRect();
      const selector = getSelector(target);
      const blockerNames = [...new Set(blockers.map(getSelector))].join(", ");
      return {
        id,
        issue: {
          ruleId: "ACT-R119", type: "Issue", impact: "serious",
          description: `Keyboard focus reached this control, but its entire rendered area was hidden behind opaque page content (${blockerNames}). Confirmed using Tab/Shift+Tab navigation (WCAG 2.4.11).`,
          selector, element: outerHtmlSnippet(target),
          elementContext: `${elementContextForAI(target)}\nObscuring content: ${blockerNames}`,
        },
        // Evidence is a viewport screenshot at the actual scroll position.
        box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      };
    } finally {
      for (const { el, style } of overrides) {
        if (style === null) el.removeAttribute("style");
        else el.setAttribute("style", style);
      }
    }
  }

  function restore() {
    try {
      if (originalFocus instanceof HTMLElement && originalFocus.isConnected) {
        originalFocus.focus({ preventScroll: true });
        if (selection && selection.start !== null && selection.end !== null &&
          (originalFocus instanceof HTMLInputElement || originalFocus instanceof HTMLTextAreaElement)) {
          originalFocus.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
        }
      } else if (activeElement() instanceof HTMLElement) {
        (activeElement() as HTMLElement).blur();
      }
    } finally {
      for (const { el, x, y } of scrollState) el.scrollTo({ left: x, top: y, behavior: "instant" });
      window.scrollTo({ left: originalScroll.x, top: originalScroll.y, behavior: "instant" });
      for (const { el, hadStyle, value, priority } of styles) {
        if (value) el.style.setProperty("scroll-behavior", value, priority);
        else el.style.removeProperty("scroll-behavior");
        if (!hadStyle && !el.getAttribute("style")) el.removeAttribute("style");
      }
    }
  }
  return { reset, inspect, restore };
}
