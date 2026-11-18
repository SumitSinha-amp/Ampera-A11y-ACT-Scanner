import type { Page } from "puppeteer";
import type { InteractionStateEvidence, RuleCheckStat, ScanIssue } from "./scanner";

/** Explicit close affordances only: never consent, login, navigation or submit. */
export async function findContrastOverlayClose(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || el.closest("[inert]")) return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === "none" || s.visibility !== "visible" || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const selector = (el: Element): string => {
      if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
      const parts: string[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const siblings = n.parentElement ? Array.from(n.parentElement.children).filter(x => x.tagName === n!.tagName) : [n];
        parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(n) + 1})`);
      }
      return parts.join(" > ");
    };
    const closeName = (value: string): boolean => {
      const tokens = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_-]+/).filter(Boolean);
      return tokens.some(t => t === "close" || t === "dismiss") &&
        tokens.every(t => /^(close|dismiss|icon|button|btn|dialog|modal|popup|overlay|window|banner|login|offer)$/.test(t));
    };
    for (const el of document.querySelectorAll("button,[role='button'],[aria-label],[title],[data-testid],[data-test],[data-action]")) {
      const names = [el.getAttribute("aria-label"), el.getAttribute("title"),
        el.getAttribute("data-testid"), el.getAttribute("data-test"), el.getAttribute("data-action")];
      if (el.matches("button,[role='button']")) names.push(el.textContent?.trim() || "");
      if (!names.some(n => n && closeName(n)) || !visible(el)) continue;
      if (el.closest("a[href],input,select,textarea,[contenteditable='true']")) continue;
      const button = el.closest("button");
      if (button && (button.getAttribute("type")?.toLowerCase() === "submit" ||
        button.getAttribute("type")?.toLowerCase() === "reset" || button.form && button.type !== "button")) continue;
      const actionText = [...names, button?.getAttribute("aria-label"), button?.textContent].join(" ");
      if (/\b(delete|remove|reset|submit|save|send|accept|reject|agree|consent|purchase|pay|buy|checkout|account|cancel|unsubscribe|continue|otp|verify|confirm)\b/i.test(actionText)) continue;
      let overlay: Element | null = null;
      for (let n = el.parentElement; n && !n.matches("body,html"); n = n.parentElement) {
        const s = getComputedStyle(n), r = n.getBoundingClientRect();
        const area = Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)) *
          Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top));
        if (visible(n) && (n.matches("dialog[open],[role='dialog'],[role='alertdialog'],[aria-modal='true']") ||
          s.position === "fixed" && area >= innerWidth * innerHeight * 0.25)) {
          overlay = n; break;
        }
      }
      if (!overlay) continue;
      if (/\b(cookie|cookies|consent)\b/i.test(overlay.textContent || "")) continue;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(el === hit || el.contains(hit))) continue;
      return { selector: selector(el), overlaySelector: selector(overlay),
        label: names.find(n => n && closeName(n)) || "Close overlay" };
    }
    return null;
  });
}

/**
 * Run only AFTER baseline screenshots, HTML and QA extraction. A close action
 * may unmount a dialog, so attempting to reconstruct it would falsify evidence.
 */
export async function scanUnobscuredContrast(page: Page, options: {
  baseline: ScanIssue[];
  scan: () => Promise<{ issues: ScanIssue[]; stats: RuleCheckStat[] }>;
  capture: () => Promise<{ screenshot: string; pageHtml: string }>;
}) {
  const issues: ScanIssue[] = [], states: InteractionStateEvidence[] = [], stats: RuleCheckStat[] = [];
  const key = (issue: ScanIssue) => `${issue.ruleId}|${issue.selector}|${issue.type}|${issue.description}`;
  const seen = new Set(options.baseline.map(key));
  const url = page.url();
  let error: string | undefined;
  try {
    // Bounded nested overlays. Never click the same control repeatedly.
    const clicked = new Set<string>();
    for (let index = 0; index < 2; index++) {
      const trigger = await findContrastOverlayClose(page);
      // Earlier safe disclosure/focus exploration may already have dismissed
      // an overlay. Re-evaluate that settled state without inventing a click.
      const settledReview = index === 0 && !trigger && options.baseline.some(i =>
        i.ruleId === "ACT-R69" && i.type === "Potential Issue" &&
        i.description.includes("overlapping non-ancestor"));
      if ((!trigger && !settledReview) || trigger && clicked.has(trigger.selector) || page.url() !== url) break;
      if (trigger) {
        clicked.add(trigger.selector);
        // Hold both nodes: changing nth-of-type paths must never make a
        // disappearing close control resolve to an unrelated sibling action.
        const overlay = await page.$(trigger.overlaySelector);
        if (!overlay) break;
        const close = await page.$(trigger.selector);
        try {
          if (!close || !await overlay.evaluate((root, control) =>
            root.isConnected && control.isConnected && root.contains(control), close)) break;
          await close.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          if (page.url() !== url) throw new Error("Overlay close changed the page URL; unobscured scan was stopped");
          const dismissed = await overlay.evaluate(el => {
            if (!el.isConnected) return true;
            const r = el.getBoundingClientRect(), s = getComputedStyle(el);
            return r.width === 0 || r.height === 0 || s.display === "none" ||
              s.visibility !== "visible" || Number(s.opacity) === 0;
          });
          if (!dismissed) break;
        } finally { await close?.dispose(); await overlay.dispose(); }
      }
      const result = await options.scan();
      stats.push(...result.stats);
      const candidates = result.issues.filter(i => i.ruleId === "ACT-R69" && i.selector && !seen.has(key(i)));
      const boxes = await page.evaluate(selectors => selectors.map(selector => {
        try {
          const el = document.querySelector(selector!);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 ? {
            bboxX: Math.round(r.left + scrollX), bboxY: Math.round(r.top + scrollY),
            bboxWidth: Math.round(r.width), bboxHeight: Math.round(r.height),
          } : null;
        } catch { return null; }
      }), candidates.map(i => i.selector));
      const stateKey = `unobscured-contrast-${index + 1}`;
      const findings = candidates.flatMap((issue, i) => boxes[i] ? [{
        ...issue, ...boxes[i]!, interactionStateKey: stateKey,
      }] : []);
      if (!findings.length) continue;
      // Commit state and findings together, only after evidence succeeds.
      const evidence = await options.capture();
      states.push({ key: stateKey, triggerSelector: trigger?.selector || "body",
        triggerLabel: trigger?.label || "Settled page after prior safe interactions", ...evidence });
      issues.push(...findings);
      findings.forEach(i => seen.add(key(i)));
    }
  } catch (err) { error = err instanceof Error ? err.message : String(err); }
  return { issues, states, stats, error };
}
