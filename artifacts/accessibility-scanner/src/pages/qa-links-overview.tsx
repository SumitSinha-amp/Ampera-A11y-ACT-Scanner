import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Mail,
  Phone,
  XCircle,
} from "lucide-react";
import {
  useQASites,
  useQASelectedSite,
  QAPageShell,
  QA_BASE,
  QA_TABLE_CLASS,
  QA_TABLE_SHELL_CLASS,
} from "@/pages/qa-shared";
import { Card as PlainCard } from "@/components/ui/card";

interface LinksOverview {
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
  uniqueUrls: number;
}

function StatCard({
  label,
  value,
  icon,
  href,
  variant = "default",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  variant?: "default" | "destructive" | "warning";
}) {
  const color =
    variant === "destructive"
      ? "text-destructive"
      : variant === "warning"
      ? "text-yellow-500"
      : "text-primary";

  const content = (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3">
          <div className={`${color} shrink-0`}>{icon}</div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
          </div>
          {href && (
            <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground shrink-0" />
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function OverviewContent({ scanId }: { scanId: number }) {
  const { data, isLoading } = useQuery<LinksOverview>({
    queryKey: ["qa-links-overview", scanId],
    queryFn: async () => {
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/links-overview`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load links overview");
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

  const rows = [
    { label: "All links", value: data.total, href: "/quality-assurance/inventory/links" },
    { label: "Internal links", value: data.internal, href: null },
    { label: "External links", value: data.external, href: null },
    { label: "Unique URLs", value: data.uniqueUrls, href: null },
    { label: "Broken links", value: data.broken, href: "/quality-assurance/links/broken" },
    { label: "Redirects", value: data.redirects, href: null },
    { label: "Documents", value: data.document, href: "/quality-assurance/inventory/documents" },
    { label: "Media files", value: data.media, href: "/quality-assurance/inventory/media" },
    { label: "Email links", value: data.email, href: "/quality-assurance/inventory/email" },
    { label: "Phone links", value: data.phone, href: "/quality-assurance/inventory/phones" },
    { label: "JavaScript files", value: data.javascript, href: "/quality-assurance/inventory/javascript" },
    { label: "CSS files", value: data.css, href: "/quality-assurance/inventory/css" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total links" value={data.total} icon={<Link2 className="w-5 h-5" />} href="/quality-assurance/inventory/links" />
        <StatCard label="Internal" value={data.internal} icon={<Globe className="w-5 h-5" />} />
        <StatCard label="External" value={data.external} icon={<ExternalLink className="w-5 h-5" />} />
        <StatCard label="Broken" value={data.broken} icon={<XCircle className="w-5 h-5" />} href="/quality-assurance/links/broken" variant={data.broken > 0 ? "destructive" : "default"} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Link breakdown</CardTitle>
        </CardHeader>
         <CardContent className="p-0 overflow-x-auto">
           <Table className={QA_TABLE_CLASS}>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium text-sm">{row.label}</TableCell>
                  <TableCell className="text-right font-mono">{row.value.toLocaleString()}</TableCell>
                  <TableCell>
                    {row.href && row.value > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 px-1" asChild>
                        <Link href={row.href}>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email &amp; Phone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
              <Link href="/quality-assurance/inventory/email">
                <Mail className="w-4 h-4" />
                {data.email.toLocaleString()} email address{data.email !== 1 ? "es" : ""}
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
              <Link href="/quality-assurance/inventory/phones">
                <Phone className="w-4 h-4" />
                {data.phone.toLocaleString()} phone number{data.phone !== 1 ? "s" : ""}
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start" asChild>
              <Link href="/quality-assurance/inventory/documents">
                📄 {data.document.toLocaleString()} documents
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" asChild>
              <Link href="/quality-assurance/inventory/media">
                🖼️ {data.media.toLocaleString()} media files
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Code assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start" asChild>
              <Link href="/quality-assurance/inventory/javascript">
                📜 {data.javascript.toLocaleString()} JavaScript files
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" asChild>
              <Link href="/quality-assurance/inventory/css">
                🎨 {data.css.toLocaleString()} CSS files
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function QALinksOverviewPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <QAPageShell
      activeTab="redirects"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected?.scanId ? (
        <PlainCard>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Link2 className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view the links overview.
            </p>
          </CardContent>
        </PlainCard>
      ) : (
        <OverviewContent scanId={selected.scanId} />
      )}
    </QAPageShell>
  );
}
