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
  // ai_engine_enabled defaults to true (opt-out) — no API key or privacy concerns
  // ai_external_enabled defaults to false (opt-in) — requires API key
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

  const { ruleId, description, element, selector, pageUrl } = req.body ?? {};
  if (!ruleId || !description) {
    res.status(400).json({ error: "ruleId and description are required." });
    return;
  }

  const provider = cfg["ai_external_provider"] ?? "gemini";
  const model = cfg["ai_external_model"] || (provider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");

  const prompt = buildPrompt({ ruleId, description, element, selector, pageUrl });

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
}): string {
  const { ruleId, description, element, selector, pageUrl } = params;
  return `You are an expert web accessibility engineer. Analyze this WCAG/SIA accessibility violation and provide specific, actionable guidance.

Rule: ${ruleId}
Violation: ${description}${selector ? `\nSelector: ${selector}` : ""}${element ? `\nElement HTML:\n\`\`\`html\n${element.slice(0, 800)}\n\`\`\`` : ""}${pageUrl ? `\nPage: ${pageUrl}` : ""}

Respond in this exact JSON format (no markdown, raw JSON only):
{
  "why": "2-3 sentence explanation of exactly why this specific element is an accessibility issue and who it impacts",
  "howToFix": "2-3 sentence specific instruction for fixing this exact element",
  "codeExample": "corrected HTML or CSS code example (optional, omit if not applicable)"
}`;
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
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
      temperature: 0.2,
      max_tokens: 800,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OpenAI API ${r.status}: ${err.slice(0, 200)}`);
  }
  const data = await r.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

function parseAIResponse(text: string): { why: string; howToFix: string; codeExample?: string } {
  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  try {
    const obj = JSON.parse(clean) as { why?: string; howToFix?: string; codeExample?: string };
    return {
      why: obj.why ?? text.slice(0, 300),
      howToFix: obj.howToFix ?? "",
      codeExample: obj.codeExample || undefined,
    };
  } catch {
    return { why: text.slice(0, 400), howToFix: "" };
  }
}

export default router;
