// ─── HELPER: Contrast / Luminance ────────────────────────────────────────────
export function getLuminanceFromColorString(colorStr: string): number | null {
  if (!colorStr || colorStr === "transparent" || colorStr === "rgba(0, 0, 0, 0)") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = colorStr;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return null;
    const toLinear = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  } catch { return null; }
}

export function alphaComposite(fg: string, bg: string): string {
  const parseFg = fg.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d+(?:\.\d+)?))?\)/);
  const parseBg = bg.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d+(?:\.\d+)?))?\)/);
  if (!parseFg || !parseBg) return bg;
  const fa = parseFloat(parseFg[4] ?? "1");
  const br = parseInt(parseBg[1]), bg2 = parseInt(parseBg[2]), bb = parseInt(parseBg[3]);
  const fr = parseInt(parseFg[1]), fg2 = parseInt(parseFg[2]), fb = parseInt(parseFg[3]);
  const r = Math.round(fr * fa + br * (1 - fa));
  const g = Math.round(fg2 * fa + bg2 * (1 - fa));
  const b = Math.round(fb * fa + bb * (1 - fa));
  return `rgb(${r},${g},${b})`;
}

export function getEffectiveBackground(el: HTMLElement): string {
  let composited = "rgb(255,255,255)";
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  while (node) { chain.push(node); node = node.parentElement; }
  chain.reverse();
  for (const n of chain) {
    const cs = window.getComputedStyle(n);
    const bg = cs.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      composited = alphaComposite(bg, composited);
    }
  }
  return composited;
}

/**
 * Try to resolve a CSS gradient's representative (midpoint) colour by rendering
 * it onto an offscreen canvas and sampling the centre pixel.
 *
 * Handles linear-gradient, radial-gradient, and conic-gradient with solid
 * colour stops (rgb/rgba/hex/named colours).  Returns null when the gradient
 * cannot be parsed or the Canvas API is unavailable.
 */
export function sampleGradientColor(gradientString: string, width: number, height: number): string | null {
  try {
    const w = Math.max(2, Math.min(100, Math.round(width)));
    const h = Math.max(2, Math.min(100, Math.round(height)));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Strip the outer gradient function wrapper.
    const inner = gradientString
      .replace(/^(?:linear|radial|conic)-gradient\s*\(\s*/i, "")
      .replace(/\s*\)\s*$/, "");

    // Split on top-level commas (not inside parentheses).
    const parts: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of inner) {
      if (ch === "(") { depth++; cur += ch; }
      else if (ch === ")") { depth--; cur += ch; }
      else if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    if (cur.trim()) parts.push(cur.trim());

    // Skip direction / angle tokens (appear before colour stops).
    const stops: string[] = [];
    for (const p of parts) {
      if (/^(?:to\s+|[\d.]+(?:deg|grad|rad|turn)|at\s+)/i.test(p)) continue;
      // Strip optional trailing percentage/length position from each stop.
      const color = p.replace(/\s+[\d.]+(?:%|px|em|rem|ch|vw|vh|fr)\s*$/, "").trim();
      if (color) stops.push(color);
    }
    if (stops.length < 2) return null;

    // Render a horizontal linear gradient and sample the centre pixel.
    // The direction is irrelevant for colour accuracy — we want the midpoint hue.
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    let validStops = 0;
    stops.forEach((color, i) => {
      try {
        grad.addColorStop(i / (stops.length - 1), color);
        validStops++;
      } catch { /* skip malformed colour string */ }
    });
    if (validStops < 2) return null;

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const [r, g, b, a] = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data;
    if (a === 0) return null;
    return `rgb(${r},${g},${b})`;
  } catch { return null; }
}

/**
 * Resolve the effective background colour of an element by walking the ancestor
 * chain and compositing background colours.
 *
 * Gradient backgrounds (linear/radial/conic) are resolved to their midpoint
 * colour via Canvas sampling so they no longer cause blanket "indeterminate"
 * classifications.  Only true background images (url(...)) remain indeterminate.
 */
export function getBackgroundResolution(el: HTMLElement): { kind: "solid" | "indeterminate"; color: string } {
  let composited = "rgb(255,255,255)";
  let hasIndeterminateLayer = false;
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  while (node) { chain.push(node); node = node.parentElement; }
  chain.reverse();

  for (const n of chain) {
    const cs = window.getComputedStyle(n);
    const bg = cs.backgroundColor;
    const bgImg = cs.backgroundImage;

    if (bgImg && bgImg !== "none") {
      if (/^(?:linear|radial|conic)-gradient/i.test(bgImg)) {
        // Gradient: attempt canvas sampling of the midpoint colour.
        const rect = n.getBoundingClientRect();
        const resolved = sampleGradientColor(bgImg, rect.width || 100, rect.height || 100);
        if (resolved) {
          composited = alphaComposite(resolved, composited);
          // Gradient resolved → treated as a covered background layer.
          hasIndeterminateLayer = false;
        } else {
          // Gradient uses CSS variables or an unsupported syntax.
          hasIndeterminateLayer = true;
        }
      } else {
        // background-image: url(…) — an arbitrary image; truly indeterminate.
        hasIndeterminateLayer = true;
      }
    }

    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      composited = alphaComposite(bg, composited);
      // An opaque solid colour with no concurrent image layer conclusively
      // covers everything behind it.
      const alphaMatch = bg.match(/rgba?\([^)]*,\s*([0-9.]+)\s*\)$/i);
      const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
      if (alpha >= 1 && (!bgImg || bgImg === "none")) hasIndeterminateLayer = false;
    }
  }

  return hasIndeterminateLayer
    ? { kind: "indeterminate", color: composited }
    : { kind: "solid", color: composited };
}

export function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function resolveLineHeight(style: CSSStyleDeclaration, fontSize: number): number | null {
  const lh = style.lineHeight;
  if (!lh || lh === "normal") return fontSize * 1.2;
  if (lh.endsWith("px")) return parseFloat(lh);
  if (lh.endsWith("%")) return (fontSize * parseFloat(lh)) / 100;
  const num = parseFloat(lh);
  if (!isNaN(num)) return fontSize * num;
  return null;
}

export function isImportantBlocked(el: HTMLElement, prop: string, testValue: string): boolean {
  const savedVal = el.style.getPropertyValue(prop);
  const savedPri = el.style.getPropertyPriority(prop);
  el.style.setProperty(prop, testValue);
  const testComputed = parseFloat(window.getComputedStyle(el).getPropertyValue(prop));
  el.style.removeProperty(prop);
  if (savedVal) el.style.setProperty(prop, savedVal, savedPri);
  const origComputed = parseFloat(window.getComputedStyle(el).getPropertyValue(prop));
  return Math.abs(testComputed - origComputed) < 50;
}
