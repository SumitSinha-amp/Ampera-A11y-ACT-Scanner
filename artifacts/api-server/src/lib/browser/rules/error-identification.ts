import type { PushStatFn, ScanRawResult } from "../types";
import { getAccessibleName } from "../accname";
import { getEffectiveAriaRole } from "../aria-data";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isVisible } from "../visibility";

// Alfa SIA-R82 applicability. Its three oracle questions cannot be answered
// conclusively by a DOM-only scan; all additions here are review questions.
export const ERROR_IDENTIFICATION_ROLES = new Set([
  "checkbox", "combobox", "listbox", "menuitemcheckbox", "menuitemradio",
  "radio", "searchbox", "slider", "spinbutton", "switch", "textbox",
]);
const ERROR_SELECTOR = "[role='alert'],[aria-live],[id*='error' i],[class*='error' i],[class*='invalid' i],[class*='validation' i],[data-valmsg-for]";
const ERROR_WORDS = /\b(error|errors|invalid|incorrect|wrong|failed|required|missing|problem|problems)\b/i;
const clean = (text: string | null | undefined) => (text || "").replace(/\s+/g, " ").trim();
const textOf = (element: Element) => clean(element.textContent).slice(0, 2000);

function ownerForm(element: Element): HTMLFormElement | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement) return element.form;
  const form = element.closest("form");
  if (form) return form;
  // Summaries can live outside their form and be referenced by the form
  // itself; native form-associated controls can also live elsewhere.
  if (element.id) {
    return Array.from(document.forms).find((candidate) =>
      `${candidate.getAttribute("aria-describedby") || ""} ${candidate.getAttribute("aria-errormessage") || ""}`
        .split(/\s+/).includes(element.id)) || null;
  }
  return null;
}

function perceivableText(element: Element): string {
  if (!isVisible(element)) return "";
  const parts: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement && isVisible(node.parentElement)) parts.push(node.textContent || "");
  }
  for (const image of [element, ...element.querySelectorAll("img,[role='img']")]) {
    if (image.matches("img,[role='img']") && isVisible(image)) parts.push(getAccessibleName(image));
  }
  return clean(parts.join(" "));
}

function references(field: Element): { elements: Element[]; missing: string[] } {
  const elements = new Set<Element>();
  const missing = new Set<string>();
  for (const attribute of ["aria-errormessage", "aria-describedby"]) {
    for (const id of clean(field.getAttribute(attribute)).split(/\s+/).filter(Boolean)) {
      const target = document.getElementById(id);
      if (target) elements.add(target);
      else missing.add(id);
    }
  }
  return { elements: [...elements], missing: [...missing] };
}

function labelFor(field: Element): string {
  return clean(getAccessibleName(field) || field.getAttribute("name") || field.id || getEffectiveAriaRole(field));
}

function identifiesField(indicator: Element, field: Element): boolean {
  if (field.id && (indicator.getAttribute("for") === field.id ||
    Array.from(indicator.querySelectorAll("a[href]")).some((link) =>
      link.getAttribute("href") === `#${field.id}`))) return true;
  const name = field.getAttribute("name");
  if (name && indicator.getAttribute("data-valmsg-for") === name) return true;
  const label = labelFor(field).toLowerCase();
  const text = textOf(indicator).toLowerCase();
  // Textual identification remains a human question, even when a likely
  // label match helps us attach the evidence to the appropriate control.
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return label.length >= 3 &&
    new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(text);
}

function localIndicators(field: Element, fields: Element[], indicators: Element[]): Element[] {
  for (let wrapper = field.parentElement, depth = 0;
    wrapper && wrapper.tagName !== "FORM" && depth < 4;
    wrapper = wrapper.parentElement, depth++) {
    if (fields.filter((candidate) => wrapper!.contains(candidate)).length > 1) break;
    const local = indicators.filter((indicator) =>
      wrapper!.contains(indicator) && indicator !== field && !indicator.contains(field));
    if (local.length) return local;
  }
  return [];
}

function currentErrorState(field: Element): boolean {
  const invalid = clean(field.getAttribute("aria-invalid")).toLowerCase();
  if (invalid && invalid !== "false") return true;
  if (field.matches("[class*='invalid' i],[class*='error' i]") ||
    field.parentElement?.matches(".has-error,.is-invalid,.invalid,.error")) return true;
  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement ||
    field instanceof HTMLTextAreaElement) {
    // Read-only validity access: never checkValidity/reportValidity, dispatch
    // input/invalid events, click a submit control, or submit a form.
    return field.willValidate && !field.validity.valid;
  }
  return false;
}

export function runErrorIdentificationReviews(results: ScanRawResult[], pushStat: PushStatFn): void {
  const fields = Array.from(document.querySelectorAll("input,textarea,select,[role]")).filter((field) =>
    field.namespaceURI === "http://www.w3.org/1999/xhtml" &&
    !field.closest("noscript") && !field.matches("input[type='hidden']") &&
    ERROR_IDENTIFICATION_ROLES.has(getEffectiveAriaRole(field)));
  const legacyFields = Array.from(document.querySelectorAll(
    "input[aria-invalid='true'],textarea[aria-invalid='true'],select[aria-invalid='true']",
  ));
  const checked = new Set([...fields, ...legacyFields]);
  if (checked.size) pushStat("ACT-R82", checked.size, "element");

  const legacySelectors = new Set(results.filter((result) =>
    result.ruleId === "ACT-R82" && result.type === "Issue").map((result) => result.selector));
  const indicators = Array.from(document.querySelectorAll(ERROR_SELECTOR)).filter((indicator) => {
    const text = textOf(indicator);
    if (!text || /\b(no errors?|saved successfully|all fields (?:are )?valid)\b/i.test(text)) return false;
    return /error|invalid|validation/i.test(`${indicator.id} ${indicator.getAttribute("class") || ""}`) ||
      indicator.hasAttribute("data-valmsg-for") || ERROR_WORDS.test(text);
  });
  const evidence = new Map(fields.map((field) => {
    const linked = references(field);
    const form = ownerForm(field);
    const matched = indicators.filter((indicator) =>
      ownerForm(indicator) === form && !!form && identifiesField(indicator, field));
    return [field, {
      missing: linked.missing,
      indicators: [...new Set([...linked.elements, ...localIndicators(field, fields, indicators), ...matched])],
      error: currentErrorState(field),
    }];
  }));

  // Generic summaries cannot establish which fields failed. Report the actual
  // summary once rather than manufacturing an occurrence for each form field.
  const genericForms = new Set<HTMLFormElement>();
  const summaries = indicators.filter((indicator) => {
    const form = ownerForm(indicator);
    if (!form || !isVisible(indicator) || !perceivableText(indicator)) return false;
    const formFields = fields.filter((field) => ownerForm(field) === form);
    if (!formFields.length || formFields.some((field) =>
      indicator.contains(field) || evidence.get(field)!.indicators.includes(indicator))) return false;
    return true;
  }).filter((indicator, _index, all) =>
    !all.some((other) => other !== indicator && ownerForm(other) === ownerForm(indicator) && other.contains(indicator)));
  for (const summary of summaries) {
    const form = ownerForm(summary)!;
    genericForms.add(form);
    const formFields = fields.filter((field) => ownerForm(field) === form);
    results.push({
      ruleId: "ACT-R82", type: "Potential Issue", impact: "moderate",
      displayTitle: "Does this form error identify the affected fields?",
      description: "A form-level error indicator is present, but no field-specific association was identified. Verify that it names the affected fields and describes the cause of each error or how to resolve it. A generic message such as “Your form has errors” is insufficient. The affected fields and number of failures require manual verification.",
      element: outerHtmlSnippet(summary), selector: getSelector(summary),
      elementContext: `${elementContextForAI(summary)}\nForm controls to review (not confirmed failures):\n${formFields.map((field) => `${getSelector(field)} (${labelFor(field)})`).join("\n")}`,
    });
  }

  for (const field of fields) {
    const selector = getSelector(field);
    if (legacySelectors.has(selector)) continue; // Preserve every existing Issue.
    const state = evidence.get(field)!;
    const form = ownerForm(field);
    // The summary question already covers unassigned controls in this form.
    if (form && genericForms.has(form) && !state.error && !state.indicators.length && !state.missing.length) continue;
    const notes: string[] = [];
    if (state.missing.length) notes.push(`Referenced description/error elements were not found: ${state.missing.join(", ")}.`);
    if (state.indicators.some((indicator) => !perceivableText(indicator))) {
      notes.push("An associated indicator is hidden, hidden from assistive technology, or lacks perceivable descriptive text. Review visual and screen-reader access; an image alternative may also supply text.");
    }
    if (state.error && !state.indicators.length) notes.push("An invalid value/state or error styling was detected, but no associated textual error indicator was identified.");
    if (!state.error && !state.indicators.length) {
      notes.push("No error indicator is currently observed. This is a review question, not evidence of an error or a confirmed failure. Verify the validation state manually; if no error indicator applies, this review passes.");
    }
    if (state.indicators.length && !state.error) {
      notes.push("Linked text may be help text rather than an error indicator; first establish whether it represents a validation error.");
    }
    notes.push("Review whether an error indicator exists for this field, whether a perceivable indicator identifies the field, and whether a perceivable indicator explains the cause or how to resolve it. The latter two checks may be satisfied by different indicators. Normal scanning does not submit forms or trigger validation.");
    results.push({
      ruleId: "ACT-R82", type: "Potential Issue", impact: "moderate",
      displayTitle: "Does this field have a perceivable, identifying and descriptive error indicator?",
      description: notes.join(" "), element: outerHtmlSnippet(field), selector,
      elementContext: `${elementContextForAI(field)}\nError/help indicator evidence:\n${state.indicators.map((indicator) => `${getSelector(indicator)}\n${elementContextForAI(indicator)}`).join("\n") || "No associated indicator observed."}`,
    });
  }
}
