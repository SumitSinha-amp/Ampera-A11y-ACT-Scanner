import type { Page } from "puppeteer";
import type { InteractionStateEvidence, ScanIssue } from "./scanner";

/** Inspect actual scroll-revealed controls without overriding authored visibility. */
export async function verifyScrollTargets(page: Page, options: {
  scan: () => Promise<{ issues: ScanIssue[] }>;
  captureEvidence: () => Promise<{ screenshot: string; pageHtml: string }>;
  budgetMs?: number;
  maxStates?: number;
}): Promise<{ issues: ScanIssue[]; states: InteractionStateEvidence[]; complete: boolean }> {
  const issues: ScanIssue[] = [];
  const states: InteractionStateEvidence[] = [];
  const start = Date.now();
  const original = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  let complete = true;
  const seen = new Set<number>();
  try {
    const positions = await page.evaluate(() => {
      const step = Math.max(200, innerHeight * 0.7);
      const positions = new Set<number>();
      const targets = document.querySelectorAll(
        "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[tabindex],[onclick]",
      );
      for (const el of targets) {
        const box = el.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0 || (box.width >= 24 && box.height >= 24)) continue;
        let hidden = false;
        let transparent = false;
        for (let node: Element | null = el; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" ||
            node.matches("[hidden],[inert]")) hidden = true;
          if (parseFloat(style.opacity) === 0) transparent = true;
        }
        if (!hidden && transparent) {
          positions.add(Math.max(0, Math.floor((box.top + scrollY - innerHeight * 0.2) / step) * step));
        }
      }
      return [...positions].sort((a, b) => a - b);
    });
    // Node identity, not a class-bearing selector, stays stable as carousels advance.
    const identities = await page.evaluateHandle(() => ({ nodes: new WeakMap<Element, number>(), next: 0 }));
    try {
      for (let index = 0; index < positions.length; index++) {
        if (index >= (options.maxStates ?? 20) || Date.now() - start > (options.budgetMs ?? 18000)) {
          complete = false;
          break;
        }
        await page.evaluate(y => window.scrollTo({ top: y, behavior: "instant" }), positions[index]!);
        // Allow scroll listeners, reveal delays and transitions to finish. Never
        // force opacity: permanently hidden content must remain inapplicable.
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await options.scan();
        const candidates = result.issues.filter(issue => issue.ruleId === "ACT-R113");
        const boxes = await page.evaluate((identity, selectors) => selectors.map(selector => {
          let el: Element | null = null;
          try { el = selector ? document.querySelector(selector) : null; } catch { return null; }
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return null;
          let id = identity.nodes.get(el);
          if (id === undefined) { id = ++identity.next; identity.nodes.set(el, id); }
          return { id, x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        }), identities, candidates.map(issue => issue.selector));
        const fresh = candidates.flatMap((issue, i) => {
          const box = boxes[i];
          if (!box || seen.has(box.id)) return [];
          seen.add(box.id);
          return [{ ...issue, bboxX: box.x, bboxY: box.y,
            bboxWidth: box.width, bboxHeight: box.height }];
        });
        if (!fresh.length) continue;
        const key = `scroll-target-${index + 1}`;
        const evidence = await options.captureEvidence();
        states.push({ key, triggerSelector: fresh[0]!.selector ?? "body",
          triggerLabel: "Scroll-revealed target controls", ...evidence });
        issues.push(...fresh.map(issue => ({ ...issue, interactionStateKey: key })));
      }
    } finally {
      await identities.dispose();
    }
  } finally {
    await page.evaluate(({ x, y }) => window.scrollTo({ left: x, top: y, behavior: "instant" }), original).catch(() => {});
  }
  return { issues, states, complete };
}
