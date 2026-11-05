import { isAlfaRendered } from "../alfa-helpers";
import { isVisible } from "../visibility";

// Product readability heuristic, not an Alfa or WCAG-defined threshold.
// Short titles, labels and emphasis must not be reported as large passages.
export const MIN_ITALIC_PASSAGE_WORDS = 20;

export function isLongFullyItalicParagraph(element: HTMLElement): boolean {
  if (!isVisible(element) || !isAlfaRendered(element) ||
    window.getComputedStyle(element).fontStyle !== "italic") return false;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const text: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() ||
      parent.closest("script,style,template,noscript") ||
      !isVisible(parent) || !isAlfaRendered(parent)) continue;
    if (window.getComputedStyle(parent).fontStyle !== "italic") return false;
    text.push(node.textContent);
  }
  // Word segmentation handles non-space-delimited scripts as well as English.
  const words = new Intl.Segmenter(undefined, { granularity: "word" }).segment(text.join(" "));
  let count = 0;
  for (const word of words) {
    if (word.isWordLike && ++count >= MIN_ITALIC_PASSAGE_WORDS) return true;
  }
  return false;
}
