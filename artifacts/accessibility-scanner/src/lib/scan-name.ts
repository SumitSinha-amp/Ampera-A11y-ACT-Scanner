export function isUrlLikeScanName(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;

  if (/^(?:https?:\/\/|ftp:\/\/|www\.)/i.test(candidate)) return true;

  try {
    const parsed = new URL(candidate);
    return Boolean(parsed.protocol && parsed.hostname);
  } catch {
    return false;
  }
}

export const SCAN_NAME_URL_ERROR =
  "Scan title must be descriptive, not a URL. Enter a descriptive title instead.";