import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowRight,
  Braces,
  FileCode2,
  FileText,
  Globe2,
  Image,
  Link2,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Tag,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useQASites, useQASelectedSite, QA_BASE } from "@/pages/qa-shared";

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

type InventoryField = "pages" | "total" | "document" | "media" | "email" | "phone" | "javascript" | "css" | null;

const CATEGORIES: {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  field: InventoryField;
  iconClass: string;
  iconSurfaceClass: string;
}[] = [
  { key: "pages", label: "Pages", icon: FileText, href: "/quality-assurance/inventory/pages", field: "pages", iconClass: "text-violet-700", iconSurfaceClass: "bg-violet-100" },
  { key: "links", label: "All links", icon: Link2, href: "/quality-assurance/inventory/links", field: "total", iconClass: "text-sky-700", iconSurfaceClass: "bg-sky-100" },
  { key: "documents", label: "Documents", icon: FileCode2, href: "/quality-assurance/inventory/documents", field: "document", iconClass: "text-amber-700", iconSurfaceClass: "bg-amber-100" },
  { key: "media", label: "Media files", icon: Image, href: "/quality-assurance/inventory/media", field: "media", iconClass: "text-teal-700", iconSurfaceClass: "bg-teal-100" },
  { key: "email", label: "Email addresses", icon: Mail, href: "/quality-assurance/inventory/email", field: "email", iconClass: "text-rose-700", iconSurfaceClass: "bg-rose-100" },
  { key: "phones", label: "Phone numbers", icon: Phone, href: "/quality-assurance/inventory/phones", field: "phone", iconClass: "text-fuchsia-700", iconSurfaceClass: "bg-fuchsia-100" },
  { key: "javascript", label: "JavaScript files", icon: Braces, href: "/quality-assurance/inventory/javascript", field: "javascript", iconClass: "text-orange-700", iconSurfaceClass: "bg-orange-100" },
  { key: "css", label: "CSS files", icon: FileCode2, href: "/quality-assurance/inventory/css", field: "css", iconClass: "text-indigo-700", iconSurfaceClass: "bg-indigo-100" },
  { key: "meta-tags", label: "Meta tags", icon: Tag, href: "/quality-assurance/inventory/meta-tags", field: null, iconClass: "text-emerald-700", iconSurfaceClass: "bg-emerald-100" },
  { key: "link-text", label: "Link text", icon: Type, href: "/quality-assurance/inventory/link-text", field: null, iconClass: "text-pink-700", iconSurfaceClass: "bg-pink-100" },
];

function getValue(data: InventorySummary, field: InventoryField): number | null {
  if (field === null) return null;
  if (field === "pages") return data.pages;
  return data.links[field];
}

function SummaryContent({ scanId }: { scanId: number }) {
  const { data, isLoading, isError, error, refetch } = useQuery<InventorySummary>({
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
      <div className="flex min-h-72 items-center justify-center rounded-2xl border border-white/80 bg-white/70 shadow-[0_10px_30px_rgba(69,57,112,.05)]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="rounded-2xl border-rose-200 bg-rose-50/50 shadow-none">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-rose-600" />
          <div>
            <p className="font-semibold text-foreground">Inventory data could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Please try again."}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const metrics = [
    { label: "Pages", value: data.pages, icon: Globe2, iconClass: "text-violet-700", iconSurfaceClass: "bg-violet-100" },
    { label: "Links", value: data.links.total, icon: Link2, iconClass: "text-sky-700", iconSurfaceClass: "bg-sky-100" },
    { label: "Emails", value: data.links.email, icon: Mail, iconClass: "text-rose-700", iconSurfaceClass: "bg-rose-100" },
    { label: "Phone numbers", value: data.links.phone, icon: Phone, iconClass: "text-fuchsia-700", iconSurfaceClass: "bg-fuchsia-100" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className="border-white/80 bg-white shadow-[0_8px_24px_rgba(69,57,112,.06)]">
              <CardContent className="flex items-center gap-3.5 p-5">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${metric.iconSurfaceClass}`}>
                  <Icon className={`h-5 w-5 ${metric.iconClass}`} />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-2xl font-bold leading-none tracking-tight text-[#172b4d]">{metric.value.toLocaleString()}</p>
                  <p className="mt-1 text-xs font-medium text-[#7b8aaa]">{metric.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden rounded-2xl border-white/80 bg-white shadow-[0_10px_30px_rgba(69,57,112,.06)]">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-[#ebeef5] px-5 py-4 sm:px-6">
          <div>
            <CardTitle className="text-[15px] font-bold text-[#172b4d]">Content inventory</CardTitle>
            <p className="mt-1 text-xs text-[#7b8aaa]">Explore every content type found during the most recent crawl.</p>
          </div>
          <span className="hidden rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 sm:inline-flex">
            {CATEGORIES.length} categories
          </span>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {CATEGORIES.map((cat) => {
              const count = getValue(data, cat.field);
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.key}
                  href={cat.href}
                  className="group flex min-h-14 items-center justify-between rounded-xl border border-[#edf0f5] bg-[#fcfcfe] px-3.5 py-3 transition-all hover:-translate-y-px hover:border-violet-200 hover:bg-violet-50/40 hover:shadow-[0_7px_18px_rgba(109,72,199,.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${cat.iconSurfaceClass}`}>
                      <Icon className={`h-4 w-4 ${cat.iconClass}`} />
                    </span>
                    <span className="truncate text-sm font-semibold text-[#334665]">{cat.label}</span>
                  </span>
                  <span className="ml-3 flex shrink-0 items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#172b4d]">
                      {count === null ? "View" : count.toLocaleString()}
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#9aa8bf] transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </span>
                </Link>
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
  const [, selected] = useQASelectedSite(sites);

  return (
    <div className="w-full space-y-5 pb-10">
      <header className="flex flex-col gap-4 border-b border-[#e5e9f0] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#6d48c7]">Content intelligence</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#172b4d]">Inventory summary</h1>
          <p className="mt-1 text-sm text-[#7b8aaa]">A complete view of the content discovered during your latest crawl.</p>
        </div>
        {selected && (
          <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[#e7eaf0] bg-white px-3 py-2 shadow-sm sm:max-w-[390px]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
              <Globe2 className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-[#334665]">{selected.siteName}</span>
              <span className="block truncate text-[11px] text-[#7b8aaa]">{selected.siteUrl}</span>
            </span>
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-white/80 bg-white/70 shadow-[0_10px_30px_rgba(69,57,112,.05)]">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !selected?.scanId ? (
        <Card className="rounded-2xl border-dashed border-[#dfe4ee] bg-white shadow-none">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
              <Globe2 className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold text-[#172b4d]">No inventory is available yet</p>
              <p className="mt-1 max-w-sm text-sm text-[#7b8aaa]">Choose a site with a completed crawl from the global site selector to view its content inventory.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <SummaryContent scanId={selected.scanId} />
      )}
    </div>
  );
}
