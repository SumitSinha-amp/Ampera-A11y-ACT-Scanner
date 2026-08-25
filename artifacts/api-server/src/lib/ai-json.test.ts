import { describe, expect, it } from "vitest";
import { parseProviderJson } from "./ai-json";
import { extractGeminiAssessmentText } from "./ai-assessment";

describe("parseProviderJson", () => {
  it("extracts an object from a provider preamble and markdown fence", () => {
    expect(parseProviderJson(
      'Here is the assessment:\n```json\n{"decision":"confirmed_issue","confidence":"high"}\n```',
    )).toEqual({
      decision: "confirmed_issue",
      confidence: "high",
    });
  });

  it("repairs unescaped quotes inside evidence strings", () => {
    expect(parseProviderJson(
      '{"decision":"potential_issue","confidence":"medium","evidence":["The element has aria-label="Save""]}',
    )).toEqual({
      decision: "potential_issue",
      confidence: "medium",
      evidence: ['The element has aria-label="Save"'],
    });
  });

  it("rejects output without a JSON object", () => {
    expect(() => parseProviderJson("The model could not assess this finding.")).toThrow(
      "Provider returned invalid JSON.",
    );
  });

  it("uses Gemini's visible answer part instead of its thinking text", () => {
    expect(extractGeminiAssessmentText({
      candidates: [{
        content: {
          parts: [
            { thought: true, text: "I need to inspect the rule and page markup." },
            { text: '{"decision":"confirmed_issue","confidence":"high"}' },
          ],
        },
      }],
    })).toBe('{"decision":"confirmed_issue","confidence":"high"}');
  });
});