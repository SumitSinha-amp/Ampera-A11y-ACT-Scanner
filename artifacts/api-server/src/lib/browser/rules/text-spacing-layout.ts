import type { PushStatFn, ScanRawResult } from "../types";
import { composedAncestors } from "../alfa-helpers";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isVisible } from "../visibility";

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type Geometry = { boxes: Box[]; hidden: boolean; clips: Map<Element, number> };
type Target = { node: Text; element: HTMLElement; before: Geometry };
const TOLERANCE = 2;
const MAX_TARGETS = 1200;
const rect = (r: DOMRect): Box => ({
  left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
});

function textBoxes(node: Text): Box[] {
  const range = document.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0).slice(0, 80).map(rect);
}

function geometry(node: Text, element: HTMLElement): Geometry {
  const boxes = textBoxes(node);
  let hidden = boxes.length === 0;
  const clips = new Map<Element, number>();
  for (const ancestor of [element, ...composedAncestors(element)]) {
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" ||
      Number(style.opacity) === 0 || style.contentVisibility === "hidden") hidden = true;
    const clipX = /^(hidden|clip)$/.test(style.overflowX);
    const clipY = /^(hidden|clip)$/.test(style.overflowY);
    if ((!clipX && !clipY) || !(ancestor instanceof HTMLElement)) continue;
    // Carousel viewport clipping is navigation, not necessarily lost content.
    // Individual fixed-height cards within it are still checked.
    if (ancestor.matches("[aria-roledescription='carousel'],.carousel,.slick-list,.swiper,.swiper-container")) continue;
    const bounds = ancestor.getBoundingClientRect();
    const left = bounds.left + ancestor.clientLeft;
    const top = bounds.top + ancestor.clientTop;
    const right = left + ancestor.clientWidth;
    const bottom = top + ancestor.clientHeight;
    let total = 0, lost = 0;
    for (const box of boxes) {
      total += box.width * box.height;
      const width = clipX ? Math.max(0, Math.min(box.right, right + TOLERANCE) - Math.max(box.left, left - TOLERANCE)) : box.width;
      const height = clipY ? Math.max(0, Math.min(box.bottom, bottom + TOLERANCE) - Math.max(box.top, top - TOLERANCE)) : box.height;
      lost += box.width * box.height - width * height;
    }
    clips.set(ancestor, total ? lost / total : 0);
  }
  return { boxes, hidden, clips };
}

function overlaps(a: Box[], b: Box[]): boolean {
  return a.some((one) => b.some((two) => {
    const width = Math.min(one.right, two.right) - Math.max(one.left, two.left);
    const height = Math.min(one.bottom, two.bottom) - Math.max(one.top, two.top);
    return width > TOLERANCE && height > TOLERANCE &&
      width * height > Math.min(one.width * one.height, two.width * two.height) * 0.08;
  }));
}

/**
 * Ampera custom rule, NOT a Siteimprove/ACT-published rule. Runs last so the
 * temporary layout cannot affect another detector or its visibility cache.
 * Geometry proves clipping; new text-box overlap needs visual review.
 */
export function runTextSpacingLayoutRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const elements: HTMLElement[] = [];
  const roots: (Document | ShadowRoot)[] = [];
  const visit = (root: Document | ShadowRoot) => {
    roots.push(root);
    for (const element of Array.from(root.querySelectorAll("*"))) {
      if (element instanceof HTMLElement && !element.closest("script,style,template,noscript")) elements.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(document);
  const targets: Target[] = [];
  for (const element of elements) {
    if (targets.length >= MAX_TARGETS) break;
    if (!isVisible(element)) continue;
    for (const node of Array.from(element.childNodes)) {
      if (targets.length >= MAX_TARGETS) break;
      if (node instanceof Text && node.textContent?.trim()) {
        const before = geometry(node, element);
        if (!before.hidden) targets.push({ node, element, before });
      }
    }
  }
  if (!targets.length) return;
  pushStat("ACT-R129", targets.length, "element");

  // Read all computed values before writing, avoiding forced layout per element.
  // Preserve already wider spacing instead of reducing it to the threshold.
  const saved = elements.map((element) => {
    const style = getComputedStyle(element);
    const font = parseFloat(style.fontSize) || 16;
    return {
      element, inline: element.getAttribute("style"),
      left: element.scrollLeft, top: element.scrollTop,
      line: Math.max(parseFloat(style.lineHeight) || 0, font * 1.5),
      letter: Math.max(parseFloat(style.letterSpacing) || 0, font * 0.12),
      word: Math.max(parseFloat(style.wordSpacing) || 0, font * 0.16),
      paragraph: Math.max(parseFloat(style.marginBottom) || 0, font * 2),
    };
  });
  const pageScroll = { x: window.scrollX, y: window.scrollY };
  const temporaryStyles: HTMLStyleElement[] = [];
  const findings = new Map<Element, { kind: string; potential: boolean; related?: Element }>();
  try {
    for (const root of roots) {
      const freeze = document.createElement("style");
      freeze.textContent = "* { transition: none !important; animation-play-state: paused !important; overflow-anchor: none !important; scroll-behavior: auto !important; }";
      (root instanceof Document ? root.head || root.documentElement : root).appendChild(freeze);
      temporaryStyles.push(freeze);
    }
    for (const item of saved) {
      item.element.style.setProperty("line-height", `${item.line}px`, "important");
      item.element.style.setProperty("letter-spacing", `${item.letter}px`, "important");
      item.element.style.setProperty("word-spacing", `${item.word}px`, "important");
      if (item.element.localName === "p") item.element.style.setProperty("margin-bottom", `${item.paragraph}px`, "important");
    }
    const after = targets.map(({ node, element }) => geometry(node, element));
    for (let i = 0; i < targets.length; i++) {
      const { element, before } = targets[i];
      const current = after[i];
      if (current.hidden) {
        findings.set(element, { kind: "Text becomes hidden", potential: false });
        continue;
      }
      for (const [boundary, loss] of current.clips) {
        // Ignore baseline clipping and tiny differences caused by rounding.
        if (loss > 0.05 && loss - (before.clips.get(boundary) || 0) > 0.05) {
          findings.set(boundary, { kind: "Text is newly clipped or truncated by this container", potential: false });
          break; // nearest responsible container, not each ancestor as well
        }
      }
    }
    // Sweep by vertical bounds rather than comparing every text node pair.
    const ordered = after.map((value, index) => ({
      index, top: Math.min(...value.boxes.map((b) => b.top)),
      bottom: Math.max(...value.boxes.map((b) => b.bottom)),
    })).sort((a, b) => a.top - b.top);
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      if (after[a.index].hidden || [...after[a.index].clips.values()].some((loss) => loss > 0.05)) continue;
      for (let j = i + 1; j < ordered.length && ordered[j].top < a.bottom - TOLERANCE; j++) {
        const b = ordered[j];
        const first = targets[a.index], second = targets[b.index];
        if (after[b.index].hidden || [...after[b.index].clips.values()].some((loss) => loss > 0.05) ||
          first.element.contains(second.element) || second.element.contains(first.element)) continue;
        if (overlaps(after[a.index].boxes, after[b.index].boxes) && !overlaps(first.before.boxes, second.before.boxes)) {
          if (!findings.has(first.element)) findings.set(first.element, {
            kind: "Text bounds newly overlap another text element; verify readability",
            potential: true, related: second.element,
          });
        }
      }
    }
  } finally {
    // Restore exact authored attributes (including absent versus empty styles),
    // then restore scroll positions while smooth scrolling is still disabled.
    for (const { element, inline } of saved) {
      // Flush Chromium's lazy CSSOM serialization before removing the
      // attribute, or it can reappear as style="" on the next attribute read.
      element.getAttribute("style");
      if (inline === null) element.removeAttribute("style");
      else element.setAttribute("style", inline);
    }
    for (const { element, left, top } of saved) {
      if (element.scrollLeft !== left) element.scrollLeft = left;
      if (element.scrollTop !== top) element.scrollTop = top;
    }
    window.scrollTo({ left: pageScroll.x, top: pageScroll.y, behavior: "instant" });
    for (const style of temporaryStyles) style.remove();
  }
  // Evidence always comes from the restored, original page.
  for (const [element, finding] of findings) {
    // Prefer a containing confirmed clipping finding over a child overlap.
    if ([...findings].some(([other, detail]) => other !== element && !detail.potential && other.contains(element))) continue;
    results.push({
      ruleId: "ACT-R129",
      type: finding.potential ? "Potential Issue" : "Issue",
      impact: finding.potential ? "moderate" : "serious",
      description: `${finding.kind} after applying line height ≥1.5×, letter spacing ≥0.12em, word spacing ≥0.16em and paragraph spacing ≥2em (WCAG 1.4.12).${finding.related ? ` Other text: ${getSelector(finding.related)}.` : ""} Custom Ampera layout check.`,
      element: outerHtmlSnippet(element), elementContext: elementContextForAI(element), selector: getSelector(element),
    });
  }
}
