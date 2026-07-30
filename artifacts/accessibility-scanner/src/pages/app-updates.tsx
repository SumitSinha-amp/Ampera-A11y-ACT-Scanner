import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accessibility,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Globe,
  Settings2,
  Sparkles,
} from "lucide-react";

const featureGroups = [
  {
    icon: Accessibility,
    title: "Accessibility scanning",
    description: "Find and understand accessibility issues with richer rule coverage.",
    features: [
      "WCAG 2.1 and 2.2 issue detection with Issue and Potential Issue outcomes",
      "Improved image alternatives, contrast, fixed font-size, and touch-target checks",
      "Manual-only WCAG criteria reference for human review",
      "Page reports with selectors, HTML context, remediation guidance, and exports",
    ],
  },
  {
    icon: Globe,
    title: "Crawler features",
    description: "Scan entire sites with controls built for large and protected websites.",
    features: [
      "Sitemap, URL-list, and crawl-based scanning workflows",
      "Crawler progress, retry handling, resume support, and failed-page recovery",
      "Incremental scans that reuse safe page baselines without carrying forward failures",
      "WAF-aware browser capture with stable post-JavaScript page snapshots",
    ],
  },
  {
    icon: ClipboardCheck,
    title: "Quality Assurance",
    description: "Review the quality of links, pages, metadata, and site content.",
    features: [
      "Broken-link detection with redirect and transport-failure reporting",
      "Page, link, media, document, email, phone, CSS, JavaScript, and sitemap inventories",
      "Meta-tag, unsafe-link, spelling, and priority-page review areas",
      "Check history and issue tracking for repeatable QA workflows",
    ],
  },
  {
    icon: BarChart3,
    title: "Reports and analysis",
    description: "Turn scan data into practical, shareable insights.",
    features: [
      "Site dashboards, rule reports, compliance views, and page-level details",
      "Smart Analysis for shared components and recurring issue patterns",
      "CSV, Excel, and PDF exports for completed scans and analysis reports",
      "Large-scan report APIs designed to avoid memory-heavy data loading",
    ],
  },
  {
    icon: Settings2,
    title: "Platform experience",
    description: "Navigate the platform faster with the new guidance tools.",
    features: [
      "App Walkthrough for the header, navigation, menus, and account controls",
      "Version badge and release notes for each product update",
      "Role-aware navigation for site customers, administrators, and super admins",
      "Persistent site selection, sidebar preferences, and account settings",
    ],
  },
];

export default function AppUpdates() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge className="mb-3 gap-1.5 bg-primary/10 text-primary hover:bg-primary/15">
            <Sparkles className="h-3.5 w-3.5" />
            Version 1.2.0
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight">App Updates</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            A quick look at the improvements included in this release.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          July 2026
        </Badge>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <div className="h-1 bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            What&apos;s new in 1.2.0
          </CardTitle>
          <CardDescription>
            Built to make scanning results more trustworthy and the platform
            easier to navigate.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {featureGroups.map((group) => {
            const Icon = group.icon;
            return (
              <div
                key={group.title}
                data-testid={`card-update-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/30"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{group.description}</p>
                <ul className="mt-3 space-y-2">
                  {group.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}