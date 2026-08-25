/**
 * pixel-contrast.ts — Node.js post-processing pass for contrast rules
 *
 * After the browser rules run and bounding boxes are captured, this module:
 *  1. Reads the indeterminate-background candidates stored by the browser rule
 *     in window.__amperaContrastCandidates.
 *  2. Takes a single full-page PNG screenshot via Puppeteer CDP.
 *  3. Samples a small region of pixels at each candidate's bounding box to
 *     derive the actual rendered background colour.
 *  4. Computes the WCAG contrast ratio and returns new Issue occurrences for
 *     candidates that fail the AA (4.5:1 for normal, 3:1 for large) or AAA
 *     (7:1 / 4.5:1) thresholds — regardless of whether manual-only rules are
 *     enabled.
 *
 * This resolves the main gap between our scanner and Siteimprove for pages
 * that use background-image (url) headers or banners: elements that were
 * previously "Potential Issue" are now classified as confirmed Issues when
 * the pixel evidence supports it.
 */

import type { Page } from "puppeteer";
import { PNG } from "pngjs";

/** Shape written by links-contrast.ts into window.__amperaContrastCandidates */
export interface ContrastCandidate {
  selector: string;
  textColor: string;
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
}

/** A new contrast issue produced by the pixel pass */
export interface PixelContrastIssue {
  ruleId: string;
  type: "Issue";
  impact: "serious" | "minor";
  description: string;
  selector: string;
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
}

// ─── Luminance / ratio helpers (mirroring browser contrast.ts) ───────────────

function toLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parse an rgb/rgba colour string to [r, g, b] (0-255). Returns null on failure. */
function parseRgb(colorStr: string): [number, number, number] | null {
  const m = colorStr.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

// ─── PNG pixel sampling ───────────────────────────────────────────────────────

/**
 * Sample a rectangular region from a decoded PNG and return the average RGB
 * colour, ignoring fully-transparent pixels.
 */
function sampleRegion(
  png: PNG,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number, number] | null {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  const imgW = png.width;
  const imgH = png.height;

  for (let row = y; row < y + h && row < imgH; row++) {
    for (let col = x; col < x + w && col < imgW; col++) {
      const idx = (row * imgW + col) * 4;
      const a = png.data[idx + 3];
      if (a === 0) continue; // skip transparent
      rSum += png.data[idx];
      gSum += png.data[idx + 1];
      bSum += png.data[idx + 2];
      count++;
    }
  }
  if (count === 0) return null;
  return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
}

/** Decode a raw PNG Buffer into a pngjs PNG object. */
function decodePng(buffer: Buffer): Promise<PNG> {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

const MAX_CANDIDATES = 150; // safety cap — don't process runaway pages
const SAMPLE_SIZE = 12;     // sample a SAMPLE_SIZE × SAMPLE_SIZE pixel region

/**
 * Run the pixel contrast post-processing pass on a Puppeteer page.
 *
 * Call this AFTER the DOM contrast rules have run and AFTER bounding boxes have
 * been captured, but BEFORE the JPEG screenshot is taken (we take our own PNG
 * here).
 *
 * Returns an array of new PixelContrastIssue objects to merge into the main
 * issues list.  Existing Potential Issue occurrences for the same selectors
 * should be removed by the caller before merging.
 */
export async function runPixelContrastPass(
  page: Page,
  logger: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void },
): Promise<PixelContrastIssue[]> {
  // 1. Fetch the candidate list left by the browser rule.
  let candidates: ContrastCandidate[] = [];
  try {
    candidates = await page.evaluate(
      () => (window as any).__amperaContrastCandidates ?? [],
    );
  } catch (err) {
    logger.warn({ err }, "pixel-contrast: failed to read candidates from page");
    return [];
  }

  if (candidates.length === 0) return [];
  if (candidates.length > MAX_CANDIDATES) {
    logger.info(
      { total: candidates.length, cap: MAX_CANDIDATES },
      "pixel-contrast: capping candidate count",
    );
    candidates = candidates.slice(0, MAX_CANDIDATES);
  }

  // 2. Take a single full-page PNG screenshot for pixel sampling.
  let png: PNG;
  try {
    const client = await page.createCDPSession();
    const { data: base64 } = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      fromSurface: true,
    });
    await client.detach();
    const pngBuffer = Buffer.from(base64, "base64");
    png = await decodePng(pngBuffer);
    logger.info(
      { width: png.width, height: png.height, candidates: candidates.length },
      "pixel-contrast: screenshot decoded",
    );
  } catch (err) {
    logger.warn({ err }, "pixel-contrast: PNG screenshot failed — skipping pixel pass");
    return [];
  }

  // 3. Sample pixels and compute contrast for each candidate.
  const newIssues: PixelContrastIssue[] = [];
  const seenSelectors = new Set<string>();

  for (const candidate of candidates) {
    if (seenSelectors.has(candidate.selector)) continue;
    seenSelectors.add(candidate.selector);

    const fgRgb = parseRgb(candidate.textColor);
    if (!fgRgb) continue;

    // Sample a patch from the BACKGROUND behind the text.  Use the centre of
    // the element's bbox, inset slightly to avoid hitting border pixels.
    const sampleX = Math.max(0, candidate.bboxX + Math.floor(candidate.bboxW / 4));
    const sampleY = Math.max(0, candidate.bboxY + Math.floor(candidate.bboxH / 4));
    const sampleW = Math.min(SAMPLE_SIZE, Math.max(1, Math.floor(candidate.bboxW / 2)));
    const sampleH = Math.min(SAMPLE_SIZE, Math.max(1, Math.floor(candidate.bboxH / 2)));

    const bgRgb = sampleRegion(png, sampleX, sampleY, sampleW, sampleH);
    if (!bgRgb) continue;

    const fgLum = luminance(...fgRgb);
    const bgLum = luminance(...bgRgb);
    const ratio = contrastRatio(fgLum, bgLum);

    // Determine whether the element has large text (requires additional evaluate).
    // We keep this lightweight — use the stored bbox height as a proxy when
    // evaluating in-page is not worth the round-trip.
    const isLargeText = candidate.bboxH >= 32; // rough proxy: ≥32 px line height
    const aaMin  = isLargeText ? 3   : 4.5;
    const aaaMin = isLargeText ? 4.5 : 7;

    const isLinkSelector = /^a[^a-zA-Z]|^a$/.test(candidate.selector.trim());
    const aaRuleId  = isLinkSelector ? "ACT-R88" : "ACT-R69";
    const aaaRuleId = isLinkSelector ? "ACT-R89" : "ACT-R66";

    if (ratio < aaMin) {
      newIssues.push({
        ruleId: aaRuleId,
        type: "Issue",
        impact: "serious",
        description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AA minimum (${aaMin}:1) — confirmed by pixel sampling of rendered background`,
        selector: candidate.selector,
        bboxX: candidate.bboxX,
        bboxY: candidate.bboxY,
        bboxW: candidate.bboxW,
        bboxH: candidate.bboxH,
      });
    }
    if (ratio < aaaMin) {
      newIssues.push({
        ruleId: aaaRuleId,
        type: "Issue",
        impact: "minor",
        description: `Text contrast ratio ${ratio.toFixed(2)}:1 is below AAA enhanced minimum (${aaaMin}:1) — confirmed by pixel sampling of rendered background`,
        selector: candidate.selector,
        bboxX: candidate.bboxX,
        bboxY: candidate.bboxY,
        bboxW: candidate.bboxW,
        bboxH: candidate.bboxH,
      });
    }
  }

  logger.info(
    { candidates: candidates.length, newIssues: newIssues.length },
    "pixel-contrast: pass complete",
  );
  return newIssues;
}
