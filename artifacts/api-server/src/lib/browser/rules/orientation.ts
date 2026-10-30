import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isVisible } from "../visibility";
import type { ScanRawResult } from "../types";

const orientation = /\(\s*orientation\s*:\s*(portrait|landscape)\s*\)/gi;
type ConditionalMedia = { media: MediaList; original: string };

/**
 * R44 / W3C b33eff: compare rotation in the two orientation conditions.
 * Hold viewport dimensions constant, as Alfa does. Temporarily override only
 * orientation media features; the browser still resolves the real cascade,
 * specificity, !important, variables, layers and other media conditions.
 * CSSOM is restored synchronously, including on errors, before returning.
 * Inaccessible cross-origin stylesheets cannot be evaluated by this rule.
 */
export function runOrientationRule(results: ScanRawResult[]): void {
  const media: ConditionalMedia[] = [];
  const candidates = new Set<Element>();
  const roots: (Document | ShadowRoot)[] = [document];
  for (let i = 0; i < roots.length; i++) {
    for (const el of Array.from(roots[i].querySelectorAll("*"))) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }
  }
  for (const root of roots) {
    const visited = new Set<CSSStyleSheet>();
    const readMedia = (list: MediaList): boolean => {
      if (!/\(\s*orientation\s*:\s*(portrait|landscape)\s*\)/i.test(list.mediaText)) return false;
      media.push({ media: list, original: list.mediaText });
      return true;
    };
    const walk = (rules: CSSRuleList, conditional: boolean) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSImportRule) {
          const importedConditional = readMedia(rule.media) || conditional;
          if (rule.styleSheet) sheet(rule.styleSheet, importedConditional);
        } else if (rule instanceof CSSMediaRule) {
          const own = readMedia(rule.media);
          walk(rule.cssRules, conditional || own);
        } else if (rule instanceof CSSStyleRule) {
          if (conditional && (rule.style.transform || rule.style.rotate)) {
            try {
              for (const el of Array.from(root.querySelectorAll(rule.selectorText))) candidates.add(el);
            } catch { /* Pseudo-elements and unsupported selectors are not element targets. */ }
          }
          if (rule.cssRules?.length) walk(rule.cssRules, conditional);
        } else if ("cssRules" in rule) {
          walk((rule as CSSGroupingRule).cssRules, conditional);
        }
      }
    };
    const sheet = (s: CSSStyleSheet, conditional: boolean) => {
      if (visited.has(s) || s.disabled) return;
      visited.add(s);
      try {
        const own = readMedia(s.media);
        walk(s.cssRules, conditional || own);
      } catch { /* Cross-origin CSSOM is unavailable; never infer a failure. */ }
    };
    const sheets = root instanceof Document ? Array.from(root.styleSheets) :
      Array.from(root.querySelectorAll("style,link")).map(el => (el as HTMLStyleElement).sheet).filter((s): s is CSSStyleSheet => !!s);
    for (const s of [...sheets, ...root.adoptedStyleSheets]) sheet(s, false);
  }
  const targets = Array.from(candidates).filter(isVisible);
  if (!targets.length) return;

  const parent = (el: Element): Element | null => el.assignedSlot || el.parentElement ||
    (el.getRootNode() instanceof ShadowRoot ? (el.getRootNode() as ShadowRoot).host : null);
  const rotation = (el: Element): number | null => {
    let angle = 0;
    for (let node: Element | null = el; node; node = parent(node)) {
      const s = getComputedStyle(node);
      if (s.rotate && s.rotate !== "none") {
        const parts = s.rotate.trim().split(/\s+/);
        if (parts.length > 1 && parts[0] !== "z" &&
          !(parts.length === 4 && Number(parts[0]) === 0 && Number(parts[1]) === 0)) return null;
        const token = parts[parts.length - 1], value = parseFloat(token);
        if (!Number.isFinite(value)) return null;
        const sign = parts.length === 4 && Number(parts[2]) < 0 ? -1 : 1;
        angle += sign * (token.endsWith("rad") && !token.endsWith("grad") ? value * 180 / Math.PI :
          token.endsWith("grad") ? value * .9 : token.endsWith("turn") ? value * 360 : value);
      }
      if (s.transform !== "none") {
        const m = new DOMMatrixReadOnly(s.transform);
        // Do not interpret perspective or X/Y rotation as a Z-axis lock.
        if (Math.abs(m.m13) > 1e-6 || Math.abs(m.m23) > 1e-6 ||
          Math.abs(m.m31) > 1e-6 || Math.abs(m.m32) > 1e-6 ||
          Math.abs(m.m34) > 1e-6 || m.m33 < 0 ||
          Math.abs(m.a * m.d - m.b * m.c) < 1e-9) return null;
        angle += Math.atan2(m.b, m.a) * 180 / Math.PI;
      }
    }
    return angle;
  };
  const sample = (mode: "portrait" | "landscape") => {
    for (const item of media) item.media.mediaText = item.original.replace(orientation,
      (_, value: string) => value.toLowerCase() === mode ? "(min-width: 0px)" : "(min-width: 1000000000px)");
    return targets.map(rotation);
  };
  let landscape: (number | null)[], portrait: (number | null)[];
  try {
    landscape = sample("landscape");
    portrait = sample("portrait");
  } finally {
    for (const item of media) item.media.mediaText = item.original;
  }
  targets.forEach((el, i) => {
    const a = landscape[i], b = portrait[i];
    if (a === null || b === null) return;
    const difference = Math.round(((Math.abs(a - b) % 360) + 360) % 360);
    if (difference !== 90 && difference !== 270) return;
    results.push({
      ruleId: "ACT-R44", type: "Issue", impact: "serious",
      description: `Element rotates by ${difference}° between landscape and portrait orientation conditions, restricting its orientation. Review whether the orientation is essential or a control provides an alternative.`,
      selector: getSelector(el), element: outerHtmlSnippet(el), elementContext: elementContextForAI(el),
    });
  });
}
