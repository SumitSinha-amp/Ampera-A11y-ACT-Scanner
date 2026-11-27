/** Suggest only currently available values, never persist search history. */
export function filterSuggestions(values: readonly (string | null | undefined)[], query: string): string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key) || !key.includes(normalizedQuery)) continue;
    seen.add(key);
    results.push(text);
    if (results.length === 20) break;
  }
  return results;
}
