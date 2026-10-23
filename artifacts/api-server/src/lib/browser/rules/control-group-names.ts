import type { PushStatFn, ScanRawResult } from "../types";
import { getAccessibleName } from "../accname";
import { getEffectiveAriaRole } from "../aria-data";
import { composedAncestors } from "../alfa-helpers";
import { isIncludedInAccessibilityTree } from "../visibility";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";

// Alfa R60 includes subclasses of group and counts inputs in their nearest
// group only. Plain wrappers and same-name radio sets without a semantic
// group are inapplicable, not inferred R60 targets.
const GROUP_ROLES = new Set([
  "group", "listbox", "menu", "menubar", "radiogroup", "row", "toolbar", "tree", "treegrid",
]);
const INPUT_ROLES = new Set([
  "checkbox", "combobox", "listbox", "menuitemcheckbox", "menuitemradio", "radio",
  "searchbox", "slider", "spinbutton", "switch", "textbox",
]);

/** A dormant popup is reviewable; unrelated hidden markup is not. */
function isPopup(element: Element, popupTargets: Set<Element>): boolean {
  if (popupTargets.has(element) || element.matches("dialog,[popover],[aria-modal='true']") ||
    ["dialog", "alertdialog", "menu"].includes(getEffectiveAriaRole(element))) return true;
  const tokens = `${element.getAttribute("class") || ""} ${element.id}`
    .replace(/([a-z])([A-Z])/g, "$1-$2");
  return /(?:^|[\s_-])(?:overlays?|modals?|popups?|popovers?|dropdowns?|menus?|drawers?|dialogs?)(?:$|[\s_-])/i.test(tokens);
}

/** Ignore the popup's hiding boundary, but not independently inactive children. */
function hiddenBelowPopup(element: Element, popup: Element): boolean {
  const popupVisibility = getComputedStyle(popup).visibility;
  for (const node of [element, ...composedAncestors(element)]) {
    if (node === popup) break;
    if (node.matches("template,noscript,[hidden],[inert],[aria-hidden='true']")) return true;
    if (node instanceof HTMLDetailsElement && !node.open &&
      !node.querySelector(":scope > summary")?.contains(element)) return true;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.getPropertyValue("content-visibility") === "hidden") return true;
    if (["hidden", "collapse"].includes(style.visibility) &&
      !["hidden", "collapse"].includes(popupVisibility)) return true;
  }
  return false;
}

function popupLabelText(element: Element, popup: Element): string {
  if (hiddenBelowPopup(element, popup)) return "";
  if (element instanceof HTMLImageElement) return element.alt;
  return Array.from(element.childNodes).map((child) =>
    child.nodeType === Node.TEXT_NODE ? child.textContent || "" :
      child instanceof Element ? popupLabelText(child, popup) : "").join(" ").trim();
}

/** A group cannot take its name from arbitrary descendant controls/options. */
function groupName(element: Element, popup?: Element): string {
  const root = element.getRootNode() as Document | ShadowRoot;
  const labelledBy = (element.getAttribute("aria-labelledby") || "").trim().split(/\s+/)
    .map((id) => root.getElementById(id))
    .filter((reference): reference is NonNullable<typeof reference> => !!reference && reference !== element)
    .map((reference) => getAccessibleName(reference)
      // Explicit label references can name a group even when hidden.
      // Never use the group's own arbitrary descendant text.
      || reference.textContent?.trim() || "").join(" ").trim();
  if (labelledBy) return labelledBy;
  const label = element.getAttribute("aria-label")?.trim();
  if (label) return label;
  if (element instanceof HTMLFieldSetElement) {
    const legend = element.querySelector(":scope > legend");
    if (legend && (popup ? !hiddenBelowPopup(legend, popup) : isIncludedInAccessibilityTree(legend))) {
      const text = getAccessibleName(legend) || (popup ? popupLabelText(legend, popup) : "");
      if (text) return text;
    }
  }
  if (element instanceof HTMLDetailsElement) {
    const summary = element.querySelector(":scope > summary");
    if (summary && (popup ? !hiddenBelowPopup(summary, popup) : isIncludedInAccessibilityTree(summary))) {
      const text = getAccessibleName(summary) || (popup ? popupLabelText(summary, popup) : "");
      if (text) return text;
    }
  }
  if (getEffectiveAriaRole(element) === "row") {
    return getAccessibleName(element) || (popup ? popupLabelText(element, popup) : "");
  }
  return element.getAttribute("title")?.trim() || "";
}

export function runControlGroupNameRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const controls: Element[] = [];
  const groups = new Set<Element>();
  const popupTargets = new Set<Element>();
  const visit = (root: ParentNode): void => {
    for (const element of Array.from(root.children)) {
      // Templates/fallbacks are not dormant interactive UI.
      if (element.matches("template,noscript")) continue;
      if (element.hasAttribute("aria-expanded") ||
        (element.hasAttribute("aria-haspopup") && element.getAttribute("aria-haspopup") !== "false")) {
        const tree = element.getRootNode() as Document | ShadowRoot;
        for (const id of `${element.getAttribute("aria-controls") || ""} ${element.getAttribute("aria-owns") || ""}`.trim().split(/\s+/)) {
          const target = tree.getElementById(id);
          if (target) popupTargets.add(target);
        }
      }
      const role = getEffectiveAriaRole(element);
      if (element.namespaceURI === "http://www.w3.org/1999/xhtml" && GROUP_ROLES.has(role)) {
        groups.add(element);
      }
      if (INPUT_ROLES.has(role) && !element.matches("input[type='hidden']")) {
        controls.push(element);
      }
      visit(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(document);

  const counts = new Map<Element, number>();
  const dormantCounts = new Map<Element, number>();
  const dormantPopups = new Map<Element, Element | undefined>();
  for (const control of controls) {
    const group = composedAncestors(control).find((ancestor) => groups.has(ancestor));
    if (!group) continue; // Never infer a group from radio names or plain wrappers.
    if (isIncludedInAccessibilityTree(control)) {
      counts.set(group, (counts.get(group) || 0) + 1);
    } else {
      if (!dormantPopups.has(group)) {
        dormantPopups.set(group, [group, ...composedAncestors(group)].find((ancestor) =>
          isPopup(ancestor, popupTargets) && !isIncludedInAccessibilityTree(ancestor)));
      }
      const popup = dormantPopups.get(group);
      if (popup && !hiddenBelowPopup(control, popup)) {
        dormantCounts.set(group, (dormantCounts.get(group) || 0) + 1);
      }
    }
  }

  const checked = new Set<Element>();
  const report = (element: Element, description: string, potential = false): void => {
    results.push({
      ruleId: "ACT-R60", type: "Best Practice", impact: "serious", description,
      ...(potential ? { type: "Potential Issue" as const } : {}),
      element: outerHtmlSnippet(element), elementContext: elementContextForAI(element),
      selector: getSelector(element),
    });
  };
  for (const [group, count] of counts) {
    if (count < 2) continue;
    checked.add(group);
    if (!groupName(group)) {
      report(group, "Related control group has no programmatically available group name — use a fieldset with a legend or a semantic group with aria-label/aria-labelledby");
    }
  }
  for (const [group, count] of dormantCounts) {
    // An exposed group is evaluated by the strict upstream check, never twice.
    if (checked.has(group) || count + (counts.get(group) || 0) < 2) continue;
    checked.add(group);
    if (!groupName(group, dormantPopups.get(group))) {
      report(group, "Hidden popup or overlay contains a semantic control group without a programmatically available group name. Open the popup and verify the group is exposed; add a legend or aria-label/aria-labelledby if it is.", true);
    }
  }
  if (checked.size) pushStat("ACT-R60", checked.size, "element");
}
