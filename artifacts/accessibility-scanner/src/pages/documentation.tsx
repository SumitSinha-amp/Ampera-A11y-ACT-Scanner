import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ShieldCheck, FileText, ExternalLink } from "lucide-react";

const ruleReferences = [
  {
    id: "SIA-R1",
    title: "Page title missing",
    detail: "Pages should have a unique, descriptive title that tells users where they are and supports tab and browser navigation.",
  },
  {
    id: "SIA-R2",
    title: "Image missing alt text",
    detail: "Informative images need concise alternative text; decorative images should be hidden from assistive technology.",
  },
  {
    id: "SIA-R11",
    title: "Link has no accessible name",
    detail: "Links must expose a meaningful accessible name so screen reader users understand the destination or purpose.",
  },
  {
    id: "SIA-R12",
    title: "Button has no accessible name",
    detail: "Buttons need a visible label or an aria-label so they can be identified by assistive technologies.",
  },
  {
    id: "SIA-R14",
    title: "Visible label and accessible name do not match",
    detail: "The accessible name should closely match the visible label to reduce confusion for speech and screen reader users.",
  },
  {
    id: "SIA-R30",
    title: "Text contrast below AAA minimum",
    detail: "Large or important text should meet strong contrast so it remains readable for users with low vision.",
  },
  {
    id: "SIA-R39",
    title: "Focused component obscured by sticky content",
    detail: "Interactive content must remain visible when focused, especially near sticky headers, banners, and toolbars.",
  },
  {
    id: "SIA-R58",
    title: "Missing skip navigation / bypass link",
    detail: "Provide a quick way to bypass repeated content so keyboard users can reach the main content efficiently.",
  },
  {
    id: "SIA-R65",
    title: "Focus indicators removed",
    detail: "Do not suppress focus outlines or visible focus states; users must always know where keyboard focus is located.",
  },
  {
    id: "SIA-R69",
    title: "Text contrast below AA minimum",
    detail: "Body text should maintain readable contrast against its background for common accessibility standards.",
  },
  {
    id: "SIA-R87",
    title: "Page missing main landmark",
    detail: "Use a main landmark so screen reader users can quickly jump to the primary content area.",
  },
  {
    id: "SIA-R107",
    title: "Custom interactive control missing keyboard support",
    detail: "Any custom control must work with the keyboard, not only with a mouse or touch input.",
  },
  {
    id: "SIA-R114",
    title: "Iframe missing title attribute",
    detail: "Frames need a descriptive title so users understand the embedded content and its purpose.",
  },
];

const references = [
  {
    title: "Siteimprove Accessibility Rules",
    description: "Use this as the primary rule reference when interpreting scanner findings and prioritizing fixes.",
    links: [
      { label: "Alfa Rules Catalog", href: "https://alfa.siteimprove.com/rules" },
      { label: "Siteimprove Help Center", href: "https://help.siteimprove.com/" },
      { label: "WCAG 2.1 Overview", href: "https://www.w3.org/WAI/standards-guidelines/wcag/" },
    ],
  },
  {
    title: "A11y ACT Tool Rules",
    description: "This scanner maps a curated rule set to practical fixes for pages, components, and content flows.",
    links: [
      { label: "Scan History", href: "/scans" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

export default function Documentation() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Badge variant="secondary" className="mb-3">A11y ACT Tool</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Help guide for scanning, reviewing results, and using reference standards responsibly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Getting started</CardTitle>
          </div>
          <CardDescription>
            Create a scan by entering URLs, uploading a CSV, or using a sitemap.xml source.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p><span className="font-medium text-foreground">1.</span> Open <span className="font-medium">New Scan</span> and add one or more URLs.</p>
          <p><span className="font-medium text-foreground">2.</span> Select specific rules when you want focused validation.</p>
          <p><span className="font-medium text-foreground">3.</span> Enable proxy mode only when a PAC URL is configured in <span className="font-medium">Settings</span>.</p>
          <p><span className="font-medium text-foreground">4.</span> Review scan details, expand issue rows, and export results as CSV, Excel, or PDF.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Detailed rule descriptions</CardTitle>
          </div>
          <CardDescription>
            Quick reference descriptions for common scanner rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {ruleReferences.map((rule) => (
            <div key={rule.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">{rule.id}</Badge>
                <h3 className="font-medium text-sm">{rule.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-6">{rule.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Siteimprove Alfa rules reference</CardTitle>
          </div>
          <CardDescription>
            Use the rule catalog to navigate findings and understand likely remediation paths.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            When a rule is triggered, review the issue summary first, then expand occurrences to inspect selectors, HTML, WCAG criteria, and conformance level.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {references.map((section) => (
              <div key={section.title} className="rounded-lg border p-4 space-y-3">
                <h3 className="font-medium">{section.title}</h3>
                <p className="text-muted-foreground">{section.description}</p>
                <div className="space-y-2">
                  {section.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className="flex items-center gap-1 text-primary hover:underline"
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                    >
                      {link.label}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Licensing and copyright</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground space-y-3">
          <p>
            Siteimprove, WCAG, and any referenced standards, names, or trademarks remain the property of their respective owners.
          </p>
          <p>
            This tool is provided for accessibility auditing and educational use. Always verify licensing terms before reproducing external documentation, rule text, or brand assets in your own materials.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}