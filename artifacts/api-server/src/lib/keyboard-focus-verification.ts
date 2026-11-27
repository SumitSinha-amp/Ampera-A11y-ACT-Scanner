import type { Page } from "puppeteer";
import type { ScanRawResult } from "./browser/types";
import { getSelectedRuleIds, isRuleSelected } from "./browser/registry";
import type { InteractionStateEvidence, ScanIssue } from "./scanner";

interface FocusVerificationOptions {
  rules?: string[];
  maxSteps?: number;
  budgetMs?: number;
  maxFindings?: number;
  /** Additional shorter viewport heights; [] disables responsive verification. */
  viewportHeights?: number[];
  captureEvidence: () => Promise<{ screenshot: string; pageHtml: string }>;
}

/**
 * Bounded, non-activating native keyboard traversal. Never press Enter, Space,
 * click, or type into controls. Both directions matter: browser scroll-into-view
 * can put forward focus behind a footer and reverse focus behind a header.
 */
async function verifyKeyboardFocusAtViewport(page: Page, options: FocusVerificationOptions) {
  const issues: ScanIssue[] = [];
  const states: InteractionStateEvidence[] = [];
  const checked = new Set<number>();
  let complete = true;
  let error: string | undefined;
  if (!isRuleSelected("ACT-R119", getSelectedRuleIds(options.rules))) {
    return { issues, states, checked: 0, complete, error };
  }
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 6500;
  const maxSteps = options.maxSteps ?? 100;
  const maxFindings = options.maxFindings ?? 24;
  const url = page.url();
  let initialized = false;
  try {
    await page.evaluate(() => {
      const engine = (window as any).__ampera;
      if (typeof engine?.createKeyboardFocusProbe !== "function") {
        throw new Error("Keyboard focus verifier missing from browser bundle");
      }
      engine.keyboardFocusProbe = engine.createKeyboardFocusProbe();
    });
    initialized = true;
    const found = new Set<number>();
    for (const reverse of [false, true]) {
      const deadline = started + budgetMs * (reverse ? 1 : 0.5);
      await page.evaluate(() => (window as any).__ampera.keyboardFocusProbe.reset());
      const seen = new Set<number>();
      let finishedDirection = false;
      for (let step = 0; step < Math.ceil(maxSteps / 2); step++) {
        if (Date.now() >= deadline || issues.length >= maxFindings || page.url() !== url) break;
        if (reverse) await page.keyboard.down("Shift");
        try { await page.keyboard.press("Tab"); }
        finally { if (reverse) await page.keyboard.up("Shift"); }
        const probe = await page.evaluate(async () => {
          await new Promise<void>(resolve => {
            // RAF may be throttled on background tabs.
            const timeout = setTimeout(resolve, 80);
            requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve(); }));
          });
          return (window as any).__ampera.keyboardFocusProbe.inspect();
        }) as { id: number; unverifiedFrame?: boolean; issue?: ScanRawResult; box?: { x: number; y: number; width: number; height: number } };
        // Crossing an iframe must not look like a focus trap in its host and
        // terminate the rest of the main document's traversal. Frame-local
        // paint cannot be certified by this main-document probe.
        if (probe.unverifiedFrame) { complete = false; continue; }
        if (probe.id === 0 || seen.has(probe.id)) { finishedDirection = true; break; }
        seen.add(probe.id);
        checked.add(probe.id);
        if (!probe.issue || !probe.box || found.has(probe.id)) continue;
        // Do not silently emit findings with evidence from a different state.
        const evidence = await options.captureEvidence();
        const key = `keyboard-focus-${reverse ? "reverse" : "forward"}-${step}`;
        states.push({
          key, triggerSelector: probe.issue.selector || "html",
          triggerLabel: `Keyboard focus (${reverse ? "Shift+Tab" : "Tab"})`, ...evidence,
        });
        issues.push({
          ...probe.issue, type: "Issue", impact: "serious",
          wcagCriteria: "2.4.11", wcagLevel: "AA",
          remediation: "Keep keyboard-focused controls at least partially visible. Adjust overlapping content or use scroll-padding/scroll-margin for sticky headers and footers.",
          bboxX: probe.box.x, bboxY: probe.box.y,
          bboxWidth: probe.box.width, bboxHeight: probe.box.height,
          interactionStateKey: key,
        });
        found.add(probe.id);
      }
      if (!finishedDirection) complete = false;
    }
  } catch (err) {
    complete = false;
    error = err instanceof Error ? err.message : String(err);
  } finally {
    if (initialized) {
      try {
        await page.evaluate(() => {
          const engine = (window as any).__ampera;
          try { engine.keyboardFocusProbe?.restore(); }
          finally { delete engine.keyboardFocusProbe; }
        });
      } catch (err) {
        complete = false;
        error ??= `Focus restoration failed: ${String(err)}`;
      }
    }
  }
  return { issues, states, checked: checked.size, complete, error };
}

/**
 * Native focus scrolling depends on viewport height. Preserve the authored
 * layout and inspect two common shorter desktop viewports as well as baseline;
 * never simulate an obstruction by manually positioning a focused control.
 */
export async function verifyKeyboardFocus(page: Page, options: FocusVerificationOptions) {
  const viewport = page.viewport();
  const heights = viewport && isRuleSelected("ACT-R119", getSelectedRuleIds(options.rules))
    ? [...new Set([viewport.height, ...(options.viewportHeights ?? [720, 800])
      .filter(height => Number.isFinite(height) && height >= 320 && height < viewport.height)])]
    : [viewport?.height ?? 0];
  const originalScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const issues: ScanIssue[] = [];
  const states: InteractionStateEvidence[] = [];
  const seen = new Set<string>();
  const started = Date.now();
  // One overall budget, divided across viewports, rather than multiplying the
  // scanner's work without a bound. Preserve caller-supplied zero/short budgets.
  const budgetMs = options.budgetMs ?? (heights.length > 1 ? 12000 : 6500);
  const maxFindings = options.maxFindings ?? 24;
  let complete = true;
  let checked = 0;
  let error: string | undefined;
  try {
    for (let index = 0; index < heights.length; index++) {
      if (index > 0 && (Date.now() - started >= budgetMs || issues.length >= maxFindings)) {
        complete = false;
        break;
      }
      if (viewport && index > 0) await page.setViewport({ ...viewport, height: heights[index]! });
      const result = await verifyKeyboardFocusAtViewport(page, {
        ...options,
        maxFindings: Math.max(0, maxFindings - issues.length),
        budgetMs: Math.max(0, (budgetMs - (Date.now() - started)) / (heights.length - index)),
      });
      checked = Math.max(checked, result.checked);
      complete &&= result.complete;
      error ??= result.error;
      const retained = new Set<string>();
      for (const issue of result.issues) {
        const identity = issue.selector ?? issue.element ?? "";
        if (seen.has(identity)) continue;
        seen.add(identity);
        const key = `viewport-${heights[index]}-${issue.interactionStateKey}`;
        retained.add(issue.interactionStateKey!);
        issues.push({ ...issue, interactionStateKey: key });
      }
      states.push(...result.states.filter(state => retained.has(state.key)).map(state => ({
        ...state, key: `viewport-${heights[index]}-${state.key}`,
        triggerLabel: `${state.triggerLabel} — ${viewport?.width ?? "current"}×${heights[index]} viewport`,
      })));
    }
  } finally {
    if (viewport && heights.length > 1) await page.setViewport(viewport);
    await page.evaluate(({ x, y }) => window.scrollTo({ left: x, top: y, behavior: "instant" }), originalScroll).catch(() => {});
  }
  return { issues, states, checked, complete, error };
}
