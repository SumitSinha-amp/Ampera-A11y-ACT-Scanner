import type { PushStatFn, ScanRawResult } from "../types";
import { getAccessibleName } from "../accname";
import { getEffectiveAriaRole } from "../aria-data";
import { composedAncestors } from "../alfa-helpers";
import { isIncludedInAccessibilityTree } from "../visibility";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";

// Alfa R60 includes subclasses of group and counts inputs in their nearest
// group only. Native same-name radio sets additionally need group semantics.
const GROUP_ROLES = new Set([
  "group", "listbox", "menu", "menubar", "radiogroup", "row", "toolbar", "tree", "treegrid",
]);
const INPUT_ROLES = new Set([
  "checkbox", "combobox", "listbox", "menuitemcheckbox", "menuitemradio", "radio",
  "searchbox", "slider", "spinbutton", "switch", "textbox",
]);

function isSemanticallyInactive(element: Element): boolean {
  return [element, ...composedAncestors(element)].some((node) =>
    node.matches("template,noscript,[hidden],[inert],[aria-hidden='true']"));
}

/** A group cannot take its name from arbitrary descendant controls/options. */
function groupName(element: Element): string {
  const root = element.getRootNode() as Document | ShadowRoot;
  const labelledBy = (element.getAttribute("aria-labelledby") || "").trim().split(/\s+/)
    .map((id) => root.getElementById(id))
    .filter((reference): reference is NonNullable<typeof reference> => !!reference && reference !== element)
    .map((reference) => getAccessibleName(reference)
      // Label references and native legends can belong to dormant CSS states.
      // Include their text, but never use the group's own descendant text.
      || reference.textContent?.trim() || "").join(" ").trim();
  if (labelledBy) return labelledBy;
  const label = element.getAttribute("aria-label")?.trim();
  if (label) return label;
  if (element instanceof HTMLFieldSetElement) {
    const legend = element.querySelector(":scope > legend");
    if (legend && !legend.matches("[hidden],[aria-hidden='true']")) {
      const text = getAccessibleName(legend) || legend.textContent?.trim();
      if (text) return text;
    }
  }
  if (getEffectiveAriaRole(element) === "row") return getAccessibleName(element);
  return element.getAttribute("title")?.trim() || "";
}

export function runControlGroupNameRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const controls: Element[] = [];
  const groups = new Set<Element>();
  const visit = (root: ParentNode): void => {
    for (const element of Array.from(root.children)) {
      if (isSemanticallyInactive(element)) continue;
      const role = getEffectiveAriaRole(element);
      if (GROUP_ROLES.has(role)) groups.add(element);
      if (INPUT_ROLES.has(role) && !element.matches("input[type='hidden']")) {
        // Match R8's native-control coverage: CSS-only hiding does not remove
        // the requirement when a menu/dialog opens or a visible label operates
        // a custom-styled radio. ARIA-hidden/inert/hidden markup stays excluded.
        if (element.matches("input,select,textarea") || isIncludedInAccessibilityTree(element)) {
          controls.push(element);
        }
      }
      visit(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(document);

  const counts = new Map<Element, number>();
  const ungroupedRadios = new Map<ParentNode, Map<HTMLFormElement | null, Map<string, HTMLInputElement[]>>>();
  for (const control of controls) {
    const group = composedAncestors(control).find((ancestor) => groups.has(ancestor));
    if (group) {
      counts.set(group, (counts.get(group) || 0) + 1);
      continue;
    }
    if (!(control instanceof HTMLInputElement) || control.type !== "radio" || !control.name.trim()) continue;
    const root = control.getRootNode() as ParentNode;
    if (!ungroupedRadios.has(root)) ungroupedRadios.set(root, new Map());
    const forms = ungroupedRadios.get(root)!;
    if (!forms.has(control.form)) forms.set(control.form, new Map());
    const names = forms.get(control.form)!;
    names.set(control.name, [...(names.get(control.name) || []), control]);
  }

  const checked = new Set<Element>();
  const report = (element: Element, description: string): void => {
    results.push({
      ruleId: "ACT-R60", type: "Issue", impact: "serious", description,
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
  for (const forms of ungroupedRadios.values()) {
    for (const names of forms.values()) {
      for (const [name, radios] of names) {
        if (radios.length < 2) continue;
        const common = composedAncestors(radios[0])
          .find((ancestor) => radios.every((radio) => ancestor.contains(radio))) || radios[0];
        // Distinct radio name sets must remain distinct even if the author
        // omitted their individual wrappers. Avoid page-sized evidence targets.
        const container = common === document.body || common === document.documentElement || checked.has(common)
          ? radios[0] : common;
        checked.add(container);
        report(container, `Related radio control group "${name}" has no programmatically available group name — use a fieldset with a legend or a named radiogroup`);
      }
    }
  }
  if (checked.size) pushStat("ACT-R60", checked.size, "element");
}
