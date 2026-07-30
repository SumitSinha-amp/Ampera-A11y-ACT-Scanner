import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Globe, Link2, Loader2, Mail, Phone } from "lucide-react";
import { useQASites, useQASelectedSite, QASiteSelector, QA_BASE } from "@/pages/qa-shared";

interface InventorySummary {
  pages: number;
  links: {
    total: number;
    internal: number;
    external: number;
    email: number;
    phone: number;
    document: number;
    media: number;
    javascript: number;
    css: number;
    broken: number;
    redirects: number;
  };
}

const CATEGORIES = [
  { key: "pages", label: "Pages", icon: "🗒️", href: "/quality-assurance/inventory/pages", field: "pages" as const },
  { key: "links", label: "All links", icon: "🔗", href: "/quality-assurance/inventory/links", field: "total" as const },
  { key: "documents", label: "Documents", icon: "📄", href: "/quality-assurance/inventory/documents", field: "document" as const },
  { key: "media", label: "Media files", icon: "🖼️", href: "/quality-assurance/inventory/media", field: "media" as const },
  { key: "email", label: "Email addresses", icon: "✉️", href: "/quality-assurance/inventory/email", field: "email" as const },
  { key: "phones", label: "Phone numbers", icon: "📞", href: "/quality-assurance/inventory/phones", field: "phone" as const },
  { key: "javascript", label: "JavaScript files", icon: "📜", href: "/quality-assurance/inventory/javascript", field: "javascript" as const },
  { key: "css", label: "CSS files", icon: "🎨", href: "/quality-assurance/inventory/css", field: "css" as const },
  { key: "meta-tags", label: "Meta tags", icon: "🏷️", href: "/quality-assurance/inventory/meta-tags", field: null },
  { key: "link-text", label: "Link text", icon: "✍️", href: "/quality-assurance/inventory/link-text", field: null },
];

function getValue(data: InventorySummary, field: "pages" | "total" | "document" | "media" | "email" | "phone" | "javascript" | "css" | null): number | null {
  if (field === null) return null;
  if (field === "pages") return data.pages;
  return data.links[field];
}

function SummaryContent({ scanId }: { scanId: number }) {
  const { data, isLoading } = useQuery<InventorySummary>({
    queryKey: ["qa-inventory-summary", scanId],
    queryFn: async () => {
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/inventory-summary`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load inventory summary");
      return r.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold leading-none">{data.pages.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Pages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <Link2 className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold leading-none">{data.links.total.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Links</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold leading-none">{data.links.email.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Emails</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold leading-none">{data.links.phone.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Phone numbers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Content inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => {
              const count = getValue(data, cat.field);
              return (
                <Button
                  key={cat.key}
                  variant="outline"
                  className="justify-between h-12 px-4"
                  asChild
                >
                  <Link href={cat.href}>
                    <span className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span className="text-sm">{cat.label}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {count !== null && (
                        <span className="font-mono font-bold text-foreground">
                          {count.toLocaleString()}
                        </span>
                      )}
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function QAInventorySummaryPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory — Summary</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of all content types discovered during the crawl.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Site:</span>
        <QASiteSelector value={selectedSiteId} onChange={setSite} sites={sites} loading={isLoading} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected?.scanId ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Globe className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view the inventory.
            </p>
          </CardContent>
        </Card>
      ) : (
        <SummaryContent scanId={selected.scanId} />
      )}
    </div>
  );
}
