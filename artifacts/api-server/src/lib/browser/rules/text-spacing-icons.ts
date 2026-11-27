import { composedAncestors } from "../alfa-helpers";
import { isVisible } from "../visibility";

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };
export type SpacingIcon = { element: Element; before: Box[] };

export function spacingIconBoxes(element: Element): Box[] {
  return Array.from(element.getClientRects()).filter(box => box.width > 0 && box.height > 0).map(box => ({
    left: box.left, right: box.right, top: box.top, bottom: box.bottom,
    width: box.width, height: box.height,
  }));
}

/** Exclude wallpaper/container backgrounds and duplicate SVG descendants. */
export function collectSpacingIcons(elements: HTMLElement[]): SpacingIcon[] {
  const candidates = new Set<Element>();
  for (const element of elements) {
    if (element.matches("img,svg")) candidates.add(element);
    for (const svg of element.querySelectorAll(":scope > svg")) candidates.add(svg);
    if (element.textContent?.trim() || element.children.length) continue;
    const style = getComputedStyle(element);
    const generated = ["::before", "::after"].some(pseudo => {
      const content = getComputedStyle(element, pseudo).content;
      return content && !["none", "normal", '""', "''"].includes(content);
    });
    if (style.backgroundImage !== "none" || generated) candidates.add(element);
  }
  return [...candidates].filter(element => {
    if (!isVisible(element)) return false;
    const box = element.getBoundingClientRect();
    if (box.width < 3 || box.height < 3 || box.width > 128 || box.height > 128) return false;
    // Dormant slide graphics must not become failures in the active page.
    return !composedAncestors(element).some(ancestor => {
      if (!ancestor.matches("[aria-roledescription='carousel'],.carousel,.slick-list,.swiper,.swiper-container")) return false;
      const viewport = ancestor.getBoundingClientRect();
      return box.right <= viewport.left || box.left >= viewport.right ||
        box.bottom <= viewport.top || box.top >= viewport.bottom;
    });
  }).slice(0, 300).map(element => ({ element, before: spacingIconBoxes(element) }));
}

function overlapArea(first: Box[], second: Box[]): number {
  let area = 0;
  for (const a of first) for (const b of second) {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width > 2 && height > 2) area += width * height;
  }
  return area;
}

/** Require material new overlap, not shared movement or rounding. */
export function hasWorsenedSpacingOverlap(beforeA: Box[], beforeB: Box[], afterA: Box[], afterB: Box[]): boolean {
  const smallestArea = Math.min(...afterA.map(box => box.width * box.height), ...afterB.map(box => box.width * box.height));
  if (!Number.isFinite(smallestArea)) return false;
  const before = overlapArea(beforeA, beforeB);
  const after = overlapArea(afterA, afterB);
  return after > Math.max(4, smallestArea * 0.08) &&
    after - before > Math.max(4, smallestArea * 0.08);
}
