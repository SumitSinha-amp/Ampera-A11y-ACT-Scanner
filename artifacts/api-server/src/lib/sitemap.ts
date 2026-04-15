import { logger } from "./logger";

export async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const xml2js = await import("xml2js");

  try {
    const response = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AccessibilityScanner/1.0)",
        Accept: "application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(text);

    const urls: string[] = [];

    // Standard sitemap
    if (result.urlset && result.urlset.url) {
      const entries = Array.isArray(result.urlset.url) ? result.urlset.url : [result.urlset.url];
      for (const entry of entries) {
        const loc = typeof entry.loc === "string" ? entry.loc : entry.loc?._;
        if (loc) urls.push(loc.trim());
      }
    }

    // Sitemap index (multiple sitemaps)
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      const sitemaps = Array.isArray(result.sitemapindex.sitemap)
        ? result.sitemapindex.sitemap
        : [result.sitemapindex.sitemap];

      // Fetch child sitemaps (limit to first 5 to avoid too many)
      const childSitemaps = sitemaps.slice(0, 5);
      for (const sm of childSitemaps) {
        const loc = typeof sm.loc === "string" ? sm.loc : sm.loc?._;
        if (loc) {
          try {
            const childUrls = await fetchSitemapUrls(loc.trim());
            urls.push(...childUrls);
          } catch (err) {
            logger.warn({ url: loc, err }, "Failed to fetch child sitemap");
          }
        }
      }
    }

    return [...new Set(urls)]; // deduplicate
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ url: sitemapUrl, error: msg }, "Failed to fetch sitemap");
    throw new Error(`Failed to parse sitemap: ${msg}`);
  }
}

export function parseUrlsFromCsv(csvContent: string): string[] {
  const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const urls: string[] = [];

  for (const line of lines) {
    // Handle quoted CSV, take first column
    const firstCol = line.startsWith('"') ? line.split('"')[1] : line.split(",")[0].trim();
    if (firstCol && (firstCol.startsWith("http://") || firstCol.startsWith("https://"))) {
      urls.push(firstCol);
    }
  }

  return [...new Set(urls)];
}
