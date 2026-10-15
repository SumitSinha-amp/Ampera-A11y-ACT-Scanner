import { afterEach, describe, expect, it, vi } from "vitest";
import { runMissingMainLandmarkRule } from "./headings-landmarks";
import type { ScanRawResult } from "../types";

vi.mock("../visibility", () => ({
  isRendered: (element: { rendered: boolean }) => element.rendered,
  isProgrammaticallyHidden: (element: { hidden: boolean }) => element.hidden,
  isVisible: () => true,
}));
vi.mock("../dom-helpers", () => ({
  outerHtmlSnippet: () => "<body>Primary content</body>",
  elementContextForAI: () => "Page primary content",
  getSelector: () => "body",
}));

afterEach(() => vi.unstubAllGlobals());

describe("ACT-R99 missing main landmark", () => {
  function scan(landmarks: { rendered: boolean; hidden: boolean }[]) {
    const querySelectorAll = vi.fn().mockReturnValue(landmarks);
    vi.stubGlobal("document", { querySelectorAll, body: {} });
    const results: ScanRawResult[] = [];
    runMissingMainLandmarkRule(results);
    expect(querySelectorAll).toHaveBeenCalledWith("main, [role='main']");
    return results;
  }

  it("reports exactly one Issue without needing a named wrapper or minimum text length", () => {
    expect(scan([])).toMatchObject([{ ruleId: "ACT-R99", type: "Issue", selector: "body" }]);
    expect(scan([])).toHaveLength(1);
  });
  it("does not flag an exposed native or explicit main landmark", () => {
    expect(scan([{ rendered: true, hidden: false }])).toEqual([]);
  });
  it("still flags a page when its only main is not rendered", () => {
    expect(scan([{ rendered: false, hidden: false }])).toHaveLength(1);
  });
  it("still flags a page when its only main is hidden from assistive technology", () => {
    expect(scan([{ rendered: true, hidden: true }])[0]?.type).toBe("Issue");
  });
  it("accepts an exposed main even if another main is hidden", () => {
    expect(scan([{ rendered: false, hidden: true }, { rendered: true, hidden: false }])).toEqual([]);
  });
  it("does not use this missing-landmark rule to report multiple existing mains", () => {
    expect(scan([{ rendered: true, hidden: false }, { rendered: true, hidden: false }])).toEqual([]);
  });
});
