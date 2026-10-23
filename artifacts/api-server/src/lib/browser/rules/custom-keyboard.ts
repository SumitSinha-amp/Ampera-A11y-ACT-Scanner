import type { PushStatFn, ScanRawResult } from "../types";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isActuallyTabbable, isProgrammaticallyHidden, isVisible } from "../visibility";

const NATIVE_CONTROL = "a[href],area[href],button,input,select,textarea,summary,details,label,option";
const POPUP = ".dropdown-menu,.dropdown-content,.submenu,.sub-menu,.menu-panel,[role='menu'],[role='listbox'],[role='tree'],[role='grid'],[role='dialog'],[popover]";
const POPUP_CONTROL = "a[href],button:not([disabled]),input:not([type='hidden']):not([disabled]),select:not([disabled]),textarea:not([disabled]),[role='menuitem'],[role='menuitemcheckbox'],[role='menuitemradio'],[role='option']";
const COMPOSITE = "[role='menu'],[role='menubar'],[role='toolbar'],[role='tablist'],[role='tree'],[role='listbox'],[role='grid']";
const DROPDOWN_TRIGGER = ".dropdown-toggle,.dropdown-trigger,.menu-trigger,[data-toggle='dropdown'],[data-bs-toggle='dropdown'],[aria-haspopup]:not([aria-haspopup='false']),[aria-expanded][aria-controls]";

function popupFor(trigger: Element): Element | null {
  for (const attribute of ["aria-controls", "aria-owns"]) {
    for (const id of (trigger.getAttribute(attribute) || "").trim().split(/\s+/)) {
      const popup = id ? document.getElementById(id) : null;
      if (popup && popup !== trigger && !popup.contains(trigger)) return popup;
    }
  }
  for (const attribute of ["data-target", "data-bs-target"]) {
    const selector = trigger.getAttribute(attribute);
    if (!selector?.startsWith("#")) continue;
    try {
      const popup = document.querySelector(selector);
      if (popup && popup !== trigger && !popup.contains(trigger)) return popup;
    } catch { /* Invalid author-provided selector is not interaction evidence. */ }
  }
  // Stay within the immediate wrapper: a header-wide search can accidentally
  // associate an unrelated menu or decorative chevron with a real dropdown.
  return Array.from(trigger.parentElement?.children || []).find((child) =>
    child !== trigger && child.matches(POPUP),
  ) || null;
}

function hasKeyboardEntry(trigger: Element, popup: Element): boolean {
  if (isActuallyTabbable(trigger) ||
    Array.from(trigger.querySelectorAll("*")).some((child) =>
      !popup.contains(child) && isActuallyTabbable(child))) return true;

  for (let parent = trigger.parentElement; parent; parent = parent.parentElement) {
    if (parent.matches("button,a[href],[role='button'],[role='link']") &&
      isActuallyTabbable(parent)) return true;
  }
  // A negative tabindex is valid in a roving-tabindex / aria-activedescendant
  // composite. Static DOM analysis cannot disprove its arrow-key behavior.
  const composite = trigger.closest(COMPOSITE);
  if (composite && (isActuallyTabbable(composite) ||
    Array.from(composite.querySelectorAll("*")).some(isActuallyTabbable))) return true;

  if (popup.id) {
    for (const alternate of document.querySelectorAll("[aria-controls],[aria-owns],[data-target],[data-bs-target]")) {
      if (alternate === trigger || !isActuallyTabbable(alternate)) continue;
      const ids = `${alternate.getAttribute("aria-controls") || ""} ${alternate.getAttribute("aria-owns") || ""}`.split(/\s+/);
      if (ids.includes(popup.id) || popupFor(alternate) === popup) return true;
    }
  }
  return false;
}

/** ACT-R107 covers custom controls, not a blanket ban on negative tabindex. */
export function runCustomKeyboardRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const checked = new Set<Element>();
  const reported = new Set<Element>();
  const eligible = (element: Element) =>
    !element.matches(NATIVE_CONTROL) &&
    !element.matches("[disabled],[aria-disabled='true']") &&
    !isProgrammaticallyHidden(element) && isVisible(element);

  // Preserve the existing explicit inline-handler check.
  document.querySelectorAll("[onclick],[ondblclick]").forEach((element) => {
    if (!eligible(element)) return;
    checked.add(element);
    const tabbable = isActuallyTabbable(element);
    const keyboardHandler = element.getAttribute("onkeydown") ||
      element.getAttribute("onkeyup") || element.getAttribute("onkeypress");
    if (tabbable && keyboardHandler) return;
    reported.add(element);
    results.push({
      ruleId: "ACT-R107", type: "Issue", impact: "serious",
      description: `<${element.localName}> has an inline pointer handler but is ${!tabbable ? "not in the keyboard tab order" : "missing an inline keyboard event handler (onkeydown)"}`,
      element: outerHtmlSnippet(element), elementContext: elementContextForAI(element),
      selector: getSelector(element),
    });
  });

  document.querySelectorAll(DROPDOWN_TRIGGER).forEach((trigger) => {
    if (!eligible(trigger) || reported.has(trigger)) return;
    const popup = popupFor(trigger);
    if (!popup || !popup.querySelector(POPUP_CONTROL)) return;
    checked.add(trigger);
    if (hasKeyboardEntry(trigger, popup)) return;
    reported.add(trigger);
    results.push({
      ruleId: "ACT-R107", type: "Potential Issue", impact: "serious",
      displayTitle: "Is this custom dropdown operable with a keyboard?",
      description: "Custom dropdown trigger is not in the keyboard tab order, and no keyboard-accessible trigger was identified for its popup. Verify that keyboard users can open the dropdown and operate its controls; hover or mouse-only access would fail WCAG 2.1.1. Missing tabindex and negative tabindex are both possible causes, but negative tabindex alone is not a failure.",
      element: outerHtmlSnippet(trigger),
      elementContext: `${elementContextForAI(trigger)}\nAssociated dropdown: ${getSelector(popup)}\n${elementContextForAI(popup)}`,
      selector: getSelector(trigger),
    });
  });
  if (checked.size) pushStat("ACT-R107", checked.size, "element");
}
