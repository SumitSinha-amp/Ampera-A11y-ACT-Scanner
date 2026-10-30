import { alphaComposite, getContrastRatio, getLuminanceFromColorString } from "../contrast";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";

const HTML = "http://www.w3.org/1999/xhtml";
const STATES = ["visited", "link", "hover", "focus", "focus-visible", "focus-within"];
const PREFIX = "data-ampera-r88-";

/** Rewrite selectors, not declaration strings or attribute values. Attribute
 * selectors retain the specificity of the pseudo-classes they replace.
 * This also exposes authored :visited colours without reading browser history.
 */
export function rewriteLinkStateSelector(selector: string): string {
  let result = "", quote = "", brackets = 0;
  for (let i = 0; i < selector.length;) {
    const c = selector[i];
    if (c === "\\") { result += selector.slice(i, i + 2); i += 2; continue; }
    if (quote) {
      result += c;
      if (c === quote) quote = "";
      i++;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; result += c; i++; continue; }
    if (c === "[") brackets++;
    if (c === "]") brackets--;
    const match = brackets === 0 && c === ":" && selector[i - 1] !== ":"
      ? selector.slice(i + 1).match(/^(focus-visible|focus-within|visited|hover|focus|link)(?![\w-])/i)
      : null;
    if (match) {
      result += `[${PREFIX}${match[1].toLowerCase()}]`;
      i += match[0].length + 1;
    } else { result += c; i++; }
  }
  return result;
}

function parentOf(node: Node): Element | null {
  return (node as Element).assignedSlot || node.parentElement ||
    (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host : null);
}

function ancestors(node: Node): Element[] {
  const result: Element[] = [];
  for (let el = parentOf(node); el; el = parentOf(el)) result.push(el);
  return result;
}

function rgba(color: string): number[] | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return Array.from(context.getImageData(0, 0, 1, 1).data);
}

function opacity(color: string): number {
  return (rgba(color)?.[3] ?? 0) / 255;
}

function normalized(color: string): string | null {
  const channels = rgba(color);
  return channels ? `rgba(${channels[0]},${channels[1]},${channels[2]},${channels[3] / 255})` : null;
}

type Measurement = { visible: boolean; ratio?: number; minimum?: number; reason?: string };

/**
 * Only assert a failure when the actual background can be established.
 * Images, gradients, pseudo-element paint and overlapping siblings are not
 * replaced with ancestor white or an averaged screenshot patch. Neither is
 * equivalent to Alfa's highest-possible-contrast expectation.
 */
function measure(text: Text, el: Element): Measurement {
  const chain = [el, ...ancestors(el)];
  const styles = chain.map(n => getComputedStyle(n));
  if (styles.some(s => s.display === "none" || s.contentVisibility === "hidden" ||
    Number(s.opacity) === 0) || getComputedStyle(el).visibility !== "visible") return { visible: false };
  const range = document.createRange();
  range.selectNodeContents(text);
  const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
  if (!rects.length) return { visible: false };
  // A clip used for visually hidden text is not a contrast target. Do not
  // exclude aria-hidden: visually perceivable text still requires contrast.
  if (styles.some(s => /inset\(\s*(?:50|100)%/.test(s.clipPath) ||
    (s.clip !== "auto" && /rect\(\s*0(?:px)?[, ]/.test(s.clip)))) return { visible: false };
  if (styles.some(s => Number(s.opacity) < 1 || s.mixBlendMode !== "normal" || s.filter !== "none")) {
    return { visible: true, reason: "opacity, blending or filtering requires rendered review" };
  }

  let background = "rgb(255,255,255)";
  let opaqueAt = chain.length - 1;
  const layers: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const s = styles[i];
    if (s.backgroundImage !== "none") return { visible: true, reason: "image or gradient background requires highest-contrast review" };
    for (const pseudo of ["::before", "::after"]) {
      const p = getComputedStyle(chain[i], pseudo);
      if (p.content !== "none" && p.content !== "normal" &&
        (p.backgroundImage !== "none" || opacity(p.backgroundColor) > 0)) {
        return { visible: true, reason: "painted pseudo-element background requires review" };
      }
    }
    layers.push(s.backgroundColor);
    if (opacity(s.backgroundColor) >= 1) { opaqueAt = i; break; }
  }
  // The background may be a sibling under an absolutely positioned header,
  // not an ancestor. Inspect the painted stack at each text fragment.
  for (const rect of rects) {
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
      if (opaqueAt > 0 && styles.slice(0, opaqueAt).some(s => /absolute|fixed/.test(s.position))) {
        return { visible: true, reason: "offscreen positioned text has an unverified backdrop" };
      }
      continue;
    }
    const stack = (el.getRootNode() as Document).elementsFromPoint?.(x, y) || document.elementsFromPoint(x, y);
    for (const painted of stack) {
      if (painted === chain[opaqueAt]) break;
      if (chain.includes(painted) || el.contains(painted)) continue;
      const s = getComputedStyle(painted);
      if (s.backgroundImage !== "none" || opacity(s.backgroundColor) > 0 ||
        painted.matches("img,svg,canvas,video")) {
        return { visible: true, reason: "overlapping content supplies a non-ancestor background" };
      }
    }
  }
  for (const layer of layers.reverse()) {
    const color = normalized(layer);
    if (!color) return { visible: true, reason: "background colour cannot be resolved" };
    background = alphaComposite(color, background);
  }
  const style = styles[0];
  const color = normalized(style.color);
  if (!color) return { visible: true, reason: "foreground colour cannot be resolved" };
  const foreground = alphaComposite(color, background);
  const fg = getLuminanceFromColorString(foreground), bg = getLuminanceFromColorString(background);
  if (fg === null || bg === null) return { visible: true, reason: "foreground or background colour cannot be resolved" };
  const size = parseFloat(style.fontSize), weight = parseFloat(style.fontWeight);
  const large = size >= 24 || (size >= 56 / 3 && weight >= 700);
  return { visible: true, ratio: getContrastRatio(fg, bg), minimum: large ? 3 : 4.5 };
}

/** SIA-R88: text-node targets; all eight authored link-state combinations.
 * No clicks, navigation, focus events or history writes are performed.
 */
export function runLinkMinimumContrastRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const targets = new Map<Element, { text: Text; parent: Element }[]>();
  const roots = new Set<Document | ShadowRoot>([document]);
  const seen = new Set<Node>();
  const visit = (node: Node) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (node instanceof Text && node.textContent?.trim()) {
      const chain = ancestors(node), el = chain[0];
      const link = chain.find(n => n.namespaceURI === HTML && n.matches("a[href],area[href]"));
      if (el?.namespaceURI === HTML && link &&
        !chain.some(n => n.matches(":disabled") || n.getAttribute("aria-disabled")?.toLowerCase() === "true")) {
        const list = targets.get(link) || [];
        list.push({ text: node, parent: el });
        targets.set(link, list);
      }
      return;
    }
    if (node instanceof Element && node.shadowRoot) {
      roots.add(node.shadowRoot);
      visit(node.shadowRoot);
    } else if (node instanceof HTMLSlotElement) {
      const assigned = node.assignedNodes({ flatten: true });
      for (const child of assigned.length ? assigned : node.childNodes) visit(child);
    } else for (const child of node.childNodes) visit(child);
  };
  visit(document.body);
  // Capture author markup before adding any temporary state attributes.
  // Internal probe attributes must never leak into persisted issue evidence.
  const originalEvidence = new Map<Text, Pick<ScanRawResult, "element" | "elementContext" | "selector">>();
  for (const texts of targets.values()) for (const { text, parent } of texts) {
    originalEvidence.set(text, {
      element: outerHtmlSnippet(parent),
      elementContext: elementContextForAI(parent),
      selector: getSelector(parent),
    });
  }

  const modified: { rule: CSSStyleRule; selector: string }[] = [];
  const savedAttributes = new Map<Element, Map<string, string | null>>();
  const guards: HTMLStyleElement[] = [];
  let incompleteStyles = false;
  const set = (el: Element, state: string, enabled: boolean) => {
    const name = PREFIX + state;
    let saved = savedAttributes.get(el);
    if (!saved) savedAttributes.set(el, saved = new Map());
    if (!saved.has(name)) saved.set(name, el.getAttribute(name));
    if (enabled) el.setAttribute(name, ""); else el.removeAttribute(name);
  };
  const rewrite = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const selector = rewriteLinkStateSelector(rule.selectorText);
        if (selector !== rule.selectorText) {
          modified.push({ rule, selector: rule.selectorText });
          rule.selectorText = selector;
          if (rule.selectorText !== selector) incompleteStyles = true;
        }
      }
      if (rule instanceof CSSImportRule) {
        try { if (rule.styleSheet) rewrite(rule.styleSheet.cssRules); }
        catch { incompleteStyles = true; }
      } else if ("cssRules" in rule) rewrite((rule as CSSGroupingRule).cssRules);
    }
  };
  let checked = 0;
  const started = performance.now();
  try {
    // Preserve ordinary :link styling on links not currently under test.
    for (const root of roots) for (const link of root.querySelectorAll("a[href],area[href]")) {
      set(link, "link", true);
    }
    for (const root of roots) {
      for (const sheet of [...root.styleSheets, ...root.adoptedStyleSheets]) {
        if (sheet.disabled) continue;
        try { rewrite(sheet.cssRules); } catch { incompleteStyles = true; }
      }
      const guard = document.createElement("style");
      guard.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
      (root instanceof Document ? root.head : root).append(guard);
      guards.push(guard);
      if (!guard.sheet) incompleteStyles = true;
    }
    for (const [link, texts] of targets) {
      const evidence = texts.map(() => ({ visible: false, failures: [] as string[], reviews: new Set<string>() }));
      const related = [link, ...ancestors(link)];
      const timedOut = performance.now() - started > 5000;
      for (let bits = 0; bits < (timedOut ? 1 : 8); bits++) {
        const visited = !!(bits & 4), hovered = !!(bits & 2), focused = !!(bits & 1);
        const name = `${visited ? "visited" : "unvisited"}, ${hovered ? "hovered" : "not hovered"}, ${focused ? "focused" : "not focused"}`;
        set(link, "visited", visited); set(link, "link", !visited);
        set(link, "focus", focused); set(link, "focus-visible", focused);
        for (const el of related) { set(el, "hover", hovered); set(el, "focus-within", focused); }
        texts.forEach(({ text, parent }, i) => {
          const m = measure(text, parent), record = evidence[i];
          record.visible ||= m.visible;
          if (!m.visible) return;
          if (m.ratio !== undefined && m.minimum !== undefined && m.ratio < m.minimum) {
            record.failures.push(`${m.ratio.toFixed(2)}:1 (minimum ${m.minimum}:1) in ${name}`);
          } else if (m.reason) record.reviews.add(m.reason);
        });
      }
      // Clear these states before measuring the next link.
      for (const el of related) for (const state of STATES) set(el, state, state === "link" && el.hasAttribute("href"));
      texts.forEach(({ text, parent }, i) => {
        const e = evidence[i];
        if (!e.visible && !timedOut) return;
        checked++;
        if (incompleteStyles) e.reviews.add("some stylesheet rules could not be inspected");
        if (timedOut) e.reviews.add("state-check time budget reached; not all eight states were evaluated");
        if (!e.failures.length && !e.reviews.size) return;
        // Inaccessible CSS may override the simulated pseudo-state colours.
        // Its uninspected cascade must never produce a confirmed failure.
        const confirmed = e.failures.length > 0 && !incompleteStyles;
        results.push({
          ruleId: "ACT-R88", type: confirmed ? "Issue" : "Potential Issue", impact: "serious",
          description: `Link text ${JSON.stringify(text.textContent?.trim())}: ${confirmed
            ? `contrast ${e.failures.join("; ")}`
            : `minimum contrast needs review: ${[...e.reviews].join("; ")}`}.` +
            (confirmed && e.reviews.size ? ` Additional coverage requires review: ${[...e.reviews].join("; ")}.` : ""),
          ...originalEvidence.get(text)!,
        });
      });
    }
  } finally {
    for (const { rule, selector } of modified.reverse()) rule.selectorText = selector;
    for (const [el, saved] of savedAttributes) for (const [name, value] of saved) {
      if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
    }
    for (const guard of guards) guard.remove();
  }
  pushStat("ACT-R88", checked, "element");
}
