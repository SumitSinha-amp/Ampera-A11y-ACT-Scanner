import { describe, expect, it, vi } from "vitest";
import {
  assessAudioMediaAlternative,
  combineAudioAlternativeOutcomes,
  runAudioCompositeRule,
  type AudioAlternativeOutcome,
} from "./audio-composite";
import type { ScanRawResult } from "../types";

vi.mock("../dom-helpers", () => ({
  elementContextForAI: () => "Audio sample",
  getSelector: () => "#sample",
  outerHtmlSnippet: () => '<audio id="sample" controls></audio>',
}));

describe("Alfa R30 three-valued composite", () => {
  it.each<[AudioAlternativeOutcome, AudioAlternativeOutcome, AudioAlternativeOutcome]>([
    ["passed", "passed", "passed"],
    ["passed", "failed", "passed"],
    ["passed", "undetermined", "passed"],
    ["failed", "passed", "passed"],
    ["undetermined", "passed", "passed"],
    ["failed", "failed", "failed"],
    ["failed", "undetermined", "undetermined"],
    ["undetermined", "failed", "undetermined"],
    ["undetermined", "undetermined", "undetermined"],
  ])("R23 %s and R29 %s produce %s", (transcript, alternative, expected) => {
    expect(combineAudioAlternativeOutcomes(transcript, alternative)).toBe(expected);
  });
  it.each([true, false])("does not turn a markup hint (%s) into a verified R29 answer", candidateDetected => {
    expect(assessAudioMediaAlternative(candidateDetected)).toEqual({
      outcome: "undetermined", candidateDetected,
    });
  });
  it.each<[AudioAlternativeOutcome, AudioAlternativeOutcome, string | null]>([
    ["passed", "undetermined", null],
    ["failed", "passed", null],
    ["failed", "failed", "Issue"],
    ["failed", "undetermined", "Potential Issue"],
    ["undetermined", "failed", "Potential Issue"],
    ["undetermined", "undetermined", "Potential Issue"],
  ])("emits the correct finding for verified R23 %s and R29 %s", (r23, r29, type) => {
    const results: ScanRawResult[] = [];
    const pushStat = vi.fn();
    const assessment = {
      target: {} as Element, audio: {} as HTMLAudioElement,
      transcript: { outcome: r23, candidateDetected: true },
      mediaAlternative: { outcome: r29, candidateDetected: false },
    };
    runAudioCompositeRule([assessment, assessment], results, pushStat);
    expect(pushStat).toHaveBeenCalledExactlyOnceWith("ACT-R30", 1, "element");
    if (type === null) expect(results).toHaveLength(0);
    else {
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ruleId: "ACT-R30", type, selector: "#sample" });
    }
  });
});
