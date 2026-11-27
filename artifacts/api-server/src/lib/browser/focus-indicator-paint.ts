/** Computed-style evidence is not a pixel/contrast certification. Keep
 * color-only changes separate from changes that introduce indicator geometry. */
import { composedAncestors } from "./alfa-helpers";

export interface FocusPaint { structure: string; colors: string }

const transparent = (color: string) => color === "transparent" ||
  /rgba\([^)]*,\s*0(?:\.0*)?\s*\)/.test(color);
const withoutColors = (value: string) => value.replace(/rgba?\([^)]*\)|#[\da-f]{3,8}\b/gi, "<color>");

function hasDecoratableText(element: Element): boolean {
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) return true;
    if (!(child instanceof Element)) continue;
    const style = getComputedStyle(child);
    if (style.display !== "inline" || style.visibility !== "visible" ||
      Number(style.opacity) === 0) continue;
    if (hasDecoratableText(child)) return true;
  }
  return false;
}

export function snapshotFocusPaint(element: Element, pseudo?: string): FocusPaint {
  const style = getComputedStyle(element, pseudo);
  if (pseudo && ["none", "normal"].includes(style.content)) return { structure: "", colors: "" };
  const text = pseudo ? !['""', "''"].includes(style.content) : hasDecoratableText(element);
  const borders = ["top", "right", "bottom", "left"].map(side => {
    const width = style.getPropertyValue(`border-${side}-width`);
    const kind = style.getPropertyValue(`border-${side}-style`);
    const color = style.getPropertyValue(`border-${side}-color`);
    return parseFloat(width) > 0 && !["none", "hidden"].includes(kind) && !transparent(color)
      ? [width, kind, color] : ["", "", ""];
  });
  const outline = parseFloat(style.outlineWidth) > 0 && !["none", "hidden"].includes(style.outlineStyle) &&
    !transparent(style.outlineColor) ? [style.outlineWidth, style.outlineStyle, style.outlineColor] : ["", "", ""];
  const decoration = text && style.textDecorationLine !== "none" && !transparent(style.textDecorationColor)
    ? [style.textDecorationLine, style.textDecorationStyle, style.textDecorationThickness] : [];
  const background = transparent(style.backgroundColor) ? "" : style.backgroundColor;
  const svg = element instanceof SVGElement;
  return {
    structure: JSON.stringify([
      pseudo ? style.content : "", borders.map(border => border.slice(0, 2)),
      outline.slice(0, 2), !!background, withoutColors(style.backgroundImage),
      withoutColors(style.boxShadow), decoration,
    ]),
    colors: JSON.stringify([
      text ? style.color : "", background, style.backgroundImage, style.boxShadow,
      borders.map(border => border[2]), outline[2],
      decoration.length ? style.textDecorationColor : "",
      style.opacity, style.transform, style.filter,
      svg ? style.fill : "", svg ? style.stroke : "",
    ]),
  };
}

function rgb(color: string): number[] | null {
  const match = /^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/.exec(color);
  return match ? match.slice(1).map(Number) : null;
}
function luminance(color: number[]) {
  return color.map(value => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}

/** WCAG 2.4.7 explicitly permits an insertion caret as a text-field indicator.
 * Accept only editable native fields with an opaque, contrasting caret on a
 * known solid background. Never write input values or alter their selection. */
export function hasNativeCaretIndicator(element: Element): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) ||
    element.disabled || element.readOnly || element.selectionStart === null) return false;
  const fieldStyle = getComputedStyle(element);
  if (!(parseFloat(fieldStyle.fontSize) > 0) || parseFloat(fieldStyle.lineHeight) === 0 ||
    parseFloat(fieldStyle.textIndent) !== 0) return false;
  const caret = rgb(fieldStyle.caretColor);
  if (!caret) return false;
  let background: number[] | null = null;
  for (const ancestor of [element, ...composedAncestors(element)]) {
    const style = getComputedStyle(ancestor);
    if (Number(style.opacity) !== 1 || style.filter !== "none" ||
      style.mixBlendMode !== "normal" || style.clipPath !== "none" ||
      style.maskImage !== "none") return false;
    if (!background) {
      if (style.backgroundImage !== "none") return false;
      background = rgb(style.backgroundColor);
      if (!background && !transparent(style.backgroundColor)) return false;
    }
  }
  if (!background) return false;
  const a = luminance(caret), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5;
}
