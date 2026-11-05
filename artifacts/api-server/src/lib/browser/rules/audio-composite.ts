import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";

export type AudioAlternativeOutcome = "passed" | "failed" | "undetermined";

export interface AudioAlternativeEvidence {
  outcome: AudioAlternativeOutcome;
  /** Markup hint only; never sufficient to establish content equivalence. */
  candidateDetected: boolean;
}

export interface AudioCandidate {
  target: Element;
  audio: HTMLAudioElement;
  source?: string;
}

export interface AudioTranscriptAssessment extends AudioCandidate {
  transcript: AudioAlternativeEvidence;
}

export interface AudioCompositeAssessment extends AudioTranscriptAssessment {
  mediaAlternative: AudioAlternativeEvidence;
}

/** Alfa R30: Trilean.some([R23, R29], isPassed).
 * Only verified constituent outcomes can establish a pass/failure. Unknown
 * content equivalence must not be converted into false by a keyword heuristic.
 */
export function combineAudioAlternativeOutcomes(
  transcript: AudioAlternativeOutcome,
  mediaAlternative: AudioAlternativeOutcome,
): AudioAlternativeOutcome {
  if (transcript === "passed" || mediaAlternative === "passed") return "passed";
  if (transcript === "failed" && mediaAlternative === "failed") return "failed";
  return "undetermined";
}

export function assessAudioMediaAlternative(candidateDetected: boolean): AudioAlternativeEvidence {
  // R29's audio-as-an-alternative-for-text question requires a human judgment
  // about the content and its visible identifying label. Preserve the existing
  // detector's hints without treating the absence of an emitted R29 as a pass.
  return { outcome: "undetermined", candidateDetected };
}

export function runAudioCompositeRule(
  assessments: readonly AudioCompositeAssessment[],
  results: ScanRawResult[],
  pushStat: PushStatFn,
): void {
  const unique = [...new Map(assessments.map(item => [item.target, item])).values()];
  if (unique.length) pushStat("ACT-R30", unique.length, "element");
  for (const { target, source, transcript, mediaAlternative } of unique) {
    const outcome = combineAudioAlternativeOutcomes(transcript.outcome, mediaAlternative.outcome);
    if (outcome === "passed") continue;
    const candidateDetected = transcript.candidateDetected || mediaAlternative.candidateDetected;
    results.push({
      ruleId: "ACT-R30",
      type: outcome === "failed" ? "Issue" : "Potential Issue",
      impact: "serious",
      description: outcome === "failed"
        ? "Audio has no accessible text alternative: both the transcript requirement (ACT-R23) and the audio-as-an-alternative-for-text requirement (ACT-R29) failed."
        : `Audio text-alternative review is unresolved (ACT-R23: ${transcript.outcome}; ACT-R29: ${mediaAlternative.outcome}). ${candidateDetected
          ? "Possible transcript or alternative markup was detected, but its completeness, accessibility, and equivalence have not been verified."
          : "No transcript or equivalent text-alternative markup was identified by the existing checks."} Verify whether either requirement is satisfied.${source ? ` Audio sample: ${source}` : ""}`,
      element: outerHtmlSnippet(target),
      elementContext: elementContextForAI(target),
      selector: getSelector(target),
    });
  }
}
