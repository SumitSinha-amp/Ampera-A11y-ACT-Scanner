const SECRET_QUERY_KEY =
  /pass(word)?|token|secret|api[_-]?key|auth|credential|session|cookie|sig(nature)?|access[_-]?key|private|(?:oauth[_-]?)?code|jwt/i;

/** Display/persistence only: never use this value for navigation or matching. */
export function redactProvenanceUrl(rawUrl: string, baseUrl?: string): string {
  try {
    const url = new URL(rawUrl, baseUrl);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_KEY.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}
