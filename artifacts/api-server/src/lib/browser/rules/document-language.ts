import type { ScanRawResult, PushStatFn } from "../types";
import { VALID_ROLES } from "../aria-data";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isProgrammaticallyHidden } from "../visibility";

export function runDocumentLanguageRules(results: ScanRawResult[], EMIT_MANUAL_ONLY_RULES: boolean, pushStat: PushStatFn): void {
  // ════════════════════════════════════════════════════════════════════════
  // ACT-R1: Page has no title (WCAG 2.4.2)
  // ════════════════════════════════════════════════════════════════════════
  if (!document.title || document.title.trim() === "") {
    results.push({ ruleId: "ACT-R1", type: "Issue", impact: "serious", description: "Page is missing a title element", element: "<title>", selector: "head > title" });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R114: Page title is not descriptive (WCAG 2.4.2)
  // ════════════════════════════════════════════════════════════════════════
  {
    const title = document.title?.trim();
    if (title && /^(home|index|untitled|page|document|new page|welcome)$/i.test(title)) {
      results.push({ ruleId: "ACT-R114", type: "Issue", impact: "moderate", description: `Page title "${title}" is not descriptive`, element: `<title>${title}</title>`, selector: "head > title" });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R4: HTML element missing lang attribute (WCAG 3.1.1)
  // ════════════════════════════════════════════════════════════════════════
  const htmlEl = document.documentElement;
  if (!htmlEl.getAttribute("lang") || htmlEl.getAttribute("lang")?.trim() === "") {
    results.push({ ruleId: "ACT-R4", type: "Issue", impact: "serious", description: "HTML element is missing lang attribute", element: "<html>", selector: "html" });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R5: lang attribute is not a valid BCP 47 code (WCAG 3.1.1)
  // ════════════════════════════════════════════════════════════════════════
  {
    const lang = htmlEl.getAttribute("lang")?.trim();
    if (lang) {
      const BCP47_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
      if (!BCP47_RE.test(lang)) {
        results.push({ ruleId: "ACT-R5", type: "Issue", impact: "serious", description: `HTML lang attribute "${lang}" is not a valid BCP 47 language code`, element: `<html lang="${lang}">`, selector: "html" });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R6: lang and xml:lang do not agree (WCAG 3.1.1)
  // ════════════════════════════════════════════════════════════════════════
  {
    const lang = htmlEl.getAttribute("lang")?.trim();
    const xmlLang = htmlEl.getAttribute("xml:lang")?.trim();
    if (lang && xmlLang) {
      const primaryLang = lang.split("-")[0].toLowerCase();
      const primaryXml = xmlLang.split("-")[0].toLowerCase();
      if (primaryLang !== primaryXml) {
        results.push({ ruleId: "ACT-R6", type: "Issue", impact: "serious", description: `lang="${lang}" and xml:lang="${xmlLang}" specify different primary language subtags`, element: `<html lang="${lang}" xml:lang="${xmlLang}">`, selector: "html" });
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R7: Element with lang attribute has invalid language tag (WCAG 3.1.2)
  // ════════════════════════════════════════════════════════════════════════
  {
    const BCP47_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
    document.querySelectorAll("[lang]").forEach((el) => {
      if (el === htmlEl) return;
      if (isProgrammaticallyHidden(el)) return;
      const lang = el.getAttribute("lang")?.trim();
      if (!lang) return;
      if (!BCP47_RE.test(lang)) {
        results.push({ ruleId: "ACT-R7", type: "Potential Issue", impact: "moderate", description: `lang attribute "${lang}" is not a valid BCP 47 language tag`, element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
      }
    });
  }

  // ACT-R109 / SIA-R109: Alfa applies this rule only when the document has a
  // valid programmatic language, then asks whether the natural language of the
  // page matches it. The browser rule engine has no language-identification
  // service, so preserve Alfa's applicability and surface the expectation as
  // a Potential Issue for manual language comparison rather than guessing.
  {
    const lang = htmlEl.getAttribute("lang")?.trim();
    const BCP47_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
    const visibleText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    if (EMIT_MANUAL_ONLY_RULES && lang && BCP47_RE.test(lang) && visibleText.length > 0) {
      results.push({
        ruleId: "ACT-R109",
        type: "Potential Issue",
        impact: "moderate",
        description: `Review whether the document's natural language matches lang="${lang}"`,
        element: "<html>",
        elementContext: visibleText.slice(0, 400),
        selector: "html",
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R110: The role attribute must contain at least one valid role token.
  // ════════════════════════════════════════════════════════════════════════
  document.querySelectorAll("[role]").forEach((el) => {
    if (isProgrammaticallyHidden(el)) return;
    const roles = (el.getAttribute("role") || "").trim().split(/\s+/);
    const nonEmptyRoles = roles.filter(Boolean);
    if (nonEmptyRoles.length > 0 && !nonEmptyRoles.some((role) => VALID_ROLES.has(role))) {
      results.push({ ruleId: "ACT-R110", type: "Issue", impact: "serious", description: "The role attribute does not contain a valid role value", element: outerHtmlSnippet(el), elementContext: elementContextForAI(el), selector: getSelector(el) });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // ACT-R3: Duplicate IDs referenced in accessibility relationships (WCAG 4.1.1)
  // ════════════════════════════════════════════════════════════════════════
  {
    const referencedIds = new Set<string>();
    // Siteimprove parity: only naming/description relationships create ambiguity when IDs are duplicated.
    // aria-controls/aria-owns/aria-activedescendant are reference relationships — accordion/tab patterns
    // commonly duplicate those target IDs across widget instances without causing AT confusion.
    document.querySelectorAll("[aria-labelledby],[aria-describedby]").forEach((el) => {
      ["aria-labelledby","aria-describedby"].forEach((attr) => {
        (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean).forEach((id) => referencedIds.add(id));
      });
    });
    document.querySelectorAll("label[for]").forEach((el) => { const v = el.getAttribute("for"); if (v) referencedIds.add(v); });
    document.querySelectorAll("a[href^='#']").forEach((el) => { const h = el.getAttribute("href")!.slice(1); if (h) referencedIds.add(h); });
    const idCountMap: Record<string, number> = {};
    // Alfa parity: only count duplicates among elements that are actually in
    // the accessibility tree — carousel/template clones that are aria-hidden
    // or display:none don't create a conflicting reference for AT users.
    document.querySelectorAll("[id]").forEach((el) => {
      if (!referencedIds.has(el.id)) return;
      if (el.closest("[aria-hidden='true']")) return;
      if (el instanceof HTMLElement && window.getComputedStyle(el).display === "none") return;
      idCountMap[el.id] = (idCountMap[el.id] || 0) + 1;
    });
    for (const [id, count] of Object.entries(idCountMap)) {
      if (count > 1) {
        results.push({ ruleId: "ACT-R3", type: "Issue", impact: "critical", description: `Duplicate ID "${id}" is referenced for accessibility (${count} elements share this ID)`, element: `#${id}`, selector: `[id="${id}"]` });
      }
    }
  }

  // ── Scoring stats: total elements / pages checked per rule ────────────────
  pushStat("ACT-R1",   1, "page");
  pushStat("ACT-R114", 1, "page");
  pushStat("ACT-R4",   1, "page");
  pushStat("ACT-R5",   1, "page");
  pushStat("ACT-R6",   1, "page");
  const langEls = document.querySelectorAll("[lang]").length;
  if (langEls > 0) pushStat("ACT-R7", langEls, "element");
  const roleEls = document.querySelectorAll("[role]").length;
  if (roleEls > 0) pushStat("ACT-R110", roleEls, "element");
  const idEls = document.querySelectorAll("[id]").length;
  if (idEls > 0) pushStat("ACT-R3", idEls, "element");

  // ════════════════════════════════════════════════════════════════════════
}
