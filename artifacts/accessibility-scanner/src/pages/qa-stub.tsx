import { useLocation } from "wouter";
import { QAComingSoon } from "@/pages/qa-shared";

const STUB_META: Record<string, { title: string; description: string }> = {
  "/quality-assurance/priority-pages": {
    title: "Priority pages",
    description: "High-priority pages identified during the crawl based on inlink count and content quality.",
  },
  "/quality-assurance/single-page-check": {
    title: "Single page check",
    description: "Run an on-demand QA check against a single page URL.",
  },
  "/quality-assurance/inventory": {
    title: "Inventory — Summary",
    description: "Summary of all content types discovered during the crawl.",
  },
  "/quality-assurance/inventory/links": {
    title: "Links",
    description: "All links discovered during the crawl, including internal and external.",
  },
  "/quality-assurance/inventory/link-text": {
    title: "Link text",
    description: "Inventory of anchor text used across all discovered links.",
  },
  "/quality-assurance/inventory/documents": {
    title: "Documents",
    description: "PDFs and other document files discovered during the crawl.",
  },
  "/quality-assurance/inventory/media": {
    title: "Media files",
    description: "Images, videos, and other media files discovered during the crawl.",
  },
  "/quality-assurance/inventory/email": {
    title: "Email addresses",
    description: "Email addresses found in page content and mailto links.",
  },
  "/quality-assurance/inventory/phones": {
    title: "Phone numbers",
    description: "Phone numbers detected in page content and tel links.",
  },
  "/quality-assurance/inventory/ssn": {
    title: "Social Security Numbers",
    description: "Potential SSN patterns detected in page content (sensitive data exposure check).",
  },
  "/quality-assurance/inventory/javascript": {
    title: "JavaScript files",
    description: "JavaScript files loaded by crawled pages.",
  },
  "/quality-assurance/inventory/css": {
    title: "CSS",
    description: "CSS stylesheets loaded by crawled pages.",
  },
  "/quality-assurance/inventory/meta-tags": {
    title: "Meta tags",
    description: "Meta tags (title, description, og, canonical, etc.) across all crawled pages.",
  },
  "/quality-assurance/inventory/sitemap": {
    title: "Sitemap",
    description: "XML sitemaps discovered during the crawl.",
  },
  "/quality-assurance/issues": {
    title: "Issues",
    description: "Quality assurance issues affecting your QA score. Fix these to improve content quality.",
  },
  "/quality-assurance/issues/resolved": {
    title: "Resolved issues",
    description: "QA issues that have been resolved between recent crawls.",
  },
  "/quality-assurance/links/overview": {
    title: "Links overview",
    description: "Summary of all links: internal, external, broken, and redirecting.",
  },
  "/quality-assurance/links/pages-with-broken": {
    title: "Pages with broken links",
    description: "Pages that contain at least one broken outbound link.",
  },
  "/quality-assurance/links/pdfs-broken": {
    title: "PDFs with broken links",
    description: "PDF documents that contain broken hyperlinks.",
  },
  "/quality-assurance/links/broken-in-pdfs": {
    title: "Broken links in PDFs",
    description: "Specific broken link URLs found inside PDF documents.",
  },
  "/quality-assurance/links/unsafe": {
    title: "Links to unsafe domains",
    description: "Links pointing to domains flagged as potentially unsafe.",
  },
  "/quality-assurance/spelling/pages": {
    title: "Pages with misspellings",
    description: "Pages containing one or more spelling errors detected during content analysis.",
  },
  "/quality-assurance/spelling/misspellings": {
    title: "Misspellings",
    description: "All misspellings detected across crawled pages, ranked by frequency.",
  },
  "/quality-assurance/spelling/word-inventory": {
    title: "Word inventory",
    description: "Inventory of all significant words found across crawled pages.",
  },
  "/quality-assurance/spelling/decisions": {
    title: "Spelling decisions",
    description: "Words you have approved or flagged as exceptions to the spell checker.",
  },
  "/quality-assurance/spelling/progress": {
    title: "Progress and trends",
    description: "Track misspelling counts and vocabulary trends across crawl history.",
  },
};

export default function QAStubPage() {
  const [location] = useLocation();
  const meta = STUB_META[location] ?? {
    title: "Coming soon",
    description: "This QA feature is planned for a future release.",
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">{meta.title}</h1>
      <p className="text-muted-foreground text-sm mb-8">{meta.description}</p>
      <QAComingSoon feature={meta.title} description={meta.description} />
    </div>
  );
}
