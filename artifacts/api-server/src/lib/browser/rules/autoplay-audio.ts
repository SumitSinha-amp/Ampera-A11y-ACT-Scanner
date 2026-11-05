import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isIncludedInAccessibilityTree, isVisible } from "../visibility";
import type { PushStatFn, ScanRawResult } from "../types";

export type AutoplayOutcome = "passed" | "failed" | "undetermined";

/** Alfa R50: Trilean.some([R48, R49], isPassed). Missing evidence is not false. */
export function combineAutoplayOutcomes(duration: AutoplayOutcome, mechanism: AutoplayOutcome): AutoplayOutcome {
  if (duration === "passed" || mechanism === "passed") return "passed";
  if (duration === "failed" && mechanism === "failed") return "failed";
  return "undetermined";
}

interface AutoplayAssessment {
  target: Element;
  duration: AutoplayOutcome;
  mechanism: AutoplayOutcome;
  detail: string;
}

/** These are prerequisite assessments, not interpretations of missing R48/R49 findings.
 * A long media container does not prove >3 seconds of audio output, and missing
 * native controls does not prove that no custom pause/stop mechanism exists.
 */
export function assessNativeAutoplay(
  media: HTMLMediaElement,
  hasAudio: (video: HTMLVideoElement) => boolean | "unknown",
): AutoplayAssessment | null {
  if (!media.hasAttribute("autoplay") || media.hasAttribute("paused") ||
    media.hasAttribute("muted") || media.muted || media.volume === 0 ||
    (!media.hasAttribute("src") && !media.querySelector("source"))) return null;
  if (media instanceof HTMLVideoElement && hasAudio(media) === false) return null;
  const short = Number.isFinite(media.duration) && media.duration > 0 && media.playbackRate > 0 &&
    media.duration / media.playbackRate <= 3 && !media.loop;
  // Like Alfa's applicability question, known short media is not a violation.
  if (short) return null;
  const nativeControls = media.controls && isVisible(media) && isIncludedInAccessibilityTree(media) &&
    media.clientWidth > 0 && media.clientHeight > 0;
  return {
    target: media,
    duration: "undetermined",
    mechanism: nativeControls ? "passed" : "undetermined",
    detail: `${media instanceof HTMLVideoElement ? "Video audio presence and " : ""}total automatic audio output require verification. ${
      media.controls
        ? "Native controls exist, but their perceivability must be established."
        : "No native controls are declared; check for an accessible custom pause/stop mechanism."
    }${media.loop ? " Playback loops, so a short source alone cannot establish the three-second exemption." : ""}`,
  };
}

/** Extension beyond Alfa's native-media applicability. Parameters identify a
 * review candidate only; they do not prove successful autoplay or audible output.
 */
export function assessEmbeddedAutoplay(frame: HTMLIFrameElement): AutoplayAssessment | null {
  let url: URL;
  try { url = new URL(frame.getAttribute("src") || "", document.baseURI); } catch { return null; }
  const youtube = /^(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)$/.test(url.hostname) &&
    /^\/embed\/[^/]+/.test(url.pathname);
  const vimeo = url.hostname === "player.vimeo.com" && /^\/video\/\d+/.test(url.pathname);
  if ((!youtube && !vimeo) || !["1", "true"].includes(url.searchParams.get("autoplay") || "") ||
    ["1", "true"].includes(url.searchParams.get("mute") || "") ||
    ["1", "true"].includes(url.searchParams.get("muted") || "") ||
    (vimeo && url.searchParams.get("background") === "1" && !url.searchParams.has("muted"))) return null;
  const rect = frame.getBoundingClientRect();
  const hidden = !isVisible(frame) || rect.width <= 0 || rect.height <= 0 || frame.clientWidth <= 0 || frame.clientHeight <= 0;
  return {
    target: frame, duration: "undetermined", mechanism: "undetermined",
    detail: `${youtube ? "YouTube" : "Vimeo"} embed requests autoplay.${
      hidden ? " The embedded player is hidden or has zero dimensions." : ""
    }${url.searchParams.get("controls") === "0" ? " Player controls are disabled in the URL." : ""}
Playback, audio presence, duration, and an accessible pause/stop mechanism cannot be established from embed parameters. Browser policy, player errors, sign-in or bot challenges may block playback.`,
  };
}

export function runAutoplayAudioRule(
  results: ScanRawResult[],
  pushStat: PushStatFn,
  hasAudio: (video: HTMLVideoElement) => boolean | "unknown",
): void {
  const assessments: AutoplayAssessment[] = [];
  for (const media of document.querySelectorAll<HTMLMediaElement>("audio,video")) {
    const assessment = assessNativeAutoplay(media, hasAudio);
    if (assessment) assessments.push(assessment);
  }
  for (const frame of document.querySelectorAll("iframe")) {
    const assessment = assessEmbeddedAutoplay(frame);
    if (assessment) assessments.push(assessment);
  }
  if (assessments.length) pushStat("ACT-R50", assessments.length, "element");
  for (const { target, duration, mechanism, detail } of assessments) {
    const outcome = combineAutoplayOutcomes(duration, mechanism);
    if (outcome === "passed") continue;
    results.push({
      ruleId: "ACT-R50", type: outcome === "failed" ? "Issue" : "Potential Issue", impact: "serious",
      description: outcome === "failed"
        ? "Automatic audio lasts longer than three seconds and has no perceivable pause/stop mechanism."
        : `Automatic audio control review is unresolved (ACT-R48: ${duration}; ACT-R49: ${mechanism}). ${detail} Verify WCAG 1.4.2, including any independent audio-volume control.`,
      element: outerHtmlSnippet(target), elementContext: elementContextForAI(target), selector: getSelector(target),
    });
  }
}
