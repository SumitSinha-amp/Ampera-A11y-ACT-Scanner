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
    // A background image makes the final color unknowable until an opaque
    // descendant background covers it. Keep walking instead of returning
    // immediately so a text wrapper with a solid background can restore a
    // determinable contrast result.
    if (cs.backgroundImage && cs.backgroundImage !== "none") {
      hasIndeterminateLayer = true;
    }
    const hasImageLayer = cs.backgroundImage && cs.backgroundImage !== "none";
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
      composited = alphaComposite(bg, composited);
      // Computed background colors are normally rgb()/rgba(). Treat an
      // opaque color as covering all visual layers behind this element, but
      // not an image painted on the same element (background images paint
      // above the background color).
      const alphaMatch = bg.match(/rgba?\([^)]*,\s*([0-9.]+)\s*\)$/i);
      const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
      if (alpha >= 1 && !hasImageLayer) hasIndeterminateLayer = false;
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

