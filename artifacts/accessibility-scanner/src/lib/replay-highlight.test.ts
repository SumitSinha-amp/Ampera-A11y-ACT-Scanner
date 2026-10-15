import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { REPLAY_HIGHLIGHT_CONTROLLER } from "./replay-highlight";

function fixture() {
  const parent = {};
  let listener: (event: { source: object; data: unknown }) => void;
  const elements = ["#first", "#second"].map((selector) => ({
    selector,
    highlighted: false,
    scrolls: 0,
    setAttribute() { this.highlighted = true; },
    removeAttribute() { this.highlighted = false; },
    scrollIntoView() { this.scrolls++; },
  }));
  runInNewContext(REPLAY_HIGHLIGHT_CONTROLLER, {
    window: { parent, addEventListener: (_: string, handler: typeof listener) => { listener = handler; } },
    document: {
      querySelectorAll: () => elements.filter((element) => element.highlighted),
      querySelector: (selector: string) => {
        if (selector === "[") throw new Error("Invalid selector");
        return elements.find((element) => element.selector === selector);
      },
    },
  });
  const select = (selector: string | null, showHighlight = true, source = parent) =>
    listener({ source, data: { type: "ampera:replay-highlight", selector, showHighlight, focus: true } });
  return { elements, select };
}

describe("replay highlight updates", () => {
  it("moves the highlight and focus inside the same document", () => {
    const { elements, select } = fixture();
    select("#first");
    expect(elements[0].highlighted).toBe(true);
    select("#second");
    expect(elements.map((element) => element.highlighted)).toEqual([false, true]);
    expect(elements.map((element) => element.scrolls)).toEqual([1, 1]);
  });

  it("hides and restores the highlight without losing focus support", () => {
    const { elements, select } = fixture();
    select("#first");
    select("#first", false);
    expect(elements[0].highlighted).toBe(false);
    select("#first");
    expect(elements[0].highlighted).toBe(true);
  });

  it("ignores messages from other windows", () => {
    const { elements, select } = fixture();
    select("#first");
    select("#second", true, {});
    expect(elements.map((element) => element.highlighted)).toEqual([true, false]);
  });

  it("handles missing, cleared, and invalid selectors without throwing", () => {
    const { elements, select } = fixture();
    select("#first");
    expect(() => select("[")).not.toThrow();
    expect(() => select("#missing")).not.toThrow();
    expect(() => select(null)).not.toThrow();
    expect(elements.every((element) => !element.highlighted)).toBe(true);
  });

  it("loads evidence only by page/state and does not remount for Focus", () => {
    const source = readFileSync(new URL("../components/element-viewer.tsx", import.meta.url), "utf8");
    const replay = source.slice(source.indexOf("export function HtmlReplayView"), source.indexOf("// ──", source.indexOf("export function HtmlReplayView") + 1));
    expect(replay).toContain("}, [pageId, interactionStateId]);");
    expect(replay).not.toContain("key={focusTrigger}");
    expect(replay).toContain('sandbox="allow-scripts"');
    expect(replay).not.toContain("allow-same-origin");
  });
});
