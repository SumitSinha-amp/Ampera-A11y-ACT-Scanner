import type { Page } from "puppeteer";
import { getSelectedRuleIds, isRuleSelected } from "./browser/registry";
import type { ScanRawResult } from "./browser/types";
import type { InteractionStateEvidence, ScanIssue } from "./scanner";

interface Options {
  rules?: string[];
  /** Default preserves the standalone Ampera R121 verifier contract. */
  ruleIds?: ("ACT-R65" | "ACT-R121")[];
  budgetMs?: number;
  maxSteps?: number;
  maxFindings?: number;
  captureEvidence: () => Promise<{ screenshot: string; pageHtml: string }>;
}

export async function verifyFocusAppearance(page: Page, options: Options) {
  const issues: ScanIssue[] = [], states: InteractionStateEvidence[] = [];
  const seen = new Set<number>();
  const visitedSelectors: string[] = [];
  let complete = false, error: string | undefined, initialized = false;
  const selected = getSelectedRuleIds(options.rules);
  const enabled = [...new Set(options.ruleIds ?? ["ACT-R121"])]
    .filter(rule => isRuleSelected(rule, selected));
  if (!enabled.length) {
    return { issues, states, visitedSelectors, checked: 0, complete: true, error };
  }
  const primary = enabled.includes("ACT-R65") ? "ACT-R65" : "ACT-R121";
  const started = Date.now(), url = page.url();
  try {
    await page.evaluate(ruleId => {
      const engine = (window as any).__ampera;
      if (typeof engine?.createFocusAppearanceProbe !== "function") throw new Error("Focus appearance probe missing from browser bundle");
      engine.focusAppearanceProbe = engine.createFocusAppearanceProbe(ruleId);
    }, primary);
    initialized = true;
    let incompleteCoverage = false;
    for (let step = 0; step < (options.maxSteps ?? 160); step++) {
      if (Date.now() - started >= (options.budgetMs ?? 12000) ||
        states.length >= (options.maxFindings ?? 80) || page.url() !== url) break;
      await page.keyboard.press("Tab");
      const probe = await page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return (window as any).__ampera.focusAppearanceProbe.inspect();
      }) as { id: number; selector?: string; authorSuppressed?: boolean; unverifiedFrame?: boolean; unverifiedTarget?: boolean; issue?: ScanRawResult; box?: { x: number; y: number; width: number; height: number } };
      if (probe.unverifiedFrame) { incompleteCoverage = true; continue; }
      if (probe.id === 0) { complete = !incompleteCoverage; break; }
      if (seen.has(probe.id)) break; // A focus trap is incomplete coverage.
      seen.add(probe.id);
      if (probe.unverifiedTarget) { incompleteCoverage = true; continue; }
      if (!probe.issue || !probe.box) {
        if (probe.selector) visitedSelectors.push(probe.selector);
        continue;
      }
      const evidence = await options.captureEvidence();
      if (probe.selector) visitedSelectors.push(probe.selector);
      const key = `focus-appearance-${step}`;
      states.push({ key, triggerSelector: probe.issue.selector || "html", triggerLabel: "Keyboard focus (Tab)", ...evidence });
      for (const ruleId of enabled) {
        if (ruleId === "ACT-R121" && !probe.authorSuppressed) continue;
        issues.push({
          ...probe.issue, ruleId, type: "Potential Issue", impact: "serious",
          description: ruleId === primary ? probe.issue.description
            : "Native Tab navigation focused this element with :focus-visible active, author outline suppression was detected, and focus styling requires visual review. Color-only changes do not establish sufficient visibility. Ampera's custom check does not measure the full WCAG 2.4.13 area/contrast requirements.",
          wcagCriteria: ruleId === "ACT-R65" ? "2.4.7" : "2.4.13",
          wcagLevel: ruleId === "ACT-R65" ? "AA" : "AAA",
          remediation: ruleId === "ACT-R65"
            ? "Provide a clearly visible keyboard-focus indicator. Use the focused-state evidence to locate the control and verify WCAG 2.4.7."
            : "Restore the default keyboard-focus indicator or provide a clearly visible replacement. Verify its size and contrast under WCAG 2.4.13.",
          bboxX: probe.box.x, bboxY: probe.box.y, bboxWidth: probe.box.width, bboxHeight: probe.box.height,
          interactionStateKey: key,
        });
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    if (initialized) {
      try {
        await page.evaluate(() => {
          const engine = (window as any).__ampera;
          try { engine.focusAppearanceProbe?.restore(); }
          finally { delete engine.focusAppearanceProbe; }
        });
      } catch (err) { complete = false; error ??= `Focus appearance restoration failed: ${String(err)}`; }
    }
  }
  if (!complete && !error) error = "Keyboard-focus coverage is incomplete: a budget, focus trap, frame, or unverified target prevented full verification.";
  return { issues, states, visitedSelectors, checked: seen.size, complete, error };
}

/** Replace root-document heuristics only where native keyboard coverage exists.
 * Frame-qualified findings require their own document verification.
 */
export function reconcileFocusIndicatorIssues(
  existing: ScanIssue[],
  focus: { issues: ScanIssue[]; complete: boolean; visitedSelectors: string[] },
): ScanIssue[] {
  const visited = new Set(focus.visitedSelectors);
  return [
    ...existing.filter(issue => issue.ruleId !== "ACT-R65" ||
      issue.selector?.includes(" >>> ") ||
      // Root-document coverage does not verify a previously opened popup.
      (!!issue.interactionStateKey && !issue.interactionStateKey.startsWith("focus-appearance-")) ||
      (!focus.complete && !visited.has(issue.selector ?? ""))),
    ...focus.issues,
  ];
}
