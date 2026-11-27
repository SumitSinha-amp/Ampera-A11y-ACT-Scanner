import { getEffectiveAriaRole } from "../aria-data";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";

const HTML = "http://www.w3.org/1999/xhtml";
const WIDGETS = new Set(["button", "checkbox", "combobox", "grid", "gridcell", "link",
  "listbox", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "option",
  "progressbar", "radio", "radiogroup", "scrollbar", "searchbox", "separator", "slider",
  "spinbutton", "switch", "tab", "tablist", "textbox", "tree", "treegrid", "treeitem",
  "group", "row", "rowheader", "columnheader", "toolbar"]);
type Color = [number, number, number, number];
type Target = { text?: Text; value: string; parent: Element; chain: Element[]; placeholder?: boolean; paintRect?: DOMRect };

function parent(node: Node): Element | null {
  return (node as Element).assignedSlot || node.parentElement ||
    (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host : null);
}

function chainOf(node: Node): Element[] {
  const chain: Element[] = [];
  for (let el = parent(node); el; el = parent(el)) chain.push(el);
  return chain;
}

/** CSS commas inside color functions are not layer/stop separators. */
function split(value: string): string[] {
  const parts: string[] = [];
  let start = 0, depth = 0, quote = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\") { i++; continue; }
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && !depth) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function composite(fg: Color, bg: Color, opacity = 1): Color {
  const alpha = fg[3] * opacity, outAlpha = alpha + bg[3] * (1 - alpha);
  if (!outAlpha) return [0, 0, 0, 0];
  return [(fg[0] * alpha + bg[0] * bg[3] * (1 - alpha)) / outAlpha,
    (fg[1] * alpha + bg[1] * bg[3] * (1 - alpha)) / outAlpha,
    (fg[2] * alpha + bg[2] * bg[3] * (1 - alpha)) / outAlpha, outAlpha];
}

function luminance(c: Color): number {
  const linear = c.slice(0, 3).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function ratio(a: Color, b: Color): number {
  const x = luminance(a), y = luminance(b);
  // Alfa rounds its pairings to two decimals before applying the threshold.
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
}

/**
 * R69 deliberately overlaps R88. Targets are visible HTML text nodes, including
 * single characters and flat-tree shadow/slot content. Unknown color evidence
 * is always a review, never a failure inferred from an average screenshot.
 */
export function runTextMinimumContrastRule(
  results: ScanRawResult[],
  pushStat: PushStatFn,
  ruleId: "ACT-R69" | "ACT-R103" = "ACT-R69",
  spatialContrast = false,
): void {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const colorCache = new Map<string, Color | null>();
  const color = (value: string): Color | null => {
    if (colorCache.has(value)) return colorCache.get(value)!;
    if (!ctx || !CSS.supports("color", value)) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const bytes = ctx.getImageData(0, 0, 1, 1).data;
    const result: Color = [bytes[0] / 255, bytes[1] / 255, bytes[2] / 255, bytes[3] / 255];
    colorCache.set(value, result);
    return result;
  };
  const styles = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let s = styles.get(el);
    if (!s) { s = getComputedStyle(el); styles.set(el, s); }
    return s;
  };
  const disabled = (el: Element) => {
    const role = getEffectiveAriaRole(el);
    const semantic = WIDGETS.has(role) || el.matches("button,input,select,textarea,fieldset,optgroup,option");
    const state = el.matches(":disabled") || [el, ...chainOf(el)].some(n => n.getAttribute("aria-disabled")?.toLowerCase() === "true");
    return semantic && state || el.matches("a:not([href]),area:not([href])") && el.getAttribute("aria-disabled") === "true";
  };
  const targets: Target[] = [], elements: Element[] = [];
  const seen = new Set<Node>();
  const visit = (node: Node) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (node instanceof Text) {
      const value = node.data.trim();
      if (!value || /^[\p{P}\p{S}\p{Cf}\s]+$/u.test(value)) return;
      const chain = chainOf(node), el = chain[0];
      if (el?.namespaceURI === HTML && !chain.some(n => n.namespaceURI !== HTML)) targets.push({ text: node, value, parent: el, chain });
      return;
    }
    if (node instanceof Element) {
      elements.push(node);
      if (ruleId === "ACT-R103" && node instanceof HTMLInputElement &&
        /^(button|submit|reset)$/.test(node.type) && node.value.trim()) {
        targets.push({ value: node.value.trim(), parent: node, chain: [node, ...chainOf(node)] });
      }
      // Product extension to upstream's DOM-text targets: placeholder glyphs
      // are rendered by the UA, not represented by child Text nodes.
      if ((node instanceof HTMLInputElement &&
        ["text", "search", "email", "tel", "url", "password", "number"].includes(node.type) ||
        node instanceof HTMLTextAreaElement) &&
        node.matches(":placeholder-shown") && !node.value &&
        node.getAttribute("placeholder")?.trim()) {
        targets.push({ value: node.getAttribute("placeholder")!.trim(), parent: node,
          chain: [node, ...chainOf(node)], placeholder: true });
      }
      if (node.shadowRoot) { visit(node.shadowRoot); return; }
      if (node instanceof HTMLSlotElement) {
        const assigned = node.assignedNodes({ flatten: true });
        for (const child of assigned.length ? assigned : node.childNodes) visit(child);
        return;
      }
    }
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  visit(document.documentElement);

  // Include external labels and aria-labelledby source nodes, not only text
  // physically inside a disabled widget. References are scoped to their root.
  const disabledNameSources = new Set<Element>();
  for (const el of elements.filter(disabled)) {
    const refs = el.getAttribute("aria-labelledby")?.trim().split(/\s+/).filter(Boolean) || [];
    for (const id of refs) {
      const source = (el.getRootNode() as Document | ShadowRoot).getElementById(id);
      if (source) disabledNameSources.add(source);
    }
    if (!refs.length && !el.getAttribute("aria-label")) {
      for (const label of Array.from((el as HTMLInputElement).labels || [])) disabledNameSources.add(label);
    }
  }

  const backgrounds = new Map<Element, { colors?: Color[]; reason?: string }>();
  // Return local paint with its alpha intact. Group opacity is applied after
  // compositing that group's entire content, not once per background layer.
  const getLocalBackground = (el: Element, rect?: DOMRect): { colors?: Color[]; reason?: string } => {
    if (rect && !el.matches("html,body")) {
      const box = el.getBoundingClientRect(), s = style(el);
      const paints = s.backgroundImage !== "none" || (color(s.backgroundColor)?.[3] || 0) > 0;
      if (paints && (rect.right <= box.left || rect.left >= box.right ||
        rect.bottom <= box.top || rect.top >= box.bottom)) {
        // Overflowing children do not inherit an ancestor's background paint.
        // Body/root backgrounds are special: they may propagate to the canvas.
        return { colors: [[0, 0, 0, 0]] };
      }
      if (paints && (rect.left < box.left || rect.right > box.right ||
        rect.top < box.top || rect.bottom > box.bottom)) {
        return { reason: "text fragment crosses a background paint boundary" };
      }
    }
    const cached = backgrounds.get(el);
    if (cached) return cached;
    const s = style(el);
    const solid = color(s.backgroundColor);
    if (!solid) return { reason: "background color could not be resolved" };
    const layers: Color[][] = [[solid]];
    if (s.backgroundImage !== "none") {
      if (s.backgroundSize !== "auto" && s.backgroundSize !== "auto auto") return { reason: "sized background requires rendered review" };
      // CSS paints the first image on top; compose bottom-to-top.
      for (const image of split(s.backgroundImage).reverse()) {
        if (image === "none") continue;
        if (!/^(repeating-)?(linear|radial|conic)-gradient\(/i.test(image)) return { reason: "background image requires highest-contrast review" };
        const stops: Color[] = [];
        for (const part of split(image.slice(image.indexOf("(") + 1, -1))) {
          // Remove one/two authored stop positions. Computed colors contain
          // their own parenthesized spaces and must remain intact.
          const token = part.replace(/(?:\s+[-+\d.]+(?:%|[a-z]+)?){1,2}\s*$/i, "");
          const c = color(token === "currentcolor" ? s.color : token);
          if (c) stops.push(c);
        }
        if (stops.length < 2) return { reason: "gradient color stops could not be resolved" };
        layers.push(stops);
      }
    }
    let colors: Color[] = [[0, 0, 0, 0]];
    for (const layer of layers) {
      if (colors.length * layer.length > 256) return { reason: "background color combinations require review" };
      colors = colors.flatMap(bg => layer.map(fg => composite(fg, bg)));
    }
    const result = { colors };
    backgrounds.set(el, result);
    return result;
  };

  // Zoom verification is spatial and conservative: evaluate visible words
  // independently, not a screenshot average or a page-wide image color.
  // A failing readable fragment proves loss even if another fragment passes.
  const evaluatedTargets: Target[] = [];
  if (spatialContrast) {
    const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    outer: for (const target of targets) {
      const elBox = target.parent.getBoundingClientRect();
      if (elBox.bottom <= 0 || elBox.top >= innerHeight || elBox.right <= 0 || elBox.left >= innerWidth) continue;
      if (!target.text) { evaluatedTargets.push(target); continue; }
      const range = document.createRange();
      for (const word of target.text.data.matchAll(/\S+/gu)) {
        range.setStart(target.text, word.index!);
        range.setEnd(target.text, word.index! + word[0].length);
        let fragments = Array.from(range.getClientRects());
        const crossesPaint = fragments.some(rect => target.chain.some(node => {
          if (node.matches("html,body")) return false;
          const s = style(node), box = node.getBoundingClientRect();
          if (s.backgroundImage === "none" && !(color(s.backgroundColor)?.[3] || 0)) return false;
          return rect.right > box.left && rect.left < box.right && rect.bottom > box.top && rect.top < box.bottom &&
            (rect.left < box.left || rect.right > box.right || rect.top < box.top || rect.bottom > box.bottom);
        }));
        if (crossesPaint) {
          // A word can straddle the image edge (e.g. the first affected label).
          // Resolve whole graphemes, never infer their paint from word averages.
          fragments = [];
          for (const part of graphemes.segment(word[0])) {
            range.setStart(target.text, word.index! + part.index);
            range.setEnd(target.text, word.index! + part.index + part.segment.length);
            fragments.push(...Array.from(range.getClientRects()));
          }
        }
        for (const rect of fragments) {
          if (rect.width <= 0 || rect.height <= 0 || rect.left < 0 ||
            rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) continue;
          evaluatedTargets.push({ ...target, paintRect: rect });
          if (evaluatedTargets.length >= 6000) break outer;
        }
      }
    }
  }
  let checked = 0;
  const spatialChecked = new Set<Element>();
  const spatialFindings = new Map<string, ScanRawResult>();
  for (const target of spatialContrast ? evaluatedTargets : targets) {
    const { text, value, parent: el, chain, placeholder } = target;
    if (ruleId === "ACT-R103" && !chain.some(node =>
      WIDGETS.has(getEffectiveAriaRole(node)) ||
      // Direct authored handlers cover non-semantic scripted controls.
      // Ignore document-wide delegation: it does not make all text a widget.
      !node.matches("body,html") && style(node).cursor === "pointer" &&
        typeof (node as HTMLElement).onclick === "function")) continue;
    const ss = chain.map(style), s = placeholder ? getComputedStyle(el, "::placeholder") : ss[0];
    if (chain.some(n => disabled(n) || disabledNameSources.has(n))) continue;
    if (s.visibility !== "visible" || Number(s.opacity) === 0 || ss.some(n => n.display === "none" || n.contentVisibility === "hidden" || Number(n.opacity) === 0)) continue;
    if (ss.some(n => /inset\(\s*(50|100)%/.test(n.clipPath) || /rect\(\s*0(?:px)?[, ]+\s*0/.test(n.clip))) continue;
    const range = document.createRange();
    if (text) range.selectNodeContents(text);
    const rects = (target.paintRect ? [target.paintRect] : !text ? Array.from(el.getClientRects()) : Array.from(range.getClientRects()))
      .filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    // Visibility includes content that can be brought into view by scrolling
    // an inner container. Its coordinates can exceed the document's own size.
    // Project a possible scroll position without changing the tested page.
    const extent = document.scrollingElement || document.documentElement;
    const canBringIntoView = rects.some(rect => {
      let left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom;
      for (let i = 0; i < chain.length; i++) {
        const ancestor = chain[i], a = ss[i], box = ancestor.getBoundingClientRect();
        if (ancestor === extent || a.display === "contents") continue;
        if (/(auto|scroll)/.test(a.overflowY) && ancestor.scrollHeight > ancestor.clientHeight) {
          const shift = Math.max(-ancestor.scrollTop, Math.min(ancestor.scrollHeight - ancestor.clientHeight - ancestor.scrollTop, top - box.top));
          top -= shift; bottom -= shift;
        }
        if (/(auto|scroll)/.test(a.overflowX) && ancestor.scrollWidth > ancestor.clientWidth) {
          const shift = Math.max(-ancestor.scrollLeft, Math.min(ancestor.scrollWidth - ancestor.clientWidth - ancestor.scrollLeft, left - box.left));
          left -= shift; right -= shift;
        }
        if (/(hidden|clip|auto|scroll)/.test(a.overflowX) && (right <= box.left || left >= box.right) ||
          /(hidden|clip|auto|scroll)/.test(a.overflowY) && (bottom <= box.top || top >= box.bottom)) return false;
      }
      return right + scrollX > 0 && bottom + scrollY > 0 &&
        left + scrollX < Math.max(extent.scrollWidth, innerWidth) &&
        top + scrollY < Math.max(extent.scrollHeight, innerHeight);
    });
    if (!canBringIntoView) continue;

    let reason: string | undefined;
    if (ss.some(n => n.mixBlendMode !== "normal" || n.filter !== "none" || n.backdropFilter !== "none")) reason = "blending or filtering requires rendered review";
    if (placeholder && (s.mixBlendMode !== "normal" || s.filter !== "none" || s.backdropFilter !== "none" ||
      s.backgroundImage !== "none" || (color(s.backgroundColor)?.[3] || 0) > 0)) {
      reason = "placeholder pseudo-element paint requires rendered review";
    }
    if (s.textShadow !== "none" || s.webkitTextStrokeWidth && parseFloat(s.webkitTextStrokeWidth) > 0) reason = "text shadow or stroke requires rendered review";
    if (s.backgroundClip === "text" || s.webkitBackgroundClip === "text") reason = "background-clipped text requires rendered review";
    // A positioned sibling or pseudo-element is not represented by ancestry.
    for (const node of chain) {
      for (const pseudo of ["::before", "::after"]) {
        const p = getComputedStyle(node, pseudo);
        if (p.content !== "none" && p.content !== "normal" &&
          (p.backgroundImage !== "none" || (color(p.backgroundColor)?.[3] || 0) > 0)) reason = "painted pseudo-element requires rendered review";
      }
      if ((color(style(node).backgroundColor)?.[3] || 0) === 1) break;
    }
    const root = el.getRootNode() as Document | ShadowRoot;
    for (const r of rects) {
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const stack = root.elementsFromPoint?.(x, y) || document.elementsFromPoint(x, y);
      for (const painted of stack) {
        if (chain.includes(painted)) {
          if ((color(style(painted).backgroundColor)?.[3] || 0) === 1) break;
          continue;
        }
        if (el.contains(painted)) continue;
        if (style(painted).backgroundImage !== "none" || (color(style(painted).backgroundColor)?.[3] || 0) > 0 || painted.matches("img,svg,video,canvas")) {
          reason = "overlapping non-ancestor content requires rendered review";
          break;
        }
      }
    }
    const parsedForeground = color(s.webkitTextFillColor || s.color);
    const fg: Color | null = parsedForeground && [parsedForeground[0], parsedForeground[1],
      parsedForeground[2], parsedForeground[3] * (placeholder ? Number(s.opacity) : 1)];
    if (!fg) reason ||= "foreground color could not be resolved";
    const size = parseFloat(s.fontSize), weight = parseFloat(s.fontWeight);
    const minimum = size >= 24 || size >= 56 / 3 && weight >= 700 ? 3 : 4.5;
    let highest: number | undefined;
    if (!reason && fg) {
      let pairs: { fg: Color; bg: Color }[] = [{ fg, bg: [0, 0, 0, 0] }];
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i], a = ss[i], local = getLocalBackground(node, target.paintRect);
        if (!local.colors) { reason = local.reason; break; }
        if (pairs.length * local.colors.length > 256) { reason = "foreground/background combinations require review"; break; }
        pairs = pairs.flatMap(pair => local.colors!.map(backdrop => {
          const f = composite(pair.fg, backdrop), b = composite(pair.bg, backdrop);
          f[3] *= Number(a.opacity); b[3] *= Number(a.opacity);
          return { fg: f, bg: b };
        }));
        if (pairs.every(p => p.bg[3] === 1) && ss.slice(i + 1).every(n => Number(n.opacity) === 1)) break;
        if (/absolute|fixed/.test(a.position) && pairs.some(p => p.bg[3] < 1)) {
          reason = "positioned transparent text has an unverified backdrop"; break;
        }
      }
      if (!reason) {
        const white: Color = [1, 1, 1, 1];
        // Keep each alpha-composited foreground paired with its own backdrop;
        // cross-pairing invents colors that never occur (W3C failed example 7).
        const ratios = pairs.map(p => ratio(composite(p.fg, white), composite(p.bg, white)));
        highest = Math.max(...ratios);
        if (highest === 1) continue;
        // Alfa's node-wide maximum is not proof of W3C's per-character
        // expectation. Without spatially localizing a variable background to
        // each glyph, mixed pass/fail colors remain explicitly incomplete.
        if (highest >= minimum && ratios.some(value => value < minimum)) {
          reason = "variable background has both passing and failing color pairings; review highest contrast for each visible character";
        }
      }
    }
    checked++;
    if (spatialContrast) spatialChecked.add(el);
    if (!reason && highest !== undefined && highest >= minimum) continue;
    const finding: ScanRawResult = {
      ruleId, type: reason ? "Potential Issue" : "Issue", impact: "serious",
      description: `${placeholder ? "Placeholder" : "Text"} ${JSON.stringify(value)}: ${reason
        ? `minimum contrast needs review: ${reason}`
        : `${spatialContrast ? "visible text fragment" : "highest possible text"} contrast ${highest!.toFixed(2)}:1 is below AA minimum (${minimum}:1)`}.`,
      selector: getSelector(el), element: outerHtmlSnippet(el), elementContext: elementContextForAI(el),
    };
    if (!spatialContrast) results.push(finding);
    else {
      const prior = spatialFindings.get(finding.selector!);
      if (!prior || prior.type !== "Issue" && finding.type === "Issue") spatialFindings.set(finding.selector!, finding);
    }
  }
  results.push(...spatialFindings.values());
  pushStat(ruleId, spatialContrast ? spatialChecked.size : checked, "element");
}
