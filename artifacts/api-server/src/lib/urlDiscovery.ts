import { fetchSitemapUrls } from "./sitemap";
import { logger } from "./logger";

export interface DiscoveryProgress {
  phase: "sitemap" | "crawling" | "dedup" | "done";
  urls: string[];
  sitemapCount: number;
  crawledCount: number;
  message: string;
}

export type ProgressCallback = (progress: DiscoveryProgress) => void;

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const hrefRegex = /href=["']([^"'#\s][^"']*?)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;
    if (
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("data:") ||
      href.startsWith("#")
    ) {
      continue;
    }
    try {
      const resolved = new URL(href, baseUrl);
      resolved.hash = "";
      if (
        resolved.hostname === base.hostname &&
        (resolved.protocol === "http:" || resolved.protocol === "https:")
      ) {
        links.push(resolved.toString());
      }
    } catch {
      // Invalid URL
    }
  }

  return [...new Set(links)];
}

function applyTemplateDedup(urls: string[]): string[] {
  const patternMap = new Map<string, string>();

  for (const url of urls) {
    try {
      const u = new URL(url);
      // Normalise numeric segments and UUIDs to placeholders
      const normPath = u.pathname
        .split("/")
        .map((seg) => {
          if (/^\d+$/.test(seg)) return ":id";
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":uuid";
          return seg;
        })
        .join("/");

      // Also normalise common pagination params
      const searchParams = new URLSearchParams(u.search);
      const normQuery = ["page", "p", "offset", "skip"].some((k) => searchParams.has(k))
        ? "?:paged"
        : u.search;

      const pattern = `${u.hostname}${normPath}${normQuery}`;
      if (!patternMap.has(pattern)) {
        patternMap.set(pattern, url);
      }
    } catch {
      // Keep unparseable URLs as-is with a unique key
      if (!patternMap.has(url)) patternMap.set(url, url);
    }
  }

  return Array.from(patternMap.values());
}

export async function discoverUrls(
  targetUrl: string,
  options: {
    maxUrls?: number;
    depthLimit?: number;
    applyDedup?: boolean;
    onProgress?: ProgressCallback;
  } = {},
): Promise<string[]> {
  const { maxUrls = 500, depthLimit = 2, applyDedup = true, onProgress } = options;

  let base: URL;
  try {
    base = new URL(targetUrl);
  } catch {
    throw new Error("Invalid target URL");
  }

  const allUrls = new Set<string>([targetUrl]);

  const emit = (progress: DiscoveryProgress) => {
    try {
      onProgress?.(progress);
    } catch {
      // Ignore callback errors
    }
  };

  // ── Phase A: Sitemap ──────────────────────────────────────────────────────
  let sitemapCount = 0;

  emit({
    phase: "sitemap",
    urls: Array.from(allUrls),
    sitemapCount: 0,
    crawledCount: 0,
    message: "Checking sitemap.xml…",
  });

  try {
    const sitemapUrl = `${base.protocol}//${base.hostname}/sitemap.xml`;
    const sitemapUrls = await fetchSitemapUrls(sitemapUrl);
    const sameDomain = sitemapUrls.filter((u) => {
      try {
        return new URL(u).hostname === base.hostname;
      } catch {
        return false;
      }
    });

    for (const u of sameDomain) {
      if (allUrls.size >= maxUrls) break;
      allUrls.add(u);
    }

    sitemapCount = allUrls.size;
    emit({
      phase: "sitemap",
      urls: Array.from(allUrls),
      sitemapCount,
      crawledCount: 0,
      message: `Sitemap: found ${sitemapCount} URL${sitemapCount !== 1 ? "s" : ""}`,
    });
  } catch {
    emit({
      phase: "sitemap",
      urls: Array.from(allUrls),
      sitemapCount: 0,
      crawledCount: 0,
      message: "No sitemap found — crawling links from homepage",
    });
  }

  // ── Phase B: BFS link crawl ────────────────────────────────────────────────
  if (allUrls.size < maxUrls) {
    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [{ url: targetUrl, depth: 0 }];

    while (queue.length > 0 && allUrls.size < maxUrls) {
      const item = queue.shift()!;
      if (!item || visited.has(item.url) || item.depth > depthLimit) continue;
      visited.add(item.url);

      emit({
        phase: "crawling",
        urls: Array.from(allUrls),
        sitemapCount,
        crawledCount: visited.size,
        message: `Crawling links… ${allUrls.size} URL${allUrls.size !== 1 ? "s" : ""} found`,
      });

      try {
        const response = await fetch(item.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; A11yScanner/1.0)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });

        if (!response.ok) continue;

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html")) continue;

        const html = await response.text();
        const links = extractLinksFromHtml(html, item.url);

        for (const link of links) {
          if (allUrls.size >= maxUrls) break;
          allUrls.add(link);
          if (!visited.has(link) && item.depth + 1 <= depthLimit) {
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      } catch (err) {
        logger.debug({ url: item.url, err: String(err) }, "Link crawl page fetch failed");
      }
    }
  }

  // ── Phase C: Deduplication ────────────────────────────────────────────────
  let finalUrls = Array.from(allUrls);

  emit({
    phase: "dedup",
    urls: finalUrls,
    sitemapCount,
    crawledCount: finalUrls.length,
    message: `Deduplicating ${finalUrls.length} URL${finalUrls.length !== 1 ? "s" : ""}…`,
  });

  if (applyDedup) {
    finalUrls = applyTemplateDedup(finalUrls);
  }

  emit({
    phase: "done",
    urls: finalUrls,
    sitemapCount,
    crawledCount: finalUrls.length,
    message: `Discovery complete — ${finalUrls.length} unique page${finalUrls.length !== 1 ? "s" : ""} to scan`,
  });

  return finalUrls;
}
