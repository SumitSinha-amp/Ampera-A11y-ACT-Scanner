import eld from "eld/extrasmall";
import { francAll } from "franc-min";
import type { PushStatFn, ScanRawResult } from "../types";
import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import { isProgrammaticallyHidden } from "../visibility";
import { hasRegisteredPrimaryLanguage } from "./language-declarations";

function normalize(text: string): string {
  return text.normalize("NFC")
    .replace(/https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function primary(code: string): string | null {
  if (!code || code === "und") return null;
  try { return new Intl.Locale(code).language; }
  catch { return null; }
}

function scriptMatches(text: string, language: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  const script = new Intl.Locale(language).maximize().script;
  if (!script || !letters.length) return false;
  // Unicode has composite locale scripts for Japanese/Korean.
  const pattern = script === "Jpan" ? /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
    : script === "Kore" ? /[\p{Script=Hangul}\p{Script=Han}]/u
    : script === "Hans" || script === "Hant" ? /\p{Script=Han}/u
    : new RegExp(`\\p{Script=${script}}`, "u");
  return letters.filter(letter => pattern.test(letter)).length / letters.length >= 0.85;
}

/**
 * Independent statistical evidence, not grammar verification or a probability.
 * ELD uses word-boundary byte patterns; franc uses character-trigram profiles.
 * Disagreement is an abstention, never a reason to prescribe a lang value.
 */
export function detectPrimaryLanguage(text: string): string | null {
  const normalized = normalize(text);
  const letters = normalized.match(/\p{L}/gu) ?? [];
  if (letters.length < 40) return null;
  const candidate = eld.detect(normalized);
  const language = primary(candidate.language);
  if (!language || !candidate.isReliable()) return null;
  const rankings = francAll(normalized, { minLength: 40 });
  if (primary(rankings[0]?.[0] ?? "") !== language) return null;
  const lead = (rankings[0]?.[1] ?? 0) - (rankings[1]?.[1] ?? 0);
  const isLatin = /\p{Script=Latin}/u.test(letters.join(""));
  if (lead < (isLatin && letters.length < 100 ? 0.2 : 0.1)) return null;
  if (!scriptMatches(normalized, language)) return null;
  return language;
}

// Exported for legacy detector callers. A heading never borrows an unverified
// language from its neighbour, and is not itself emitted as a review target.
export function detectHeadingLanguageWithAdjacentText(
  heading: string, adjacent: string, documentPrimary: string,
): string | null {
  const language = detectPrimaryLanguage(adjacent);
  return language && language !== documentPrimary &&
    detectPrimaryLanguage(`${heading} ${adjacent}`) === language ? language : null;
}

function coherent(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 60) return false;
  const words = text.match(/[\p{L}\p{M}]+/gu) ?? [];
  // Unspaced East Asian prose cannot use the Latin word-count gate.
  const unspaced = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Hangul}\p{Script=Thai}]/u.test(text);
  return unspaced || words.length >= 8;
}

/** Long/mixed passages must agree across independently detectable sentences. */
function passageLanguage(text: string): string | null {
  const language = detectPrimaryLanguage(text);
  if (!language) return null;
  const sentences = text.match(/[^.!?。！？।]+[.!?。！？।]*/gu) ?? [text];
  for (const sentence of sentences) {
    if ((sentence.match(/\p{L}/gu) ?? []).length < 40) continue;
    const local = eld.detect(normalize(sentence));
    if (local.isReliable() && primary(local.language) !== language) return null;
  }
  return language;
}

const BLOCKS = "p,li,blockquote,dd,figcaption,div";
const BOUNDARIES = "p,li,blockquote,dd,figcaption,div,section,article,ul,ol,dl,table,nav,header,footer,h1,h2,h3,h4,h5,h6";

function passageText(el: Element): string {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    const languageOwner = parent?.closest("[lang]");
    if (parent && (!languageOwner || languageOwner === document.documentElement) &&
        !parent.closest("script,style,noscript,template") &&
        !isProgrammaticallyHidden(parent)) {
      parts.push(node.textContent ?? "");
    }
    node = walker.nextNode();
  }
  return normalize(parts.join(" "));
}

export function runLanguagePartsReviewRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  const documentLanguage = document.documentElement.getAttribute("lang") ?? "";
  const documentPrimary = hasRegisteredPrimaryLanguage(documentLanguage) ? primary(documentLanguage) : null;
  // Do not infer both sides of a mismatch. R4/R5 handle absent/invalid page lang.
  if (!documentPrimary) return;
  const targets = Array.from(document.body?.querySelectorAll(BLOCKS) ?? [])
    .filter(el => !isProgrammaticallyHidden(el) &&
      (!el.closest("[lang]") || el.closest("[lang]") === document.documentElement) &&
      !el.querySelector(BOUNDARIES));
  let checked = 0;
  const consumed = new Set<Element>();
  for (const el of targets) {
    if (consumed.has(el)) continue;
    let text = passageText(el);
    if (!text) continue;
    // Join only adjacent prose paragraphs that independently agree. Never
    // borrow evidence from nav labels, headings, buttons, or a lang boundary.
    const next = el.nextElementSibling;
    if (!coherent(text) && el.matches("p") && next?.matches("p") && targets.includes(next)) {
      const adjacent = passageText(next);
      const ownLanguage = detectPrimaryLanguage(text);
      if (ownLanguage && ownLanguage === detectPrimaryLanguage(adjacent)) {
        text = `${text} ${adjacent}`;
        consumed.add(next);
      }
    }
    if (!coherent(text)) continue;
    checked++;
    const language = passageLanguage(text);
    if (!language || language === documentPrimary) continue;
    results.push({
      ruleId: "ACT-R132", type: "Potential Issue", impact: "moderate",
      displayTitle: "Review: possible language change",
      description: `Independent text detectors suggest "${language}" in a passage inheriting "${documentPrimary}". This is not a confirmed WCAG failure. A reviewer must verify the actual language, proper-name/borrowed-word exceptions, and whether a local lang declaration is needed. Suggested passage: ${JSON.stringify(text.slice(0, 600))}`,
      selector: getSelector(el), element: outerHtmlSnippet(el),
      elementContext: elementContextForAI(el),
    });
  }
  if (checked) pushStat("ACT-R132", checked, "element");
}

export function verifyLanguageReviewBundle(): boolean {
  return detectPrimaryLanguage(
    "This accessibility scanner verifies that English language detection is fully bundled and available in the browser runtime.",
  ) === "en";
}
