import { Router } from "express";
import { requireAuth } from "../middlewares/authMiddleware";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

const router = Router();

const AI_PUBLIC_KEYS = [
  "ai_engine_enabled",
  "ai_external_enabled",
  "ai_external_provider",
  "ai_external_model",
] as const;

// GET /api/ai/config — returns AI settings visible to all authenticated users (no API key)
router.get("/ai/config", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(inArray(appSettingsTable.key, [...AI_PUBLIC_KEYS]));
  const map: Record<string, string> = {};
  for (const r of rows) if (r.value != null) map[r.key] = r.value;
  res.json({
    engineEnabled: map["ai_engine_enabled"] !== "false",
    externalEnabled: map["ai_external_enabled"] === "true",
    provider: (map["ai_external_provider"] as "gemini" | "openai") ?? "gemini",
    model: map["ai_external_model"] ?? "",
  });
});

// POST /api/ai/analyze — proxy to external AI (Gemini or OpenAI)
router.post("/ai/analyze", requireAuth, async (req, res): Promise<void> => {
  const ALL_AI_KEYS = [...AI_PUBLIC_KEYS, "ai_external_api_key"] as const;

  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(inArray(appSettingsTable.key, [...ALL_AI_KEYS]));
  const cfg: Record<string, string> = {};
  for (const r of rows) if (r.value != null) cfg[r.key] = r.value;

  if (cfg["ai_external_enabled"] !== "true") {
    res.status(403).json({ error: "External AI is not enabled." });
    return;
  }
  const apiKey = cfg["ai_external_api_key"];
  if (!apiKey) {
    res.status(503).json({ error: "External AI API key not configured." });
    return;
  }

  const { ruleId, description, element, selector, pageUrl, wcagCriteria, wcagLevel } = req.body ?? {};
  if (!ruleId || !description) {
    res.status(400).json({ error: "ruleId and description are required." });
    return;
  }

  const provider = cfg["ai_external_provider"] ?? "gemini";
  const model = cfg["ai_external_model"] || (provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");

  const prompt = buildPrompt({ ruleId, description, element, selector, pageUrl, wcagCriteria, wcagLevel });

  try {
    let text: string;
    if (provider === "gemini") {
      text = await callGemini(apiKey, model, prompt);
    } else {
      text = await callOpenAI(apiKey, model, prompt);
    }
    const parsed = parseAIResponse(text);
    res.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `AI request failed: ${msg}` });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(params: {
  ruleId: string;
  description: string;
  element?: string;
  selector?: string;
  pageUrl?: string;
  wcagCriteria?: string;
  wcagLevel?: string;
}): string {
  const { ruleId, description, element, selector, pageUrl, wcagCriteria, wcagLevel } = params;

  const elementSnippet = element ? element.slice(0, 1500) : null;

  const contextLines: string[] = [
    `Rule ID: ${ruleId}`,
  ];
  if (wcagCriteria) contextLines.push(`WCAG Success Criterion: ${wcagCriteria}${wcagLevel ? ` (Level ${wcagLevel})` : ""}`);
  contextLines.push(`Violation message: ${description}`);
  if (pageUrl) contextLines.push(`Page URL: ${pageUrl}`);
  if (selector) contextLines.push(`CSS Selector: ${selector}`);

  const elementBlock = elementSnippet
    ? `\nFAILING ELEMENT — current HTML:\n\`\`\`html\n${elementSnippet}\n\`\`\``
    : "\n(No element HTML captured — provide general remediation for this rule.)";

  return `You are an expert WCAG web accessibility engineer performing a code-level remediation review. An automated accessibility scan found the following violation. Provide a detailed, code-aware fix.

VIOLATION CONTEXT
─────────────────
${contextLines.join("\n")}
${elementBlock}

RESPONSE FORMAT — respond ONLY with the following JSON object (no markdown fences, no text before or after):
{
  "why": "1–2 sentences explaining exactly why THIS element fails — reference its specific content, attributes, or structural issue directly from the HTML above",
  "impact": "Who is affected and what experience they have (e.g. screen reader users hear '...', keyboard-only users cannot...)",
  "howToFix": [
    "Step 1: Concrete action referencing the actual element content/attributes",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "beforeCode": "Paste the original failing element HTML (from above, or reconstruct it concisely)",
  "afterCode": "The corrected version of that same element — must be valid HTML that passes the rule",
  "notes": "Optional: any WCAG technique references (e.g. ARIA techniques, H-techniques), edge cases, or caveats. Empty string if none."
}`;
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Gemini API ${r.status}: ${err.slice(0, 200)}`);
  }
  const data = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OpenAI API ${r.status}: ${err.slice(0, 200)}`);
  }
  const data = await r.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export interface AIAnalysisResult {
  why: string;
  impact: string;
  howToFix: string[];
  beforeCode: string;
  afterCode: string;
  notes: string;
}

function parseAIResponse(text: string): AIAnalysisResult {
  const clean = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();
  try {
    const obj = JSON.parse(clean) as Record<string, unknown>;
    return {
      why: String(obj.why ?? ""),
      impact: String(obj.impact ?? ""),
      howToFix: Array.isArray(obj.howToFix)
        ? (obj.howToFix as unknown[]).map(String)
        : obj.howToFix
          ? [String(obj.howToFix)]
          : [],
      beforeCode: String(obj.beforeCode ?? obj.codeExample ?? ""),
      afterCode: String(obj.afterCode ?? ""),
      notes: String(obj.notes ?? ""),
    };
  } catch {
    return { why: text.slice(0, 500), impact: "", howToFix: [], beforeCode: "", afterCode: "", notes: "" };
  }
}

export default router;
