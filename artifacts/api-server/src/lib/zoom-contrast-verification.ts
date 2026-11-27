import type { Page } from "puppeteer";
import type { InteractionStateEvidence, RuleCheckStat, ScanIssue } from "./scanner";

const contrastRule = (id: string) => id === "ACT-R69" || id === "ACT-R103";
const identity = (issue: ScanIssue) => `${issue.ruleId}|${issue.selector}`;

/**
 * A 200% desktop zoom-equivalent state: halve the CSS viewport and double its
 * pixel ratio, preserving the physical screenshot dimensions. Never enlarge
 * fonts individually, change authored styles, click controls or submit forms.
 */
export async function verifyZoomContrast(page: Page, options: {
  baseline: ScanIssue[];
  scan: (spatialContrast: boolean) => Promise<{ issues: ScanIssue[]; stats: RuleCheckStat[] }>;
  capture: () => Promise<{ screenshot: string; pageHtml: string }>;
  budgetMs?: number;
  maxStates?: number;
}) {
  const issues: ScanIssue[] = [], states: InteractionStateEvidence[] = [], stats: RuleCheckStat[] = [];
  const viewport = page.viewport();
  if (!viewport || viewport.isMobile) return { issues, states, stats, complete: false, error: "Desktop viewport unavailable for zoom verification" };
  const original = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const scrollers = await page.evaluateHandle(() => Array.from(document.querySelectorAll("*"))
    .filter(el => el.scrollTop !== 0 || el.scrollLeft !== 0)
    .map(el => ({ el, x: el.scrollLeft, y: el.scrollTop })));
  const baselineFailures = new Set(options.baseline.filter(i => i.type === "Issue").map(identity));
  const seen = new Set<string>(), url = page.url(), started = Date.now();
  let complete = true, error: string | undefined;
  try {
    await page.setViewport({ ...viewport,
      width: Math.max(1, Math.floor(viewport.width / 2)),
      height: Math.max(1, Math.floor(viewport.height / 2)),
      deviceScaleFactor: (viewport.deviceScaleFactor || 1) * 2,
    });
    await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: "instant" }));
    await new Promise(resolve => setTimeout(resolve, 150));
    if (page.url() !== url) throw new Error("Page navigated during zoom verification");
    const discovery = await options.scan(false);
    stats.push(...discovery.stats);
    const allSelectors = [...new Set(discovery.issues.filter(i => contrastRule(i.ruleId) && i.selector &&
      !baselineFailures.has(identity(i))).map(i => i.selector!))];
    const selectors = allSelectors.slice(0, 500);
    if (allSelectors.length > selectors.length) {
      complete = false;
      error = "Zoom contrast candidate limit reached";
    }
    const positions = await page.evaluate(selectors => {
      const positions = new Map<string, { x: number; y: number; overflow: boolean; paintOverflow: number }>();
      const extent = document.scrollingElement || document.documentElement;
      const maxX = Math.max(0, extent.scrollWidth - innerWidth), maxY = Math.max(0, extent.scrollHeight - innerHeight);
      for (const selector of selectors) {
        let el: Element | null;
        try { el = document.querySelector(selector); } catch { continue; }
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const xStep = Math.max(1, innerWidth * 0.65);
        const requestedX = Math.max(0, r.right + scrollX - innerWidth + 12);
        const x = Math.min(maxX, Math.ceil(requestedX / xStep) * xStep);
        const step = Math.max(1, innerHeight * 0.65);
        const y = Math.max(0, Math.min(maxY, Math.floor((r.top + scrollY) / step) * step));
        let paintOverflow = 0;
        for (let node = el.parentElement; node && !node.matches("body,html"); node = node.parentElement) {
          if (getComputedStyle(node).backgroundImage === "none") continue;
          const box = node.getBoundingClientRect();
          if (r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom) paintOverflow = 2;
          else if (r.left < box.left || r.right > box.right || r.top < box.top || r.bottom > box.bottom) paintOverflow = Math.max(paintOverflow, 1);
        }
        const key = `${Math.round(x)}|${Math.round(y)}`;
        const prior = positions.get(key);
        if (!prior) positions.set(key, { x, y, overflow: x > 0, paintOverflow });
        else prior.paintOverflow = Math.max(prior.paintOverflow, paintOverflow);
      }
      // Do not miss the horizontally overflowing region that ordinary vertical
      // page snapshots omit. This is based on layout, never a site selector.
      return [...positions.values()].sort((a, b) => b.paintOverflow - a.paintOverflow ||
        Number(b.overflow) - Number(a.overflow) || a.y - b.y);
    }, selectors);
    const maxStates = options.maxStates ?? 8;
    for (let index = 0; index < positions.length; index++) {
      if (index >= maxStates || Date.now() - started >= (options.budgetMs ?? 12000)) {
        complete = false;
        error = "Zoom contrast state or time limit reached";
        break;
      }
      if (page.url() !== url) throw new Error("Page navigated during zoom verification");
      await page.evaluate(({ x, y }) => window.scrollTo({ left: x, top: y, behavior: "instant" }), positions[index]!);
      await new Promise(resolve => setTimeout(resolve, 80));
      const result = await options.scan(true);
      stats.push(...result.stats);
      const fresh = result.issues.filter(i => contrastRule(i.ruleId) && i.type === "Issue" &&
        i.selector && !baselineFailures.has(identity(i)) && !seen.has(identity(i)));
      const boxes = await page.evaluate(selectors => selectors.map(selector => {
        let el: Element | null;
        try { el = document.querySelector(selector!); } catch { return null; }
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const left = Math.max(0, r.left), top = Math.max(0, r.top);
        const right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
        if (right <= left || bottom <= top) return null;
        // Evidence is a physical-pixel viewport screenshot, not a full-page
        // expansion that would move the very paint boundaries being tested.
        return { bboxX: Math.round(left * devicePixelRatio), bboxY: Math.round(top * devicePixelRatio),
          bboxWidth: Math.round((right - left) * devicePixelRatio), bboxHeight: Math.round((bottom - top) * devicePixelRatio) };
      }), fresh.map(i => i.selector));
      const key = `zoom-contrast-200-${index + 1}`;
      const findings = fresh.flatMap((issue, i) => boxes[i] ? [{
        ...issue, ...boxes[i]!, interactionStateKey: key,
        description: `${issue.description} Verified in a 200% zoom-equivalent desktop layout.`,
      }] : []);
      if (!findings.length) continue;
      const evidence = await options.capture();
      if (!evidence.screenshot || !evidence.pageHtml) throw new Error("Zoom-state evidence was empty");
      if (page.url() !== url) throw new Error("Page navigated before zoom evidence was captured");
      states.push({ key, triggerSelector: findings[0]!.selector || "body",
        triggerLabel: "200% zoom-equivalent contrast verification", ...evidence });
      issues.push(...findings);
      findings.forEach(i => seen.add(identity(i)));
    }
  } catch (err) {
    complete = false;
    error = err instanceof Error ? err.message : String(err);
  } finally {
    try {
      await page.setViewport(viewport);
      await page.evaluate((saved) => {
        for (const { el, x, y } of saved) if (el.isConnected) el.scrollTo({ left: x, top: y, behavior: "instant" });
      }, scrollers);
      await page.evaluate(({ x, y }) => window.scrollTo({ left: x, top: y, behavior: "instant" }), original);
    } catch (err) {
      complete = false;
      error = [error, `Zoom-state restoration failed: ${String(err)}`].filter(Boolean).join("; ");
    }
    await scrollers.dispose().catch(() => {});
  }
  return { issues, states, stats, complete, error };
}
