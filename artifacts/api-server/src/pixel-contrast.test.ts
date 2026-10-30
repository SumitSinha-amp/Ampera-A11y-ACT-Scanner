import { describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
import type { Page } from "puppeteer";
import { runPixelContrastPass, type ContrastCandidate } from "./lib/pixel-contrast";

function fixture(overrides: Partial<ContrastCandidate> = {}) {
  const candidate: ContrastCandidate = {
    selector: "div.card > a > span",
    textColor: "rgb(255, 255, 255)",
    bboxX: 10,
    bboxY: 1200,
    bboxW: 60,
    bboxH: 60,
    isLargeText: false,
    isLinkText: true,
    ...overrides,
  };
  const send = vi.fn(async (method: string, options?: { clip?: { height: number } }) => {
    if (method === "Page.getLayoutMetrics") {
      return { cssContentSize: { width: 100, height: 1500 } };
    }
    // Model CDP's viewport-only default unless an explicit clip is supplied.
    const png = new PNG({ width: 100, height: options?.clip?.height ?? 900 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 110;
      png.data[i + 3] = 255;
    }
    return { data: PNG.sync.write(png).toString("base64") };
  });
  const detach = vi.fn();
  const page = {
    evaluate: vi.fn().mockResolvedValue([candidate]),
    createCDPSession: vi.fn().mockResolvedValue({ send, detach }),
  } as unknown as Page;
  return { page, send, detach };
}

const logger = { info: vi.fn(), warn: vi.fn() };

describe("pixel contrast coverage", () => {
  it("expands and restores inner page scrollers around the scanner pixel pass", () => {
    const source = readFileSync(new URL("./lib/scanner.ts", import.meta.url), "utf8");
    expect(source).toContain("const contrastLayout = await expandPageScrollerForSnapshot(page)");
    expect(source).toContain("await restoreSnapshotLayout(page, contrastLayout)");
  });

  it("captures below-fold candidates and preserves nested link classification", async () => {
    const { page, send, detach } = fixture();
    const issues = await runPixelContrastPass(page, logger);
    expect(send).toHaveBeenCalledWith("Page.captureScreenshot", expect.objectContaining({
      clip: { x: 0, y: 0, width: 100, height: 1500, scale: 1 },
    }));
    expect(issues.map((issue) => issue.ruleId)).toEqual(["ACT-R89"]);
    expect(issues[0].description).toContain("(7:1)");
    expect(detach).toHaveBeenCalledOnce();
  });

  it("does not treat a tall multiline small-text box as large text", async () => {
    const { page } = fixture({ isLinkText: false, bboxH: 80 });
    const issues = await runPixelContrastPass(page, logger);
    expect(issues.map((issue) => issue.ruleId)).toEqual(["ACT-R66"]);
    expect(issues[0].description).toContain("(7:1)");
  });

  it("uses the enhanced large-text threshold when font metadata says large", async () => {
    const { page } = fixture({ isLargeText: true });
    expect(await runPixelContrastPass(page, logger)).toEqual([]);
  });

  it("never promotes averaged link-background samples to confirmed R88 failures", async () => {
    const { page } = fixture({ textColor: "rgb(110, 110, 110)" });
    const issues = await runPixelContrastPass(page, logger);
    expect(issues.map(issue => issue.ruleId)).toEqual(["ACT-R89"]);
  });
});
