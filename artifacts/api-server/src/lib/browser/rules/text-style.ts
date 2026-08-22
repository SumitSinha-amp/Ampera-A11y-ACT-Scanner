import type { ScanRawResult, PushStatFn } from "../types";
import { getEffectiveAriaRole } from "../aria-data";
import { hasAlfaFocusIndicator, isAlfaIncludedInAccessibilityTree } from "../alfa-helpers";
import { getLuminanceFromColorString } from "../contrast";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isRendered, isVisible } from "../visibility";

export function runTextStyleRules(results: ScanRawResult[], EMIT_MANUAL_ONLY_RULES: boolean, pushStat: PushStatFn): void {
  // ACT-R62: Color used as only visual means to distinguish links (WCAG 1.4.1)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("a[href],area[href],[role='link']").forEach((el) => {
    if (getEffectiveAriaRole(el) !== "link" || !isAlfaIncludedInAccessibilityTree(el)) return;
    const style = window.getComputedStyle(el);
    const parentStyle = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
    if (!parentStyle) return;
    const hasUnderline = style.textDecoration.includes("underline");
    const hasBold = parseInt(style.fontWeight) > parseInt(parentStyle.fontWeight || "400") + 100;
    const hasNonColorAffordance =
      hasUnderline ||
      hasBold ||
      (style.outline !== "none" && style.outline !== "") ||
      style.borderTopStyle !== "none" ||
      style.borderBottomStyle !== "none" ||
      style.boxShadow !== "none";
    const parentHasText = Array.from(el.parentElement?.childNodes || []).some(
      (node) => node !== el && node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim(),
    );
    if (!parentHasText) return;
    const linkLum = getLuminanceFromColorString(style.color);
    const parentLum = getLuminanceFromColorString(parentStyle.color);
    if (
      linkLum !== null &&
      parentLum !== null &&
      linkLum !== parentLum &&
      !hasNonColorAffordance &&
      !hasAlfaFocusIndicator(el)
    ) {
      results.push({ ruleId: "ACT-R62", type: "Issue", impact: "serious", description: "Link uses color as the only visual means to distinguish it from surrounding text", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R67: Decorative image exposed to assistive technologies (WCAG 1.1.1)
  // ════════════════════════════════════════════════════════════════════════
  // Alfa alignment: applies to images MARKED decorative (alt="" or
  // role=presentation/none) that are nevertheless exposed to AT via a
  // conflicting attribute (aria-label/labelledby, non-empty alt, tabindex>=0).
  document.querySelectorAll("img[role='presentation'], img[role='none'], img[alt=''], svg[role='presentation'], svg[role='none']").forEach((el) => {
    const roleDecorative = el.getAttribute("role") === "presentation" || el.getAttribute("role") === "none";
    const alt = el.getAttribute("alt");
    const tabIdx = parseInt(el.getAttribute("tabindex") || "-1", 10);
    const exposedBy: string[] = [];
    if (roleDecorative && alt && alt.trim() !== "") exposedBy.push(`non-empty alt "${alt.trim()}"`);
    if ((el.getAttribute("aria-label") || "").trim()) exposedBy.push("aria-label");
    if (el.getAttribute("aria-labelledby")) exposedBy.push("aria-labelledby");
    if (tabIdx >= 0) exposedBy.push(`tabindex="${tabIdx}"`);
    if (exposedBy.length > 0) {
      results.push({ ruleId: "ACT-R67", type: "Issue", impact: "minor", description: `Image is marked as decorative but is still exposed to assistive technologies via ${exposedBy.join(", ")} — remove the conflicting attribute or make the image meaningful`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R70: Deprecated HTML elements (Best Practice)
  // ════════════════════════════════════════════════════════════════════════
  {
    const DEPRECATED = ["acronym","applet","basefont","bgsound","big","blink","center","content","dir","font","frame","frameset","image","keygen","marquee","menuitem","nobr","noembed","noframes","plaintext","rb","rtc","shadow","spacer","strike","tt","xmp"];
    DEPRECATED.forEach((tag) => {
      document.querySelectorAll(tag).forEach((el) => {
        if (!isVisible(el)) return;
        results.push({ ruleId: "ACT-R70", type: "Issue", impact: "minor", description: `Deprecated HTML element <${tag}> — replace with a modern equivalent`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R71: Paragraph text is fully justified (WCAG 1.4.8 AAA)
  // ════════════════════════════════════════════════════════════════════════
  {
    const r71Seen = new Set<string>();
    for (const el of Array.from(document.querySelectorAll("p")).slice(0, 600)) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisible(el)) continue;
      if (!el.textContent?.trim()) continue;
      if (window.getComputedStyle(el).textAlign !== "justify") continue;
      const sel = getSelector(el);
      if (r71Seen.has(sel)) continue;
      r71Seen.add(sel);
      results.push({ ruleId: "ACT-R71", type: "Best Practice", impact: "minor", description: "Paragraph has text-align:justify — justified text reduces readability", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: sel });
    }
  }

  // ACT-R72: Paragraph text in ALL CAPS (WCAG 1.4.8 AAA)
  {
    const r72Seen = new Set<string>();
    for (const el of Array.from(document.querySelectorAll("p,[role='paragraph']")).slice(0, 400)) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isRendered(el)) continue;
      if (!el.textContent?.trim()) continue;
      if (window.getComputedStyle(el).textTransform !== "uppercase") continue;
      const sel = getSelector(el);
      if (r72Seen.has(sel)) continue;
      r72Seen.add(sel);
      if (EMIT_MANUAL_ONLY_RULES) results.push({ ruleId: "ACT-R72", type: "Issue", impact: "minor", description: "Paragraph has text-transform:uppercase — all-caps text reduces readability", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: sel });
    }
  }

  // ACT-R73: Line height below 1.5 (WCAG 1.4.8 AAA)
  {
    const r73Flagged = new Set<string>();
    // Alfa evaluates every visible paragraph-role element. Do not cap this
    // collection: large component-heavy pages can place the affected card
    // paragraphs after the first 2,000 matches.
    for (const el of Array.from(document.querySelectorAll("p,[role='paragraph']"))) {
      if (!(el instanceof HTMLElement)) continue;
      // Alfa R73 applicability is isVisible — visibility:hidden/opacity:0/
      // off-screen paragraphs (e.g. video-js no-JS fallbacks) are excluded
      if (!isVisible(el)) continue;
      // Media-player fallback text (video.js no-JS message, "player not
      // available" descriptions) is hidden once the player initializes in a
      // real browsing session, so Siteimprove never reports it
      if (el.classList.contains("vjs-no-js") || /(^|_)no_?player/i.test(el.id) || el.closest(".video-js")) continue;
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      if (isNaN(fontSize) || fontSize === 0) continue;
      const lhRaw = style.lineHeight;
      let lhPx: number;
      let isNormal = false;
      if (!lhRaw || lhRaw === "normal") { lhPx = fontSize * 1.2; isNormal = true; }
      else if (lhRaw.endsWith("px")) { lhPx = parseFloat(lhRaw); }
      else { const num = parseFloat(lhRaw); lhPx = isNaN(num) ? fontSize * 1.2 : fontSize * num; if (isNaN(parseFloat(lhRaw))) isNormal = true; }
      const ratio = lhPx / fontSize;
      if (ratio >= 1.5) continue;
      const sel = getSelector(el);
      if (r73Flagged.has(sel)) continue;
      r73Flagged.add(sel);
      results.push({ ruleId: "ACT-R73", type: "Best Practice", impact: "moderate", description: isNormal ? `Line height is 'normal' (< 1.5× font-size: ${Math.round(fontSize)}px)` : `Line height ${ratio.toFixed(2)}× is below 1.5 minimum`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: sel });
    }
  }

  // ACT-R74: Font size is fixed (absolute units) (WCAG 1.4.8 AAA)
  {
    const r74Seen = new Set<string>();
    // Returns true/false when the element has a directly cascaded declaration,
    // or null when font-size is inherited. R74 must inspect the declaration
    // token, not Chromium's computed pixels; inherited declarations matter too
    // (for example body { font-size: 16px }).
    const directFontSizeUnit = (el: HTMLElement): boolean | null => {
      const absolute = /(^|[\s(,])(?:-?\d*\.?\d+)(?:px|pt|pc|in|cm|mm)(?=$|[\s),;!])/i;
      const isDirectAbsoluteValue = (value: string) =>
        !/\bcalc\s*\(/i.test(value) && absolute.test(value.trim());
      const inline = el.style.getPropertyValue("font-size");
      if (inline) return isDirectAbsoluteValue(inline);

      // Alfa evaluates the cascaded font-size token, not merely the computed
      // pixel value. Inspect matching author rules so rem/em/% remain valid
      // even though Chromium resolves all of them to px in getComputedStyle().
      let found: boolean | null = null;
      const visitRules = (rules: CSSRuleList): void => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) {
            try {
              if (el.matches(rule.selectorText)) {
                const value = rule.style.getPropertyValue("font-size");
                if (value) found = isDirectAbsoluteValue(value);
              }
            } catch {
              // Invalid selectors in third-party stylesheets are ignored.
            }
          }
          if ("cssRules" in rule) {
            try {
              visitRules((rule as CSSGroupingRule).cssRules);
            } catch {
              // Cross-origin or inaccessible nested rules are skipped.
            }
          }
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          visitRules(sheet.cssRules);
        } catch {
          // cross-origin stylesheet
        }
      }
      return found;
    };
    const hasAbsoluteFontSizeDeclaration = (el: HTMLElement): boolean => {
      let node: HTMLElement | null = el;
      while (node) {
        const direct = directFontSizeUnit(node);
        if (direct !== null) return direct;
        node = node.parentElement;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll("p,[role='paragraph']")).slice(0, 2000)) {
      if (!(el instanceof HTMLElement)) continue;
      // Alfa R74 applies to visible paragraph-role elements with
      // non-whitespace text and a cascaded font-size declaration.
      if (!isVisible(el)) continue;
      // Video.js fallback text is present in the DOM for no-JavaScript
      // environments but is hidden once the player initializes. Siteimprove
      // does not treat this implementation fallback as page content.
      if (el.classList.contains("vjs-no-js") || /(^|_)no_?player/i.test(el.id) || el.closest(".video-js")) continue;
      if (!(el.textContent || "").trim()) continue;
      const style = window.getComputedStyle(el);
      const origFS = parseFloat(style.fontSize);
      if (isNaN(origFS) || origFS <= 0) continue;
      if (!hasAbsoluteFontSizeDeclaration(el)) continue;
      const sel = getSelector(el);
      if (r74Seen.has(sel)) continue;
      r74Seen.add(sel);
      results.push({ ruleId: "ACT-R74", type: "Best Practice", impact: "minor", description: `Font size is fixed at ${origFS.toFixed(1)}px — use relative units (em, rem, %)`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: sel });
    }
  }

  // ACT-R75: Font size below 9px
  {
    const r75Seen = new Set<string>();
    const R75_SEL = "p, li, a, button, label, td, th, blockquote, dd, dt, figcaption, h1, h2, h3, h4, h5, h6";
    for (const el of Array.from(document.querySelectorAll(R75_SEL)).slice(0, 600)) {
      if (!(el instanceof HTMLElement)) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (el.closest("[aria-hidden='true']") || el.closest("[hidden]")) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === "sup" || tag === "sub") continue;
      const fontSize = parseFloat(cs.fontSize);
      if (isNaN(fontSize) || fontSize >= 9) continue;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 3) continue;
      const savedVal = el.style.getPropertyValue("font-size");
      const savedPri = el.style.getPropertyPriority("font-size");
      el.style.setProperty("font-size", "inherit", "important");
      const inheritedFS = parseFloat(window.getComputedStyle(el).fontSize);
      el.style.removeProperty("font-size");
      if (savedVal) el.style.setProperty("font-size", savedVal, savedPri);
      if (Math.abs(fontSize - inheritedFS) < 1) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) continue;
      const sel = getSelector(el);
      if (r75Seen.has(sel)) continue;
      r75Seen.add(sel);
      results.push({ ruleId: "ACT-R75", type: "Issue", impact: "moderate", description: `Font size ${fontSize.toFixed(1)}px is below the minimum of 9px`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: sel });
    }
  }

  // ACT-R80: Line height is fixed (absolute units) (WCAG 1.4.8 AAA)
  {
    const getInheritedLH = (el: HTMLElement): number => {
      const savedVal = el.style.getPropertyValue("line-height");
      const savedPri = el.style.getPropertyPriority("line-height");
      el.style.setProperty("line-height", "inherit", "important");
      const lhStr = window.getComputedStyle(el).lineHeight;
      el.style.removeProperty("line-height");
      if (savedVal) el.style.setProperty("line-height", savedVal, savedPri);
      return lhStr === "normal" ? -1 : parseFloat(lhStr);
    };
    const doubleFSGetLH = (el: HTMLElement, fs: number): number => {
      const savedVal = el.style.getPropertyValue("font-size");
      const savedPri = el.style.getPropertyPriority("font-size");
      el.style.setProperty("font-size", fs * 2 + "px", "important");
      const lh = parseFloat(window.getComputedStyle(el).lineHeight);
      el.style.removeProperty("font-size");
      if (savedVal) el.style.setProperty("font-size", savedVal, savedPri);
      return lh;
    };
    const r80Seen = new Set<string>();
    for (const el of Array.from(document.querySelectorAll("p,[role='paragraph']")).slice(0, 600)) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isRendered(el)) continue;
      if ((el.innerText || "").trim().length === 0) continue;
      const style = window.getComputedStyle(el);
      const lhRaw = style.lineHeight;
      if (lhRaw === "normal") continue;
      const origFS = parseFloat(style.fontSize);
      const origLH = parseFloat(lhRaw);
      if (isNaN(origLH) || isNaN(origFS) || origFS === 0) continue;
      const inheritedLH = getInheritedLH(el);
      if (inheritedLH > 0 && Math.abs(origLH - inheritedLH) <= 0.2) continue;
      const newLH = doubleFSGetLH(el, origFS);
      if (newLH / origLH >= 1.45) continue;
      const sel = getSelector(el);
      if (r80Seen.has(sel)) continue;
      r80Seen.add(sel);
      if (EMIT_MANUAL_ONLY_RULES) results.push({ ruleId: "ACT-R80", type: "Best Practice", impact: "moderate", description: `Line height is fixed (${Math.round(origLH)}px absolute unit) — use unitless multiplier (e.g. 1.5)`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: sel });
    }
  }

  // ACT-R83: Text clipped when resized (WCAG 1.4.4)
  {
    const seen = new Set<string>();
    document.querySelectorAll("*").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (!isVisible(el)) return;
      const style = window.getComputedStyle(el);
      const cls = (el.className || "").toString().toLowerCase();
      if (cls.includes("sr-only") || cls.includes("visually-hidden") || cls.includes("screen-reader") || cls.includes("a11y-hidden") || cls.includes("offscreen")) return;
      if (style.clip !== "auto" || style.clipPath !== "none") return;
      if (el.clientHeight <= 1 || el.clientWidth <= 1) return;
      const text = el.textContent?.trim() || "";
      if (text.length < 10) return;
      const hasHiddenOverflow = ["hidden","clip"].includes(style.overflow) || ["hidden","clip"].includes(style.overflowY) || ["hidden","clip"].includes(style.overflowX);
      if (!hasHiddenOverflow) return;
      const height = style.height;
      if (!height || height === "auto" || height.endsWith("%") || height.includes("content")) return;
      const heightPx = parseFloat(height);
      // Alfa R83: any fixed pixel height combined with clipping overflow can
      // clip text on resize — no height-band or padding heuristics; those
      // under-reported vs Siteimprove.
      if (isNaN(heightPx) || heightPx <= 1) return;
      const tagR83 = el.tagName.toLowerCase();
      // Media elements/containers clip by design (letterboxing), and Alfa's
      // applicability is text content, not media chrome text.
      if (["video", "audio", "iframe", "a", "button"].includes(tagR83)) return;
      if (el.querySelector("video, audio, iframe, [data-video-src], .video-js")) return;
      // Uninitialized media component placeholders (e.g. AEM video wrappers)
      // have no <video> element yet at scan time but are still media chrome.
      if (/(^|[\s-])video([\s-]|$)/.test((el.className || "").toString())) return;
      // Scroll regions (e.g. carousels) expose their content by scrolling.
      if (el.getAttribute("role") === "region") return;
      if (el.scrollHeight > el.clientHeight || el.scrollHeight >= el.clientHeight * 0.9) {
        const selector = getSelector(el);
        if (seen.has(selector)) return;
        seen.add(selector);
        // R83 is proprietary in current Alfa and the SI extension never
        // auto-reports it on validated pages — manual-review tier only
        if (EMIT_MANUAL_ONLY_RULES) results.push({ ruleId: "ACT-R83", type: "Potential Issue", impact: "moderate", description: `Element has fixed height (${height}) with overflow:hidden — text may be clipped when text size is increased`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector });
      }
    });
  }

  // ACT-R85: Paragraph text is fully italic (Best Practice)
  {
    const r85Seen = new Set<string>();
    for (const el of Array.from(document.querySelectorAll("p,[role='paragraph']")).slice(0, 600)) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisible(el)) continue;
      if (!el.textContent?.trim()) continue;
      if (window.getComputedStyle(el).fontStyle !== "italic") continue;
      const sel = getSelector(el);
      if (r85Seen.has(sel)) continue;
      r85Seen.add(sel);
      results.push({ ruleId: "ACT-R85", type: "Best Practice", impact: "minor", description: "Paragraph text is fully italic — avoid for long passages", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: sel });
    }
  }

  // ── Scoring stats: total elements checked per rule ────────────────────────
  const anchorEls = document.querySelectorAll("a").length;
  if (anchorEls > 0) pushStat("ACT-R62", anchorEls, "element");
  const deprecatedTags = document.querySelectorAll("b,i,u,s,strike,tt,blink,marquee,font,center,big,small").length;
  if (deprecatedTags > 0) pushStat("ACT-R70", deprecatedTags, "element");
  const paraEls = document.querySelectorAll("p,li,td,th,blockquote").length;
  if (paraEls > 0) {
    pushStat("ACT-R71", paraEls, "element");
    pushStat("ACT-R72", paraEls, "element");
    pushStat("ACT-R73", paraEls, "element");
    pushStat("ACT-R74", paraEls, "element");
    pushStat("ACT-R80", paraEls, "element");
    pushStat("ACT-R85", paraEls, "element");
  }
  pushStat("ACT-R67", 1, "page");
  pushStat("ACT-R75", 1, "page");
  const anyTextEls = document.querySelectorAll("p,span,div,h1,h2,h3,h4,h5,h6,li,td,th,a,label,button").length;
  if (anyTextEls > 0) {
    pushStat("ACT-R91", anyTextEls, "element");
    pushStat("ACT-R92", anyTextEls, "element");
    pushStat("ACT-R93", anyTextEls, "element");
  }
  pushStat("ACT-R83", 1, "page");
  const divEls = document.querySelectorAll("div,p,span,strong,b").length;
  if (divEls > 0) pushStat("ACT-R112", divEls, "element");

}
