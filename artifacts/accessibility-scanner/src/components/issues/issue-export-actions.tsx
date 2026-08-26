import { useState } from "react";
import { Check, ChevronDown, Clipboard, Download, FileText, Link2, Mail, MessageCircle, MoreHorizontal, Share2, Table2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { Issue } from "../../lib/issue-types";

interface IssueExportActionsProps {
  issues: Issue[];
}

function plainText(value: string | null | undefined) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "issues";
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function IssueExportActions({ issues }: IssueExportActionsProps) {
  const { toast } = useToast();
  const [shared, setShared] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const disabled = issues.length === 0;
  const canNativeShare = typeof navigator.share === "function";
  const date = new Date().toISOString().slice(0, 10);
  const filename = safeFilename(`issues-${date}`);

  const exportCsv = () => {
    const header = [
      "Issue key",
      "Type",
      "Title",
      "Status",
      "Priority",
      "Assignee",
      "Reporter",
      "Site",
      "Project",
      "Created",
      "Updated",
      "Description",
    ];
    const rows = issues.map((issue) => [
      issue.issueKey,
      issue.type,
      issue.title,
      issue.status,
      issue.priority,
      issue.assigneeName,
      issue.reporterName,
      issue.siteName,
      issue.projectName,
      new Date(issue.createdAt).toLocaleDateString(),
      new Date(issue.updatedAt).toLocaleDateString(),
      plainText(issue.description),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadBlob(`\uFEFF${csv}`, `${filename}.csv`, "text/csv;charset=utf-8");
    toast({ title: "CSV exported", description: `${issues.length} issue${issues.length === 1 ? "" : "s"} downloaded.` });
  };

  const exportPdf = async () => {
    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(18);
      doc.text("Issue Management", 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`${issues.length} filtered issue${issues.length === 1 ? "" : "s"} · ${date}`, 40, 56);
      autoTable(doc, {
        startY: 72,
        head: [["Key", "Type", "Title", "Status", "Priority", "Assignee", "Site", "Updated"]],
        body: issues.map((issue) => [
          issue.issueKey,
          issue.type,
          plainText(issue.title),
          issue.status.replace(/_/g, " "),
          issue.priority,
          issue.assigneeName || "Unassigned",
          issue.siteName || "—",
          new Date(issue.updatedAt).toLocaleDateString(),
        ]),
        styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
        headStyles: { fillColor: [124, 58, 237], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 247, 252] },
        columnStyles: { 2: { cellWidth: 210 }, 6: { cellWidth: 100 } },
      });
      doc.save(`${filename}.pdf`);
      toast({ title: "PDF exported", description: `${issues.length} issue${issues.length === 1 ? "" : "s"} downloaded.` });
    } catch {
      toast({ title: "Export failed", description: "The PDF could not be generated.", variant: "destructive" });
    }
  };

  const shareText = `${issues.length} filtered issue${issues.length === 1 ? "" : "s"} in Ampera`;
  const shareUrl = window.location.href;

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
      toast({ title: "Link copied", description: "The current Issues view link is ready to share." });
    } catch {
      toast({ title: "Couldn't share this view", description: "Please copy the URL from your browser.", variant: "destructive" });
    }
  };

  const openApp = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareWithNativeApps = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({ title: "Issue Management", text: shareText, url: shareUrl });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast({ title: "Couldn't open system sharing", description: "Choose another sharing option.", variant: "destructive" });
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)} aria-label="Open share apps">
        <Share2 className="h-4 w-4" />
        <span className="hidden sm:inline">Share</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label="Export Issues">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={exportPdf}>
            <FileText className="h-4 w-4 text-rose-500" />
            Export PDF
            <span className="ml-auto text-xs text-muted-foreground">.pdf</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportCsv}>
            <Table2 className="h-4 w-4 text-emerald-600" />
            Export CSV
            <span className="ml-auto text-xs text-muted-foreground">.csv</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4" />
            Open share options
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Issues</DialogTitle>
            <DialogDescription>Choose an app or copy a link to this filtered Issues view.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent("Issue Management")}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`; }}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-background p-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Mail className="h-5 w-5" /></span>
              Email
            </button>
            <button
              type="button"
              onClick={() => openApp(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`)}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-background p-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><MessageCircle className="h-5 w-5" /></span>
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => openApp(`https://teams.microsoft.com/share?href=${encodeURIComponent(shareUrl)}&msgText=${encodeURIComponent(shareText)}`)}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-background p-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700"><UsersRound className="h-5 w-5" /></span>
              Teams
            </button>
            <button
              type="button"
              onClick={copyShareLink}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-background p-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                {shared ? <Check className="h-5 w-5 text-emerald-600" /> : <Link2 className="h-5 w-5" />}
              </span>
              {shared ? "Copied" : "Copy link"}
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={shareWithNativeApps}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-background p-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700"><MoreHorizontal className="h-5 w-5" /></span>
                More apps
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <Clipboard className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{shareUrl}</span>
            <Button type="button" size="sm" variant="outline" onClick={copyShareLink}>{shared ? "Copied" : "Copy"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}