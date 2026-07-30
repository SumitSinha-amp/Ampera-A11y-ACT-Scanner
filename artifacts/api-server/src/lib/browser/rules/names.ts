import type { ScanRawResult, PushStatFn } from "../types";
import { getAccessibleName, getFormFieldAccessibleName, getVisibleLabel } from "../accname";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isCssHidden, isIncludedInAccessibilityTree, isProgrammaticallyHidden, isVisible, isVisibleRect } from "../visibility";

export function runNamesRules(results: ScanRawResult[], pushStat: PushStatFn): void {
  // ACT-R2: Image without a text alternative (WCAG 1.1.1)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("img").forEach((img) => {
    // With scripting enabled, <noscript> markup is fallback content rather
    // than an active image. Sites commonly keep an unlabelled lazy-load
    // fallback image here, so reporting it as an exposed image is a false
    // positive.
    if (img.closest("noscript")) return;
    const explicitRole = img.getAttribute("role")?.trim().split(/\s+/)[0];
    if (explicitRole === "none" || explicitRole === "presentation") return;
    // An empty alt on an ordinary image maps it to the presentation role, so
    // it is intentionally not included in the accessibility tree. Do not
    // turn decorative images into R2 failures. An explicit image role or a
    // naming attribute overrides the native decorative mapping and remains
    // applicable.
    const hasNamingAttribute =
      img.hasAttribute("aria-label") ||
      img.hasAttribute("aria-labelledby") ||
      img.hasAttribute("title");
    if (
      img.hasAttribute("alt") &&
      !(img.getAttribute("alt") || "").trim() &&
      !explicitRole &&
      !hasNamingAttribute
    ) {
      return;
    }
    if (!isIncludedInAccessibilityTree(img)) return;
    if (!getAccessibleName(img)) {
      results.push({ ruleId: "ACT-R2", type: "Issue", impact: "critical", description: "Image in the accessibility tree has no accessible name", element: outerHtmlSnippet(img), elementContext: elementContextForAI(img), selector: getSelector(img) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R43: SVG element with explicit role has accessible name (WCAG 1.1.1)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("svg[role]").forEach((svg) => {
    if (isProgrammaticallyHidden(svg)) return;
    const role = svg.getAttribute("role");
    if (!role || role === "none" || role === "presentation") return;
    const name = getAccessibleName(svg);
    if (!name) {
      results.push({ ruleId: "ACT-R43", type: "Issue", impact: "serious", description: `SVG element with role="${role}" has no accessible name — add aria-label, aria-labelledby, or a <title> child`, element: outerHtmlSnippet(svg), elementContext: elementContextForAI(svg), selector: getSelector(svg) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R8: Form field has no accessible name (WCAG 1.3.1 / 4.1.2)
  // ════════════════════════════════════════════════════════════════════════
  {
    const r8Seen = new WeakSet<Element>();
    const r8Targets: Element[] = [];
    document.querySelectorAll(
      "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image'])," +
      "select, textarea",
    ).forEach((el) => { r8Seen.add(el); r8Targets.push(el); });
    const r8AriaSelector = ["checkbox","combobox","listbox","menuitemcheckbox","menuitemradio","radio","searchbox","slider","spinbutton","switch","textbox"]
      .map((r) => `[role="${r}"]`).join(",");
    document.querySelectorAll(r8AriaSelector).forEach((el) => {
      if (r8Seen.has(el)) return;
      const tag = el.tagName.toLowerCase();
      if (tag !== "input" && tag !== "select" && tag !== "textarea") r8Targets.push(el);
    });
    for (const el of r8Targets) {
      if (!isVisibleRect(el)) continue;
      if (isProgrammaticallyHidden(el)) continue;
      const explicitRole = el.getAttribute("role");
      if (explicitRole === "none" || explicitRole === "presentation") continue;
      if (!getFormFieldAccessibleName(el)) {
        results.push({ ruleId: "ACT-R8", type: "Issue", impact: "critical", description: "Form field has no associated label, aria-label, or aria-labelledby", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R11: Link has no accessible name (WCAG 2.4.4 / 4.1.2)
  // ════════════════════════════════════════════════════════════════════════
  const ariaLabelWasEmpty: WeakSet<Element> = (window as any).__ariaLabelWasEmpty__ ?? new WeakSet();
  document.querySelectorAll("a[href]").forEach((link) => {
    if (link.getAttribute("aria-hidden") === "true") return;
    const noName = !isCssHidden(link) && !getAccessibleName(link);
    const bareAriaLabel = link.hasAttribute("aria-label") && !(link.getAttribute("aria-label") ?? "").trim();
    const finalName = (link.getAttribute("aria-label") ?? "").trim();
    const isAssetIdLabel = finalName.length >= 12 && /^[A-Za-z0-9]+$/.test(finalName) && /[A-Z]/.test(finalName) && /[0-9]/.test(finalName);
    const jsSetAriaLabel = ariaLabelWasEmpty.has(link) && !(link.textContent ?? "").trim();
    const hadBareAriaLabelInSsr = link.hasAttribute("data-r11-bare-ssr");
    const hadNoNameInSsr = link.hasAttribute("data-r11-no-name-ssr");
    const preStabilityNoName: Set<string> = (window as any).__r11PreStabilityNoName__ ?? new Set();
    const hadNoNamePreStability = preStabilityNoName.has((link.getAttribute("href") ?? "").trim()) && !noName;
    // Alfa parity: Siteimprove's checker evaluates the *final* DOM — a link
    // whose accessible name was added by JavaScript passes. Only links with no
    // accessible name (or a bare aria-label) at scan time fail. The SSR/JS
    // heuristics (asset-ID labels, pre-stability snapshots) over-reported.
    void isAssetIdLabel; void jsSetAriaLabel; void hadBareAriaLabelInSsr; void hadNoNameInSsr; void hadNoNamePreStability;
    if (noName || bareAriaLabel) {
      let description = "Link has no accessible name";
      if (isAssetIdLabel && !noName && !bareAriaLabel) {
        description = `Link aria-label is a non-descriptive asset ID ("${finalName}") — provide a human-readable name`;
      } else if (jsSetAriaLabel || hadBareAriaLabelInSsr || hadNoNameInSsr || hadNoNamePreStability) {
        const jsName = finalName || getAccessibleName(link).substring(0, 60);
        if (bareAriaLabel || hadBareAriaLabelInSsr) {
          description = `Link aria-label was empty in source HTML — accessible name depends on JavaScript ("${jsName || "(still empty)"}") `;
        } else {
          description = `Link had no accessible name in source HTML — accessible name added by JavaScript ("${jsName}")`;
        }
      }
      results.push({ ruleId: "ACT-R11", type: "Issue", impact: "serious", description, element: outerHtmlSnippet(link), elementContext: elementContextForAI(link), selector: getSelector(link) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R12: Button has no accessible name (WCAG 4.1.2)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("button, [role='button']").forEach((btn) => {
    if (isCssHidden(btn)) return;
    if (!getAccessibleName(btn)) {
      results.push({ ruleId: "ACT-R12", type: "Issue", impact: "critical", description: "Button has no accessible name", element: outerHtmlSnippet(btn), elementContext: elementContextForAI(btn), selector: getSelector(btn) });
    }
  });

  // ACT-R94 (menuitem): menuitem has non-empty accessible name
  document.querySelectorAll("[role='menuitem'],[role='menuitemcheckbox'],[role='menuitemradio']").forEach((el) => {
    if (isProgrammaticallyHidden(el)) return;
    if (!getAccessibleName(el)) {
      results.push({ ruleId: "ACT-R94", type: "Issue", impact: "serious", description: `Element with role="${el.getAttribute("role")}" has no accessible name`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R28: Image button has no text alternative (WCAG 1.1.1 / 4.1.2)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("input[type='image']").forEach((el) => {
    if (!isVisible(el)) return;
    if (!getAccessibleName(el)) {
      results.push({ ruleId: "ACT-R28", type: "Issue", impact: "critical", description: "Image button (input[type='image']) is missing a text alternative", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R116: <summary> element has no accessible name (WCAG 4.1.2)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("summary").forEach((el) => {
    if (el.parentElement?.tagName.toLowerCase() !== "details") return;
    if (isProgrammaticallyHidden(el)) return;
    const role = el.getAttribute("role");
    if (role === "none" || role === "presentation") return;
    if (!getAccessibleName(el)) {
      results.push({ ruleId: "ACT-R116", type: "Issue", impact: "serious", description: "<summary> element has no accessible name", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R13: Iframe has no accessible name (WCAG 4.1.2)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("iframe").forEach((el) => {
    // Alfa applicability: only iframes included in the accessibility tree.
    // Hidden/tracking iframes (display:none, aria-hidden, 0/1px boxes,
    // tabindex=-1) are excluded.
    if (el.getAttribute("aria-hidden") === "true") return;
    if (el.getAttribute("tabindex") === "-1") return;
    const csR13 = window.getComputedStyle(el);
    if (csR13.display === "none" || csR13.visibility === "hidden") return;
    const rectR13 = el.getBoundingClientRect();
    if (rectR13.width <= 1 || rectR13.height <= 1) return;
    const title = el.getAttribute("title")?.trim();
    const ariaLabel = el.getAttribute("aria-label")?.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (!title && !ariaLabel && !labelledBy) {
      results.push({ ruleId: "ACT-R13", type: "Issue", impact: "serious", description: "Inline frame (iframe) is missing a title attribute", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R15: Multiple frames with identical accessible names (WCAG 4.1.2)
  // ════════════════════════════════════════════════════════════════════════
  {
    const frameTitles: Record<string, number> = {};
    document.querySelectorAll("iframe[title], frame[title]").forEach((el) => {
      const t = (el.getAttribute("title") || "").toLowerCase().trim();
      if (t) frameTitles[t] = (frameTitles[t] || 0) + 1;
    });
    const titledFrames = Array.from(document.querySelectorAll("iframe[title], frame[title]"));
    titledFrames.forEach((el) => {
      const t = (el.getAttribute("title") || "").toLowerCase().trim();
      if (t && frameTitles[t] > 1) {
        const duplicate = titledFrames.find((other) =>
          other !== el &&
          (other.getAttribute("title") || "").toLowerCase().trim() === t &&
          ((other.getAttribute("src") || other.getAttribute("srcdoc") || "") ===
            (el.getAttribute("src") || el.getAttribute("srcdoc") || "")),
        );
        results.push({
          ruleId: "ACT-R15",
          type: duplicate ? "Issue" : "Potential Issue",
          impact: "moderate",
          description: duplicate
            ? `Multiple inline frames have the same text alternative and source "${el.getAttribute("src") || el.getAttribute("srcdoc") || "unknown"}"`
            : `Multiple frames share the title "${el.getAttribute("title")}" — review whether the frames are identical`,
          element: outerHtmlSnippet(el),
          elementContext: elementContextForAI(el),
          selector: getSelector(el),
        });
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R14: Label in Name (WCAG 2.5.3)
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("input:not([type='hidden']), select, textarea").forEach((el) => {
    if (!isVisibleRect(el)) return;
    const visibleLabel = getVisibleLabel(el);
    const accName = getAccessibleName(el);
    if (!visibleLabel || !accName) return;
    if (!accName.toLowerCase().includes(visibleLabel.toLowerCase())) {
      results.push({ ruleId: "ACT-R14", type: "Issue", impact: "moderate", description: `Visible label "${visibleLabel.substring(0, 60)}" is not included in accessible name "${accName.substring(0, 60)}"`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });
  document.querySelectorAll("a[href], button, [role='button'], [role='link'], [role='tab'], [role='menuitem']").forEach((el) => {
    if (!isVisibleRect(el)) return;
    const hasAriaLabel = el.hasAttribute("aria-label");
    const hasAriaLabelledby = el.hasAttribute("aria-labelledby");
    if (!hasAriaLabel && !hasAriaLabelledby) return;
    if (hasAriaLabelledby) {
      const ids = (el.getAttribute("aria-labelledby") || "").trim().split(/\s+/);
      const allInternal = ids.every(function(id) {
        if (!id) return true;
        const target = document.getElementById(id);
        return target ? el.contains(target) : false;
      });
      if (allInternal) return;
    }
    const rawVisible = (el instanceof HTMLElement ? el.innerText?.replace(/\s+/g, " ")?.trim() : "") || "";
    if (!rawVisible || rawVisible.length < 2) return;
    const visibleText = (() => {
      const words = rawVisible.split(" ");
      if (words.length >= 2) {
        const half = Math.floor(words.length / 2);
        const a = words.slice(0, half).join(" ");
        const b = words.slice(half).join(" ");
        if (a.toLowerCase() === b.toLowerCase()) return a;
      }
      return rawVisible;
    })();
    const accName = getAccessibleName(el);
    if (!accName || accName.length < 2) return;
    const accLower = accName.toLowerCase();
    const visLower = visibleText.toLowerCase();
    const passesSubstring = accLower.includes(visLower);
    const passesTokens = (() => {
      const tokens = [...new Set(visLower.split(/\s+/).filter((t: string) => t.length > 0))];
      return tokens.length > 0 && tokens.every((t: string) => accLower.includes(t));
    })();
    if (!passesSubstring && !passesTokens) {
      results.push({ ruleId: "ACT-R14", type: "Issue", impact: "moderate", description: `Visible text "${visibleText.substring(0, 60)}" is not included in accessible name "${accName.substring(0, 60)}"`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ── Scoring stats: total elements checked per rule ────────────────────────
  const imgEls = Array.from(document.querySelectorAll("img")).filter((img) => !img.closest("noscript")).length;
  if (imgEls > 0) pushStat("ACT-R2", imgEls, "element");
  const svgRoleEls = document.querySelectorAll("svg[role]").length;
  if (svgRoleEls > 0) pushStat("ACT-R43", svgRoleEls, "element");
  const formEls = document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']),select,textarea").length;
  if (formEls > 0) pushStat("ACT-R8", formEls, "element");
  const linkEls = document.querySelectorAll("a[href]").length;
  if (linkEls > 0) pushStat("ACT-R11", linkEls, "element");
  const btnEls = document.querySelectorAll("button,[role='button']").length;
  if (btnEls > 0) pushStat("ACT-R12", btnEls, "element");
  const menuitemEls = document.querySelectorAll("[role='menuitem'],[role='menuitemcheckbox'],[role='menuitemradio']").length;
  if (menuitemEls > 0) pushStat("ACT-R94", menuitemEls, "element");
  const imgBtnEls = document.querySelectorAll("input[type='image']").length;
  if (imgBtnEls > 0) pushStat("ACT-R28", imgBtnEls, "element");
  const summaryEls = document.querySelectorAll("summary").length;
  if (summaryEls > 0) pushStat("ACT-R116", summaryEls, "element");
  const iframeEls = document.querySelectorAll("iframe").length;
  if (iframeEls > 0) pushStat("ACT-R13", iframeEls, "element");
  const frameEls = document.querySelectorAll("iframe[title],frame[title]").length;
  if (frameEls > 0) pushStat("ACT-R15", frameEls, "element");
  // R14 checks two element sets — both count toward total checked
  const r14Batch1 = document.querySelectorAll("input:not([type='hidden']),select,textarea").length;
  const r14Batch2 = document.querySelectorAll("a[href],button,[role='button'],[role='link'],[role='tab'],[role='menuitem']").length;
  const r14Total = r14Batch1 + r14Batch2;
  if (r14Total > 0) pushStat("ACT-R14", r14Total, "element");

  // ════════════════════════════════════════════════════════════════════════
}
