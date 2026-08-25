import type { ScanRawResult, PushStatFn } from "../types";
import { getAccessibleName } from "../accname";
import { getAlfaPointerTargets, hasAlfaTargetSize, hasAlfaTargetSpacing } from "../alfa-helpers";
import { getEffectiveAriaRole } from "../aria-data";
import { getBackgroundResolution, getContrastRatio, getLuminanceFromColorString } from "../contrast";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isProgrammaticallyHidden, isRendered, isVisible } from "../visibility";

/** Shape stored in window.__amperaContrastCandidates for the Node.js pixel pass. */
export interface ContrastCandidate {
  selector: string;
  textColor: string;
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
}

export function runLinksContrastRules(results: ScanRawResult[], EMIT_MANUAL_ONLY_RULES: boolean, pushStat: PushStatFn): void {
  // ACT-R69 / ACT-R66: Text contrast (WCAG 1.4.3 AA / 1.4.6 AAA)
  // ════════════════════════════════════════════════════════════════════════
  {
    const isPurePunctuation = (s: string) => /^[\p{P}\p{S}\p{Cf}\s]+$/u.test(s);
    // Alfa alignment: nonDisabledTexts walks ALL text nodes in the DOM tree,
    // not just elements in a fixed tag list. We replicate this with TreeWalker.
    const seenParents = new Set<HTMLElement>();
    const textLeafEls: HTMLElement[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let tNode: Node | null;
    while ((tNode = walker.nextNode()) !== null) {
      const text = tNode.textContent?.trim() || "";
      if (!text || text.length < 2 || isPurePunctuation(text)) continue;
      const parent = tNode.parentElement as HTMLElement | null;
      if (!parent || seenParents.has(parent)) continue;
      // Alfa: nonDisabledTexts excludes text inside disabled groups/widgets
      if (parent.closest("[disabled], fieldset:disabled, [aria-disabled='true']")) continue;
      // Alfa: text inside aria-hidden subtrees is invisible to AT — skip it.
      // This is a key source of false positives vs Siteimprove.
      if (parent.closest("[aria-hidden='true']")) continue;
      seenParents.add(parent);
      textLeafEls.push(parent);
      if (textLeafEls.length >= 3000) break;
    }
    let contrastAAFails = 0;
    let contrastAAAFails = 0;
    // Alfa alignment: contrast only applies to *visually perceivable* text.
    // sr-only / clipped text (1px boxes, clip/clip-path) is not applicable, and
    // text over a background-image/gradient is "can't tell", not a failure.
    const isVisuallyClipped = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return true;
      const cs = window.getComputedStyle(el);
      return (cs.clipPath !== "none" && cs.clipPath !== "") || (cs.clip !== "auto" && cs.clip !== "");
    };

    // Collect indeterminate candidates for the Node.js pixel-sampling pass.
    // Only url()-backed backgrounds remain indeterminate after the gradient
    // resolution improvement in contrast.ts.
    const pixelCandidates: ContrastCandidate[] = [];

    for (const el of textLeafEls) {
      if (!(el instanceof HTMLElement)) continue;
      // Use isRendered (display:none / visibility:hidden) instead of isVisible so
      // that off-screen carousel slides are included.  isVisible also checks whether
      // the element is within its overflow-hidden ancestor's viewport bounds, which
      // correctly excludes off-slide content for most rules but causes false
      // negatives for contrast: Siteimprove/Alfa check contrast for all rendered
      // text regardless of scroll position.  The isVisuallyClipped check below
      // still excludes sr-only (1×1 clip-path) elements.
      if (!isRendered(el)) continue;
      if (isVisuallyClipped(el)) continue;
      const bgResolution = getBackgroundResolution(el);
      if (bgResolution.kind === "indeterminate") {
        // Always collect for the Node.js pixel-sampling pass so url()-backed
        // backgrounds can be resolved and confirmed without EMIT_MANUAL_ONLY_RULES.
        const sel = getSelector(el);
        if (sel) {
          const rect = el.getBoundingClientRect();
          pixelCandidates.push({
            selector: sel,
            textColor: window.getComputedStyle(el).color,
            bboxX: Math.round(rect.left + window.scrollX),
            bboxY: Math.round(rect.top + window.scrollY),
            bboxW: Math.round(rect.width),
            bboxH: Math.round(rect.height),
          });
        }
        // Alfa/Siteimprove treats unresolved visual-state contrast as a
        // question, not an automatic failure. Do not promote url()-backed text
        // to an Issue automatically — let the pixel pass decide.
        if (!EMIT_MANUAL_ONLY_RULES) continue;
        const isLinkText = !!el.closest("a[href]");
        const evidence = {
          type: "Potential Issue" as const,
          impact: "serious" as const,
          description: "Text contrast cannot be determined because the background uses an image — review the contrast at all visual states",
          element: outerHtmlSnippet(el),
          elementContext: elementContextForAI(el),
          selector: getSelector(el),
        };
        results.push({ ruleId: isLinkText ? "ACT-R88" : "ACT-R69", ...evidence });
        results.push({ ruleId: isLinkText ? "ACT-R89" : "ACT-R66", ...evidence });
        continue;
      }
      const style = window.getComputedStyle(el);
      const l1 = getLuminanceFromColorString(style.color);
      const l2 = getLuminanceFromColorString(bgResolution.color);
      if (l1 === null || l2 === null) continue;
      const ratio = getContrastRatio(l1, l2);
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseFloat(style.fontWeight);
      const isLarge = fontSize >= 24 || (fontSize >= 18.67 && fontWeight >= 700);
      const aaMin = isLarge ? 3 : 4.5;
      const aaaMin = isLarge ? 4.5 : 7;
      const isLinkText = !!el.closest("a[href]");
      const minimumRuleId = isLinkText ? "ACT-R88" : "ACT-R69";
      const enhancedRuleId = isLinkText ? "ACT-R89" : "ACT-R66";
      // R69/R88 (minimum) and R66/R89 (enhanced) are independent Alfa
      // rules. A ratio below the minimum also fails the enhanced criterion;
      // using `else if` here silently dropped the enhanced finding.
      if (ratio < aaMin && contrastAAFails < 200) {
        contrastAAFails++;
        results.push({ ruleId: minimumRuleId, type: "Issue", impact: "serious", description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AA minimum (${aaMin}:1)`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      }
      if (ratio < aaaMin && contrastAAAFails < 200) {
        // One outcome per element (deduped by parent via TreeWalker seenParents set)
        contrastAAAFails++;
        results.push({ ruleId: enhancedRuleId, type: "Issue", impact: "minor", description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AAA enhanced minimum (${aaaMin}:1)`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      }
    }

    // Expose candidates for the Node.js pixel-sampling post-processor.
    (window as any).__amperaContrastCandidates = pixelCandidates;

    // Border/outline (non-text 1.4.11) contrast check removed — Alfa treats
    // UI-component contrast as "can't tell" (border colors alone don't prove a
    // visible boundary requirement), so Siteimprove never auto-fails it.
    const linkTextEls = textLeafEls.filter((el) => !!el.closest("a[href]")).length;
    const nonLinkTextEls = textLeafEls.length - linkTextEls;
    if (nonLinkTextEls > 0) {
      pushStat("ACT-R69", nonLinkTextEls, "element");
      pushStat("ACT-R66", nonLinkTextEls, "element");
    }
    if (linkTextEls > 0) {
      pushStat("ACT-R88", linkTextEls, "element");
      pushStat("ACT-R89", linkTextEls, "element");
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R39: Image filename used as alt text (WCAG 1.1.1)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("img[alt]").forEach((el) => {
    if (!isVisible(el)) return;
    const alt = (el as HTMLImageElement).alt?.trim();
    if (!alt) return;
    // Alfa alignment: R39 applies when the accessible name equals the filename
    // of the src URL (or clearly ends in an image extension). The previous
    // "looks like a code name" heuristic over-reported vs Alfa.
    const FILENAME_RE = /\.(jpg|jpeg|png|gif|svg|webp|avif|bmp|ico|tiff?)$/i;
    const srcBase = ((el.getAttribute("src") || "").split("?")[0].split("#")[0].split("/").pop() || "").toLowerCase();
    const srcStem = srcBase.replace(/\.[a-z0-9]+$/i, "");
    const altLower = alt.toLowerCase();
    if (FILENAME_RE.test(alt) || (srcBase && (altLower === srcBase || (srcStem.length >= 4 && altLower === srcStem)))) {
      results.push({ ruleId: "ACT-R39", type: "Issue", impact: "moderate", description: `Image alt text "${alt}" appears to be a filename rather than a meaningful description`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R41: Multiple links with same text to different destinations
  // ════════════════════════════════════════════════════════════════════════
  {
    const groups: Map<string, { hrefs: Set<string>; first: Element }> = new Map();
    document.querySelectorAll("a[href],area[href],[role='link']").forEach((el) => {
      if (getEffectiveAriaRole(el) !== "link") return;
      if (isProgrammaticallyHidden(el)) return;
      const text = getAccessibleName(el).trim().toLowerCase().replace(/\s+/g, " ");
      if (!text || text.length < 2) return;
      let href = (el as HTMLAnchorElement).href || el.getAttribute("href") || "";
      if (!href || href === window.location.href + "#" || href === "#") return;
      // Alfa alignment: links resolving to the same resource are not flagged.
      // Normalize by stripping the fragment and trailing slash.
      href = href.split("#")[0].replace(/\/$/, "");
      if (!href) return;
      const key = text;
      if (!groups.has(key)) groups.set(key, { hrefs: new Set(), first: el });
      const group = groups.get(key)!;
      group.hrefs.add(href);
    });
    for (const [key, g] of groups) {
      if (g.hrefs.size > 1) {
        results.push({ ruleId: "ACT-R41", type: "Potential Issue", impact: "moderate", description: `Multiple links use the same text alternative "${key}" but point to different destinations — review whether the links are equivalent or need more specific names`, element: outerHtmlSnippet(g.first), elementContext: elementContextForAI(g.first), selector: getSelector(g.first) });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R81: Ambiguous link text (WCAG 2.4.4 / 2.4.9)
  // ════════════════════════════════════════════════════════════════════════
  {
    const ambiguousPatterns = /^(click here|here|read more|more|learn more|details|info|information|link|this link|continue|go|view|see more|see details|download|submit|open|visit|press here|tap here|find out more)$/i;
    document.querySelectorAll("a").forEach((el) => {
      if (!isVisible(el)) return;
      const name = getAccessibleName(el).trim().replace(/\s+/g, " ");
      if (name && ambiguousPatterns.test(name)) {
        results.push({ ruleId: "ACT-R81", type: "Issue", impact: "moderate", description: `Link text "${name}" is non-descriptive and does not explain the link destination`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R113: Touch target too small (WCAG 2.5.8)
  // ════════════════════════════════════════════════════════════════════════
  {
    const targets = getAlfaPointerTargets();
    targets.forEach((el) => {
      if (el.tagName === "INPUT") return;
      if (hasAlfaTargetSize(el, 24) || hasAlfaTargetSpacing(el, targets, 24)) return;
      const rect = el.getBoundingClientRect();
      results.push({ ruleId: "ACT-R113", type: "Issue", impact: "moderate", description: `Interactive element is ${Math.round(rect.width)}×${Math.round(rect.height)}px — below the 24×24px minimum touch target (WCAG 2.5.8)`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R44: Orientation restricted via CSS (WCAG 1.3.4)
  // ════════════════════════════════════════════════════════════════════════
  {
    let hasOrientationLock = false;
    try {
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules || []).forEach((rule) => {
            if (rule instanceof CSSMediaRule) {
              const cond = rule.conditionText || (rule as any).media?.mediaText || "";
              if (cond.includes("orientation") && cond.includes(":")) {
                Array.from(rule.cssRules || []).forEach((inner) => {
                  if (inner instanceof CSSStyleRule) {
                    if (inner.style.display === "none" || inner.style.visibility === "hidden") {
                      hasOrientationLock = true;
                    }
                  }
                });
              }
            }
          });
        } catch { /* cross-origin */ }
      });
    } catch { /* ignore */ }
    if (hasOrientationLock) {
      results.push({ ruleId: "ACT-R44", type: "Issue", impact: "serious", description: "Content is restricted to a specific screen orientation via CSS", element: null, selector: null });
    }
  }

  // ── Scoring stats: total elements checked per rule ────────────────────────
  const allLinksEl = document.querySelectorAll("a[href]").length;
  if (allLinksEl > 0) {
    pushStat("ACT-R41", allLinksEl, "element");
    pushStat("ACT-R81", allLinksEl, "element");
  }
  const altImgEls = document.querySelectorAll("img[alt]").length;
  if (altImgEls > 0) pushStat("ACT-R39", altImgEls, "element");
  const interactiveEls = document.querySelectorAll(
    "a,button,[role='button'],[role='link'],input[type='checkbox'],input[type='radio'],select",
  ).length;
  if (interactiveEls > 0) pushStat("ACT-R113", interactiveEls, "element");
  pushStat("ACT-R44", 1, "page");

  // ════════════════════════════════════════════════════════════════════════
}
