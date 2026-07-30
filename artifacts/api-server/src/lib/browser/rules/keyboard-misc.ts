import type { ScanRawResult, PushStatFn } from "../types";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isActuallyTabbable, isIncludedInAccessibilityTree, isProgrammaticallyHidden, isVisible } from "../visibility";

export function runKeyboardMiscRules(results: ScanRawResult[], EMIT_MANUAL_ONLY_RULES: boolean, pushStat: PushStatFn): void {
  // ACT-R49: Auto-playing media has no mechanism to pause or stop (WCAG 1.4.2)
  // ════════════════════════════════════════════════════════════════════════
  {
    document.querySelectorAll("audio[autoplay], video[autoplay]").forEach((el) => {
      if (!isVisible(el)) return;
      const muted = el.hasAttribute("muted");
      const loop = el.hasAttribute("loop");
      const controls = el.hasAttribute("controls");
      // Background video pattern (loop + muted + autoplay) — intentional decorative, no concern
      if (muted && loop) return;
      // Muted audio has no audio disruption
      if (el.tagName === "AUDIO" && muted) return;
      // Native controls give the user pause/stop
      if (controls) return;
      results.push({ ruleId: "ACT-R49", type: "Potential Issue", impact: "serious", description: `Auto-playing ${el.tagName.toLowerCase()} element has no visible controls — users cannot pause or stop it (WCAG 1.4.2)`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R57: Tabbable element is not inside any landmark region (ARIA APG)
  // ════════════════════════════════════════════════════════════════════════
  {
    const LANDMARK_ROLES_R57 = new Set(["banner","complementary","contentinfo","form","main","navigation","region","search"]);
    function isInLandmarkR57(el: Element): boolean {
      let node: Element | null = el.parentElement;
      while (node && node !== document.documentElement) {
        const role = node.getAttribute("role") || "";
        if (LANDMARK_ROLES_R57.has(role)) return true;
        const tag = node.tagName.toLowerCase();
        if (tag === "main") return true;
        if (tag === "nav") return true;
        if (tag === "aside") return true;
        if (tag === "search") return true;
        // <header> and <footer> are landmarks only when scoped directly under body or main
        if (tag === "header" || tag === "footer") {
          const parentTag = node.parentElement?.tagName.toLowerCase();
          if (parentTag === "body" || parentTag === "main") return true;
        }
        // <form> is a landmark only when it has an accessible name
        if (tag === "form" && (node.getAttribute("aria-label") || node.getAttribute("aria-labelledby"))) return true;
        // <section> is a landmark only when it has an accessible name
        if (tag === "section" && (node.getAttribute("aria-label") || node.getAttribute("aria-labelledby"))) return true;
        node = node.parentElement;
      }
      return false;
    }
    const tabbableSelectors = [
      "a[href]", "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])", "textarea:not([disabled])",
      "[tabindex='0']", "audio[controls]", "video[controls]",
    ].join(", ");
    // Tabbable-not-in-landmark emitter removed — Siteimprove/Alfa's landmark
    // rule (ACT-R57 upstream) counts *text* outside landmarks, which our R35
    // check already covers; emitting both double-counted the same problem.
    void tabbableSelectors;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R61: First visible heading in the document is not h1 (Best Practice)
  // ════════════════════════════════════════════════════════════════════════
  {
    const allHeadings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']")).filter((h) => isVisible(h));
    if (allHeadings.length > 0) {
      const first = allHeadings[0];
      const tag = first.tagName.toLowerCase();
      const ariaLevel = first.getAttribute("aria-level");
      const level = ariaLevel ? parseInt(ariaLevel, 10) : (tag.startsWith("h") ? parseInt(tag[1], 10) : 0);
      if (level > 1) {
        results.push({ ruleId: "ACT-R61", type: "Best Practice", impact: "minor", description: `First heading in the page is <${tag}> (level ${level}), not an <h1> — documents should begin with a level-1 heading to establish the page title in the heading hierarchy`, element: outerHtmlSnippet(first), elementContext: elementContextForAI(first), selector: getSelector(first) });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R66: Enhanced text contrast below AAA 7:1 (WCAG 1.4.6)
  // Already handled by the ACT-R30 branch in the R69/R30 contrast block above.
  // ════════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R68: Empty container element
  // ════════════════════════════════════════════════════════════════════════
  {
    document.querySelectorAll("div,section,article,aside,header,footer,main,nav").forEach((el) => {
      if (!isVisible(el)) return;
      if ((el.textContent ?? "").trim()) return;
      // Empty layout scaffolding is not an accessibility failure. Exclude
      // common clearfix/grid placeholders, metadata nodes, media shells, and
      // live-region buffers that are intentionally empty at scan time.
      const className = typeof el.className === "string" ? el.className : "";
      const id = el.id || "";
      const style = window.getComputedStyle(el);
      if (
        el.hasAttribute("aria-hidden") ||
        el.hasAttribute("hidden") ||
        el.hasAttribute("data-path") ||
        /(^|[\s_-])(clearfix|clear|grid|responsivegrid|aem-grid|panel|wrapper|section|column-control|layout-container|content-height|parbase|breadcrumb|poster|video|player)([\s_-]|$)/i.test(className) ||
        /(^|[-_])(live|path|mobile|test|placeholder|poster|player|video|breadcrumb|clearfix|clear)([-_]|$)/i.test(id) ||
        style.position === "absolute" ||
        style.position === "fixed" ||
        el.getBoundingClientRect().width <= 1 ||
        el.getBoundingClientRect().height <= 1
      ) return;
      if (el.querySelector("img,svg,video,audio,canvas,iframe,object,embed,input,button,[aria-label],[aria-labelledby]")) return;
      results.push({ ruleId: "ACT-R68", type: "Issue", impact: "moderate", description: "Container element is empty", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R78: Heading element has no text content (Best Practice)
  // ════════════════════════════════════════════════════════════════════════
  {
    document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']").forEach((el) => {
      if (!isVisible(el)) return;
      // Skip accordion/disclosure pattern where the heading wraps an interactive element
      if (el.querySelector("button, [role='button']")) return;
      const text = (el.textContent || "").trim();
      if (!text) {
        results.push({ ruleId: "ACT-R78", type: "Issue", impact: "moderate", description: `<${el.tagName.toLowerCase()}> heading is empty — headings must have descriptive text content so screen readers can announce the section title`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R95: iframe with tabindex="-1" blocks keyboard access (WCAG 2.1.1)
  // ════════════════════════════════════════════════════════════════════════
  {
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (!isVisible(iframe) || iframe.getAttribute("tabindex") !== "-1") return;
      try {
        const doc = (iframe as HTMLIFrameElement).contentDocument;
        if (!doc) return;
        if (doc.querySelector("a[href], button, input:not([type='hidden']), select, textarea, [tabindex]:not([tabindex='-1'])")) {
          results.push({ ruleId: "ACT-R95", type: "Potential Issue", impact: "serious", description: `<iframe> has tabindex="-1" — keyboard users cannot tab into the frame. If the iframe contains interactive content (links, buttons, forms) this violates WCAG 2.1.1`, element: outerHtmlSnippet(iframe), elementContext: elementContextForAI(iframe), selector: getSelector(iframe) });
        }
      } catch {
        // Cross-origin or inaccessible frame: do not invent a failure.
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R96: meta http-equiv="refresh" causes automatic redirection (WCAG 2.2.4 / 3.2.5)
  // ════════════════════════════════════════════════════════════════════════
  {
    const metaRefresh = document.querySelector('meta[http-equiv="refresh"], meta[http-equiv="Refresh"]');
    if (metaRefresh) {
      const content = metaRefresh.getAttribute("content") || "";
      const delay = parseInt(content.split(";")[0].trim(), 10);
      if (!isNaN(delay) && delay > 0) {
        results.push({ ruleId: "ACT-R96", type: "Issue", impact: "serious", description: `<meta http-equiv="refresh" content="${content}"> automatically redirects after ${delay}s — this interrupts users and violates WCAG 2.2.4 (Interruptions) and 3.2.5 (Change on Request). Remove the meta refresh and use server-side redirect instead`, element: `<meta http-equiv="refresh" content="${content}">`, selector: 'meta[http-equiv="refresh"]' });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R111: Touch target below 44×44px AAA enhanced minimum (WCAG 2.5.5)
  // ════════════════════════════════════════════════════════════════════════
  {
    // Alfa R111 (2.5.5 AAA enhanced): ALL pointer targets below 44×44px fail —
    // unlike R113 (AA), there is NO inline exception and NO spacing exception.
    // Only user-agent-controlled targets (unstyled native form widgets) are exempt.
    const WIDGET_ROLES = new Set(["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "searchbox", "textbox", "combobox", "slider", "spinbutton", "treeitem"]);
    // An inline target inside a text line is sized by the surrounding line box.
    // Alfa treats these links as outside the enhanced touch-target check.
    const isInlineInLineContainer = (el: Element): boolean => {
      if (window.getComputedStyle(el).display !== "inline") return false;
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        const disp = window.getComputedStyle(node).display;
        if (disp === "block" || disp === "list-item" || disp === "flow-root" || disp === "table-cell") {
          return Array.from(node.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent?.trim()?.length || 0) > 0);
        }
        node = node.parentElement;
      }
      return false;
    };
    const isNativeControl = (el: Element): boolean => el.matches("button, input, select, textarea, summary, audio[controls], video[controls], iframe");
    // Alfa uses focusability, not tab-order membership. A target with
    // tabindex="-1" can still be focusable and must not disappear from R111.
    // Keep the actual-tabbable helper for the common case, then admit native
    // or explicitly tabindexed controls that are focusable but skipped by Tab.
    const isFocusablePointerTarget = (el: Element): boolean => {
      if (!isIncludedInAccessibilityTree(el) || !isVisible(el)) return false;
      if (el.matches("input[type='hidden'], :disabled, [disabled]")) return false;
      if (isActuallyTabbable(el)) return true;
      return el.getAttribute("tabindex") === "-1" &&
        (isNativeControl(el) || el.matches("a[href]") || el.hasAttribute("role"));
    };
    const targetSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "summary",
      "audio[controls]",
      "video[controls]",
      "iframe",
      "[role]",
    ].join(", ");
    document.querySelectorAll(targetSelector).forEach((el) => {
      if (!isFocusablePointerTarget(el)) return;
      // Alfa's current R111 implementation exempts user-agent-controlled
      // inputs from the enhanced target-size expectation.
      if (el.tagName === "INPUT") return;
      // Alfa: an explicit non-widget role (e.g. role="listitem" on a link)
      // removes the element from pointer-target applicability.
      const role = el.getAttribute("role");
      if (role && !WIDGET_ROLES.has(role)) return;
      if (isInlineInLineContainer(el)) return;
      // Alfa measures the *clickable region*: the union of the element's own
      // box with the boxes of all its rendered descendants (e.g. a short link
      // wrapping a tall image is as large as the image).
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      const addRect = (r: DOMRect) => { if (r.width > 0 && r.height > 0) { left = Math.min(left, r.left); top = Math.min(top, r.top); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom); } };
      const ownRect = el.getBoundingClientRect();
      addRect(ownRect);
      // Descendant-union is only needed when the element's own box is too
      // small — the union can only grow, so already-passing targets skip the
      // (expensive) full-subtree rect walk.
      if (ownRect.width < 44 || ownRect.height < 44) {
        el.querySelectorAll("*").forEach((d) => addRect(d.getBoundingClientRect()));
      }
      if (!isFinite(left)) return;
      const w = right - left, h = bottom - top;
      // Degenerate boxes (<2px in a dimension) are not real pointer targets —
      // typically stretched overlay links.
      if (w < 2 || h < 2) return;
      if (w < 44 || h < 44) {
        results.push({ ruleId: "ACT-R111", type: "Best Practice", impact: "minor", description: `Interactive element is ${Math.round(w)}×${Math.round(h)}px — below the 44×44px AAA enhanced target size (WCAG 2.5.5)`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R63: <object>/<embed> element has no accessible name (WCAG 4.1.2)
  // ════════════════════════════════════════════════════════════════════════
  {
    // Alfa's exact applicability filter: only objects/embeds that embed MEDIA
    // (audio/image/video), determined by the type attribute's MIME prefix or,
    // failing that, the file extension of the data/src URL.
    // https://github.com/Siteimprove/alfa — packages/alfa-rules/src/sia-r63/rule.ts
    const MEDIA_MIME_R63 = ["audio", "image", "video"];
    const MEDIA_EXT_R63 = new Set(["aac","avif","avi","bmp","gif","ico","jpeg","jpg","mid","midi","mp3","mp4","mpeg","oga","ogv","opus","png","svg","tif","tiff","ts","wav","weba","webm","webp","3gp","3gpp","3g2","3gpp2"]);
    function embedsMediaR63(el: Element): boolean {
      const type = el.getAttribute("type");
      if (type) return MEDIA_MIME_R63.includes(type.split("/")[0].toLowerCase());
      const url = el.getAttribute("data") || el.getAttribute("src") || "";
      const ext = url.split("?")[0].split("#")[0].split(".").pop() || "";
      return MEDIA_EXT_R63.has(ext.toLowerCase());
    }
    document.querySelectorAll("object, embed").forEach((el) => {
      if (!isVisible(el)) return;
      const rect = el.getBoundingClientRect();
      // Skip tiny/tracking embeds — but if the media failed to load and the
      // box collapsed, fall back to the declared width/height attributes.
      const w = rect.width >= 2 ? rect.width : parseInt(el.getAttribute("width") || "0", 10);
      const h = rect.height >= 2 ? rect.height : parseInt(el.getAttribute("height") || "0", 10);
      if (w < 2 || h < 2) return;
      if (!embedsMediaR63(el)) return;
      const ariaLabel = (el.getAttribute("aria-label") || "").trim();
      const labelledby = el.getAttribute("aria-labelledby");
      const title = (el.getAttribute("title") || "").trim();
      const hidden = el.getAttribute("aria-hidden") === "true" || el.getAttribute("role") === "presentation" || el.getAttribute("role") === "none";
      if (hidden) return;
      let hasName = !!(ariaLabel || title);
      if (!hasName && labelledby) {
        hasName = labelledby.split(/\s+/).some((id) => {
          const ref = document.getElementById(id);
          return !!ref && !!(ref.textContent || "").trim();
        });
      }
      // <object> fallback content counts as a text alternative
      if (!hasName && el.tagName === "OBJECT" && (el.textContent || "").trim().length > 0) hasName = true;
      if (!hasName) {
        results.push({ ruleId: "ACT-R63", type: "Issue", impact: "serious", description: `<${el.tagName.toLowerCase()}> element has no accessible name — add aria-label, title, or (for <object>) fallback text content so assistive technologies can identify the embedded content`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R77: headers attribute on table cells references invalid targets (WCAG 1.3.1)
  // Complements ACT-R46: R46 checks missing association; R77 validates explicit
  // headers="" attributes on complex/spanning tables.
  // ════════════════════════════════════════════════════════════════════════
  {
    document.querySelectorAll("table").forEach((table) => {
      if (!isVisible(table)) return;
      if (table.getAttribute("role") === "presentation" || table.getAttribute("role") === "none") return;
      table.querySelectorAll("td[headers], th[headers]").forEach((cell) => {
        const ids = (cell.getAttribute("headers") || "").split(/\s+/).filter(Boolean);
        if (ids.length === 0) return;
        const badIds: string[] = [];
        for (const id of ids) {
          const target = document.getElementById(id);
          // Target must exist, be inside the SAME table, and be a th (or role columnheader/rowheader)
          if (!target || !table.contains(target)) {
            badIds.push(id);
            continue;
          }
          const tag = target.tagName.toLowerCase();
          const role = target.getAttribute("role") || "";
          if (tag !== "th" && role !== "columnheader" && role !== "rowheader") badIds.push(id);
        }
        if (badIds.length > 0) {
          results.push({ ruleId: "ACT-R77", type: "Issue", impact: "serious", description: `Table cell headers attribute references ${badIds.length === 1 ? "an invalid target" : "invalid targets"} (${badIds.map((i) => `"${i}"`).join(", ")}) — each ID must match a <th> element inside the same table`, element: outerHtmlSnippet(cell), elementContext: elementContextForAI(cell), selector: getSelector(cell) });
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R112: Text is styled as a heading but not marked up as one (Best Practice)
  // Deliberately conservative to avoid false positives: short, bold, larger-than-
  // body text in a block element with no heading semantics.
  // ════════════════════════════════════════════════════════════════════════
  {
    const bodyStyle = window.getComputedStyle(document.body);
    const bodyFontSize = parseFloat(bodyStyle.fontSize) || 16;
    let r112Count = 0;
    document.querySelectorAll("div, p, span, strong, b").forEach((el) => {
      if (r112Count >= 10) return;
      if (!isVisible(el)) return;
      // Must be a leaf-ish text block: direct text, no element children
      if (el.children.length > 0) return;
      const text = (el.textContent || "").trim();
      if (text.length < 4 || text.length > 80) return;
      // Skip if inside a real heading, link, button, label, or nav
      if (el.closest("h1,h2,h3,h4,h5,h6,[role='heading'],a,button,[role='button'],label,nav,figcaption,blockquote,time")) return;
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize) || 0;
      const fontWeight = parseInt(style.fontWeight, 10) || 400;
      // Heading-like: at least 1.35x body font AND bold
      if (fontSize < bodyFontSize * 1.35 || fontWeight < 600) return;
      // Must be block-rendered (not an inline emphasis inside a sentence)
      const display = style.display;
      if (display !== "block" && display !== "flex" && display !== "grid") return;
      // Sentence-like text (ends with period, long punctuation) is body copy, not a heading
      if (/[.,;:!?]$/.test(text)) return;
      r112Count++;
      results.push({ ruleId: "ACT-R112", type: "Best Practice", impact: "minor", description: `Text "${text.slice(0, 50)}${text.length > 50 ? "…" : ""}" is visually styled as a heading (${Math.round(fontSize)}px, weight ${fontWeight}) but uses <${el.tagName.toLowerCase()}> — use a real heading element (h1–h6) so screen reader users can navigate by headings`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    });
  }

  // ── Scoring stats: total elements checked per rule ────────────────────────
  const autoplayMedia = document.querySelectorAll("audio[autoplay],video[autoplay]").length;
  if (autoplayMedia > 0) pushStat("ACT-R49", autoplayMedia, "element");
  pushStat("ACT-R61", 1, "page");
  const roleEls = document.querySelectorAll("[role]").length;
  const kbHeadings = document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']").length;
  if (kbHeadings > 0) pushStat("ACT-R78", kbHeadings, "element");
  const kbIframes = document.querySelectorAll("iframe").length;
  if (kbIframes > 0) pushStat("ACT-R95", kbIframes, "element");
  pushStat("ACT-R96", 1, "page");
  const focusableEls = document.querySelectorAll("a[href],button:not([disabled]),[role='button'],[role='link']").length;
  if (focusableEls > 0) pushStat("ACT-R111", focusableEls, "element");
  const embedEls = document.querySelectorAll("object,embed").length;
  if (embedEls > 0) pushStat("ACT-R63", embedEls, "element");
  const tableEls = document.querySelectorAll("table").length;
  if (tableEls > 0) pushStat("ACT-R77", document.querySelectorAll("td,th").length, "element");
  const divTextEls = document.querySelectorAll("div,p,span,strong,b").length;
  if (divTextEls > 0) pushStat("ACT-R112", divTextEls, "element");

}
