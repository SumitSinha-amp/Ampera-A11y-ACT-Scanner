import { composedAncestors, isAlfaVisible } from "./alfa-helpers";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "./dom-helpers";
import { createKeyboardFocusProbe } from "./keyboard-focus-probe";
import type { ScanRawResult } from "./types";
import { getAccessibleName } from "./accname";
import { hasNativeCaretIndicator, snapshotFocusPaint, type FocusPaint } from "./focus-indicator-paint";

function visibleOutline(style: CSSStyleDeclaration) {
  return style.outlineStyle !== "none" && style.outlineStyle !== "hidden" &&
    parseFloat(style.outlineWidth) > 0 && style.outlineColor !== "transparent" &&
    !/rgba\([^)]*,\s*0(?:\.0*)?\s*\)/.test(style.outlineColor);
}

/** Shared native focus-indicator probe for R65 and Ampera's custom R121.
 * Native Tab input is supplied by the server. R121 additionally requires
 * author outline suppression; neither mode certifies indicator area/contrast.
 */
export function createFocusAppearanceProbe(ruleId: "ACT-R65" | "ACT-R121" = "ACT-R121") {
  const state = createKeyboardFocusProbe();
  state.reset();
  const elements: Element[] = [];
  const roots: (Document | ShadowRoot)[] = [];
  const collect = (root: Document | ShadowRoot) => {
    roots.push(root);
    for (const el of root.querySelectorAll("*")) {
      elements.push(el);
      if (el.shadowRoot) collect(el.shadowRoot);
    }
  };
  collect(document);
  const baseline = new WeakMap<Element, FocusPaint[]>();
  for (const el of elements) baseline.set(el, [snapshotFocusPaint(el), snapshotFocusPaint(el, "::before"), snapshotFocusPaint(el, "::after")]);
  const suppressionRules: CSSStyleRule[] = [];
  const suppresses = (style: CSSStyleDeclaration) =>
    style.outlineStyle === "none" || style.outlineStyle === "hidden" ||
    /^(?:0|0px)$/.test(style.outlineWidth) || style.outlineColor === "transparent" ||
    /^(initial|unset)$/.test(style.getPropertyValue("all"));
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && suppresses(rule.style)) suppressionRules.push(rule);
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
      if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
      if (rule instanceof CSSImportRule) {
        try { if (rule.styleSheet && (!rule.media.mediaText || matchMedia(rule.media.mediaText).matches)) walk(rule.styleSheet.cssRules); } catch { /* unresolved stylesheet: no proof */ }
      } else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const root of roots) for (const sheet of [...root.styleSheets, ...root.adoptedStyleSheets]) {
    if (sheet.disabled || (sheet.media.mediaText && !matchMedia(sheet.media.mediaText).matches)) continue;
    try { walk(sheet.cssRules); } catch { /* Never infer author suppression from inaccessible CSS. */ }
  }
  const ids = new WeakMap<Element, number>();
  let nextId = 0;
  const inspect = (): { id: number; selector?: string; authorSuppressed?: boolean; unverifiedFrame?: boolean; unverifiedTarget?: boolean; issue?: ScanRawResult; box?: { x: number; y: number; width: number; height: number } } => {
    let target = document.activeElement;
    while (target?.shadowRoot?.activeElement) target = target.shadowRoot.activeElement;
    if (!target || target === document.body || target === document.documentElement) return { id: 0 };
    if (!ids.has(target)) ids.set(target, ++nextId);
    const id = ids.get(target)!;
    if (target.matches("iframe")) return { id, unverifiedFrame: true };
    const selector = getSelector(target);
    const descendants = [...target.querySelectorAll("*")];
    // An inline icon link can have zero width while its positioned icon paints
    // outside that box. Test and highlight its visible descendants instead.
    const visible = [target, ...descendants].filter(el => isAlfaVisible(el));
    if (!target.matches(":focus-visible") || !visible.length) return { id, selector, unverifiedTarget: true };
    if (visibleOutline(getComputedStyle(target))) return { id, selector };
    if (hasNativeCaretIndicator(target)) return { id, selector };
    const rule = suppressionRules.find(rule => {
      try { return target!.matches(rule.selectorText); } catch { return false; }
    });
    const inline = target instanceof HTMLElement || target instanceof SVGElement ? target.style : null;
    const authorSuppressed = !!rule || !!(inline && suppresses(inline));
    if (ruleId === "ACT-R121" && !authorSuppressed) return { id, selector };
    // Dynamic/large subtrees require visual review, not an assertion of absence.
    if (descendants.length > 100) return { id, selector, unverifiedTarget: true };
    const visibleSet = new Set(visible), descendantSet = new Set(descendants);
    let colorOnly = false;
    for (const el of [target, ...composedAncestors(target), ...descendants]) {
      if (descendantSet.has(el) && !visibleSet.has(el)) continue;
      const before = baseline.get(el);
      if (!before) return { id, selector, unverifiedTarget: true };
      const after = [snapshotFocusPaint(el), snapshotFocusPaint(el, "::before"), snapshotFocusPaint(el, "::after")];
      if (after.some((value, i) => value.structure !== before[i].structure)) return { id, selector };
      if (after.some((value, i) => value.colors !== before[i].colors)) colorOnly = true;
    }
    const boxes = visible.map(el => el.getBoundingClientRect());
    const rect = {
      left: Math.min(...boxes.map(box => box.left)), top: Math.min(...boxes.map(box => box.top)),
      right: Math.max(...boxes.map(box => box.right)), bottom: Math.max(...boxes.map(box => box.bottom)),
      width: 0, height: 0,
    };
    rect.width = rect.right - rect.left; rect.height = rect.bottom - rect.top;
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.bottom <= 0 ||
      rect.left >= innerWidth || rect.top >= innerHeight) return { id, selector, unverifiedTarget: true };
    const label = getAccessibleName(target).trim();
    return {
      id, selector, authorSuppressed,
      issue: {
        ruleId, type: "Potential Issue", impact: "serious",
        description: ruleId === "ACT-R65"
          ? `Native Tab navigation focused ${label ? JSON.stringify(label) : "this element"} with :focus-visible active, but ${colorOnly ? "only color or other unverified paint changes were observed, without a visible outline or new indicator geometry" : "no visible outline or replacement focus styling was observed on the element, its ancestors, descendants, or pseudo-elements"}. Review the focused-state evidence for WCAG 2.4.7; this is not a confirmed missing indicator or a contrast measurement.`
          : `Native Tab navigation focused this element with :focus-visible active, but its outline is suppressed by ${rule ? JSON.stringify(rule.selectorText) : "inline CSS"} and ${colorOnly ? "only color or other unverified paint changes were observed" : "no replacement focus styling was observed on the element, its ancestors, descendants, or pseudo-elements"}. Verify the rendered indicator; this check does not measure the full WCAG 2.4.13 area/contrast requirements.`,
        selector, element: outerHtmlSnippet(target), elementContext: elementContextForAI(target),
      },
      box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    };
  };
  return { inspect, restore: state.restore };
}
