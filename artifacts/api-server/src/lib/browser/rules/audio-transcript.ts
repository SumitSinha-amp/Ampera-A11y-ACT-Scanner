import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isProgrammaticallyHidden, isVisible } from "../visibility";
import type { PushStatFn, ScanRawResult } from "../types";
import { getInlineAudioHandlers } from "./audio-player-handlers";
import type { AudioCandidate, AudioTranscriptAssessment } from "./audio-composite";

/**
 * Inspect existing handlers, never invoke them. Some players share a hidden
 * audio backend among many visible samples. Keep evidence on each play control.
 * Unsupported handler shapes remain unknown rather than guessing from card CSS.
 */
export function getScriptedAudioCandidates(): AudioCandidate[] {
  const jq = (window as unknown as {
    jQuery?: { _data?: (element: Element, key: string) => {
      click?: { handler: Function; selector?: string }[];
    } | undefined };
  }).jQuery;
  const candidates: AudioCandidate[] = [];
  const bindings = getInlineAudioHandlers();
  for (const owner of document.querySelectorAll("*")) {
    const handlers = jq?._data?.(owner, "events")?.click ?? [];
    for (const handler of handlers) {
      const code = Function.prototype.toString.call(handler.handler);
      let targets: Element[];
      try {
        targets = handler.selector ? Array.from(owner.querySelectorAll(handler.selector)) : [owner];
      } catch { continue; }
      bindings.push(...targets.map(target => ({ target, code })));
    }
  }
  for (const { target, code } of bindings) {
      // Require a concrete audio target, a data-derived file URL, assignment to
      // that target, and playback. A play icon or marketing card alone is not
      // evidence of an audio sample.
      const media = code.match(/(?:var|let|const)\s+(\w+)\s*=\s*document\.getElementById\(\s*["']([^"']+)["']\s*\)/);
      const attribute = code.match(/(?:var|let|const)\s+(\w+)\s*=\s*\$\(\s*this\s*\)\.attr\(\s*["'](data-[\w-]+)["']\s*\)/);
      const url = code.match(/(?:var|let|const)\s+(\w+)\s*=\s*["']([^"']*)["']\s*\+\s*(\w+)\s*\+\s*["'](\.(?:mp3|wav|ogg|m4a|aac|flac))["']/i);
      if (!media || !attribute || !url || url[3] !== attribute[1]) continue;
      const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\b${escape(media[1])}\\.src\\s*=\\s*${escape(url[1])}\\b`).test(code) ||
          !new RegExp(`\\b${escape(media[1])}\\.play\\s*\\(`).test(code)) continue;
      const audio = document.getElementById(media[2]);
      if (!(audio instanceof HTMLAudioElement)) continue;
        const value = target.getAttribute(attribute[2]);
        if (!value || !isVisible(target) || isProgrammaticallyHidden(target)) continue;
        candidates.push({ target, audio, source: `${url[2]}${value}${url[4]}` });
  }
  return [...new Map(candidates.map(candidate => [candidate.target, candidate])).values()];
}

export function assessAudioTranscript(candidate: AudioCandidate): AudioTranscriptAssessment {
  const { target, audio } = candidate;
  // Preserve the existing transcript detector, but expose its evidence to R30.
  // A transcript/link candidate is not an answered content-equivalence question.
  const references = `${target.getAttribute("aria-describedby") ?? ""} ${audio.getAttribute("aria-describedby") ?? ""}`.split(/\s+/)
    .map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const alternatives = [
    ...references,
    ...Array.from(target.parentElement?.querySelectorAll("a[href],p,figcaption,[role='link']") ?? []),
  ];
  const hasTranscript = alternatives.some(el => {
    if (el === target || el.contains(target) || !isVisible(el) || isProgrammaticallyHidden(el)) return false;
    const text = `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim();
    return /\b(transcript|text alternative|text version)\b/i.test(text) &&
      !/\b(no|not|without|missing|unavailable)\b.{0,80}\b(transcript|text alternative|text version)\b/i.test(text);
  });
  return { ...candidate, transcript: { outcome: "undetermined", candidateDetected: hasTranscript } };
}

export function runAudioTranscriptRule(results: ScanRawResult[], pushStat: PushStatFn): AudioTranscriptAssessment[] {
  const scripted = getScriptedAudioCandidates();
  const backends = new Set(scripted.map(candidate => candidate.audio));
  const candidates: AudioCandidate[] = [...scripted];
  for (const audio of document.querySelectorAll("audio")) {
    if (backends.has(audio) || !isVisible(audio) || isProgrammaticallyHidden(audio)) continue;
    if (!audio.controls && (audio.paused || audio.ended)) continue;
    if (audio.srcObject || audio.duration === Infinity) continue;
    candidates.push({ target: audio, audio });
  }
  const assessments = candidates
    .filter(({ audio }) => !audio.srcObject && audio.duration !== Infinity)
    .map(assessAudioTranscript);
  if (assessments.length) pushStat("ACT-R23", assessments.length, "element");
  for (const { target, source, transcript } of assessments) {
    if (transcript.candidateDetected) continue;
    results.push({
      ruleId: "ACT-R23",
      type: "Potential Issue",
      displayTitle: "Does the audio have a transcript?",
      impact: "serious",
      description: `No associated transcript or transcript link was identified for this audio sample${source ? ` (${source})` : ""}. Review whether a complete, perceivable transcript or equivalent text alternative is available.`,
      element: outerHtmlSnippet(target),
      elementContext: elementContextForAI(target),
      selector: getSelector(target),
    });
  }
  return assessments;
}
