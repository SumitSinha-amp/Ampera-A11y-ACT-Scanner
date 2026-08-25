/**
 * Providers sometimes wrap otherwise valid JSON in a short preamble, markdown
 * fences, or return HTML quotes without escaping them. Keep the extraction and
 * repair conservative: it only makes the transport JSON parseable; the caller
 * still validates the resulting object and every allowed field.
 */
export function extractJsonObject(text: string): string {
  const source = text.replace(/^\uFEFF/, "").trim();
  const start = source.indexOf("{");
  if (start < 0) return source;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

export function repairJsonStrings(source: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  const nextNonWhitespace = (index: number) => {
    let cursor = index;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
    return source[cursor] ?? "";
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (!inString) {
      output += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === "\n") {
      output += "\\n";
      continue;
    }
    if (char === "\r") {
      output += "\\r";
      continue;
    }
    if (char === "\t") {
      output += "\\t";
      continue;
    }
    if (char === '"') {
      const next = nextNonWhitespace(i + 1);
      // A quote followed by a colon closes an object key. A quote followed by
      // a structural delimiter closes a value. Other quotes are embedded
      // content, commonly an HTML attribute quote, so escape them.
      if (next === ":" || next === "," || next === "}" || next === "]" || !next) {
        output += char;
        inString = false;
      } else {
        output += '\\"';
      }
      continue;
    }
    output += char;
  }
  return output;
}

export function parseProviderJson(text: string): Record<string, unknown> {
  const clean = extractJsonObject(
    text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim(),
  );
  for (const candidate of [clean, repairJsonStrings(clean)]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next conservative representation.
    }
  }
  throw new Error("Provider returned invalid JSON.");
}