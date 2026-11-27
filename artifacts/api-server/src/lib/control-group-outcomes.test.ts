import { describe, expect, it } from "vitest";
import { controlGroupStateKey, resolveControlGroupOutcomes } from "./control-group-outcomes";

const potential = {
  ruleId: "ACT-R60", type: "Potential Issue", occurrenceKey: "doc-a:1",
  selector: "fieldset.railcard", description: "Hidden popup group requires review",
  interactionStateKey: null as string | null,
};
const verified = {
  ...potential, type: "Best Practice", selector: "fieldset.railcard:nth-of-type(1)",
  description: "Related control group has no accessible name",
  interactionStateKey: "interaction-1",
};

describe("control group outcome reconciliation", () => {
  it("retains one verified finding with its visible evidence despite selector/description changes", () => {
    expect(resolveControlGroupOutcomes([potential, verified])).toEqual([verified]);
    expect(resolveControlGroupOutcomes([verified, potential])).toEqual([verified]);
  });
  it("preserves distinct nodes, documents and rules even with identical selectors", () => {
    const second = { ...verified, occurrenceKey: "doc-a:2" };
    const frame = { ...verified, occurrenceKey: "doc-b:1" };
    const otherRule = { ...potential, ruleId: "ACT-R8" };
    expect(resolveControlGroupOutcomes([potential, verified, second, frame, otherRule]))
      .toEqual([verified, second, frame, otherRule]);
  });
  it("keeps unresolved dormant/inferred reviews and does not guess identities for legacy findings", () => {
    const legacy = { ...verified, occurrenceKey: undefined };
    expect(resolveControlGroupOutcomes([potential, legacy])).toEqual([potential, legacy]);
  });
  it("keys state findings by node and outcome rather than a mutable selector", () => {
    expect(controlGroupStateKey(verified)).not.toBe(controlGroupStateKey(potential));
    expect(controlGroupStateKey(verified)).toBe(controlGroupStateKey({
      ...verified, selector: "changed-selector", description: "different wording",
    }));
    expect(controlGroupStateKey(verified)).not.toBe(controlGroupStateKey({
      ...verified, occurrenceKey: "doc-a:2",
    }));
  });
});
