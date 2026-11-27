/** Only mechanically identifiable non-descriptive titles; not semantic guessing. */
export function nonDescriptiveTitleReason(title: string): "generic" | "placeholder" | null {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) return null; // Missing titles belong to ACT-R1.
  if (/^(home|index|untitled|page|document|new page|welcome)$/i.test(normalized)) return "generic";
  // Whole-title authoring instructions, with optional template delimiters.
  // Anchoring avoids flagging real articles about placeholders or title editing.
  const instruction = "(?:insert|enter|add|replace)(?: (?:a|your|the))?(?: (?:page|document|website))? title(?: here)?";
  if (new RegExp(`^(?:${instruction}|\\[\\s*${instruction}\\s*\\]|\\{\\s*${instruction}\\s*\\}|<\\s*${instruction}\\s*>)$`, "i").test(normalized)) {
    return "placeholder";
  }
  // Unresolved title variables are not a description of the rendered page.
  const variable = "(?:title|page[ _-]?title|document[ _-]?title)";
  if (new RegExp(`^(?:\\{\\{\\s*${variable}\\s*\\}\\}|\\$\\{\\s*${variable}\\s*\\}|<%=\\s*${variable}\\s*%>)$`, "i").test(normalized)) {
    return "placeholder";
  }
  return null;
}
