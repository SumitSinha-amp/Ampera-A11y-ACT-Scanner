import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Lightbulb,
  TicketCheck,
  MessageSquare,
  Clock,
  User,
  ChevronDown,
  Send,
  Inbox,
  Circle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Search,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/* ─── Types ──────────────────────────────────────────────────────── */
interface Ticket {
  id: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  userId: number;
  userFullName?: string;
  userEmail?: string;
}
interface Reply {
  id: number;
  message: string;
  isAdmin: boolean;
  createdAt: string;
  authorName?: string;
}
interface TicketDetail extends Ticket {
  replies: Reply[];
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function isFeatureRequest(subject: string) {
  return subject.startsWith("[Feature Request]");
}

function displaySubject(subject: string) {
  return subject.replace(/^\[Feature Request\]\s*/, "");
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const READ_KEY = (id: number, updated: string) => `inbox_read_${id}_${updated}`;
function markRead(ticket: Ticket) {
  try { localStorage.setItem(READ_KEY(ticket.id, ticket.updatedAt), "1"); } catch {}
}
function isUnread(ticket: Ticket) {
  try { return !localStorage.getItem(READ_KEY(ticket.id, ticket.updatedAt)); } catch { return false; }
}

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-sky-500",
  high: "bg-amber-500",
  critical: "bg-rose-500",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "text-slate-500",
  medium: "text-sky-600",
  high: "text-amber-600",
  critical: "text-rose-600 font-semibold",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  open:        { label: "Open",        icon: <Circle className="h-3 w-3" />,        cls: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700/50 dark:bg-blue-950/30 dark:text-blue-300" },
  in_progress: { label: "In progress", icon: <RefreshCw className="h-3 w-3" />,    cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300" },
  resolved:    { label: "Resolved",    icon: <CheckCircle2 className="h-3 w-3" />,  cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300" },
  closed:      { label: "Closed",      icon: <XCircle className="h-3 w-3" />,       cls: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700/50 dark:bg-slate-800/30 dark:text-slate-400" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

type FilterType = "all" | "feature" | "support";
type FilterStatus = "any" | "open" | "in_progress" | "resolved" | "closed";

/* ─── Page ───────────────────────────────────────────────────────── */
export default function AdminInboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tickets, setTickets]         = useState<Ticket[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<TicketDetail | null>(null);
  const [detailLoading, setDetLoad]   = useState(false);
  const [reply, setReply]             = useState("");
  const [replying, setReplying]       = useState(false);
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState<FilterType>("all");
  const [statusFilter, setStatusFilt] = useState<FilterStatus>("any");
  const [, setTick]                   = useState(0); // force re-render for unread

  const threadRef = useRef<HTMLDivElement>(null);

  /* Load all tickets */
  async function loadTickets(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/tickets`, { credentials: "include" });
      if (res.ok) setTickets(await res.json());
    } finally { setLoading(false); }
  }

  /* Open a ticket in the detail panel */
  async function openTicket(t: Ticket) {
    setDetLoad(true);
    setSelected({ ...t, replies: [] });
    markRead(t);
    setTick((n) => n + 1);
    try {
      const res = await fetch(`${BASE}/api/tickets/${t.id}`, { credentials: "include" });
      if (res.ok) setSelected(await res.json());
    } finally { setDetLoad(false); }
    setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }), 80);
  }

  /* Send a reply */
  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setReplying(true);
    try {
      const res = await fetch(`${BASE}/api/tickets/${selected.id}/replies`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        setReply("");
        const dr = await fetch(`${BASE}/api/tickets/${selected.id}`, { credentials: "include" });
        if (dr.ok) { const d = await dr.json(); setSelected(d); markRead(d); }
        loadTickets(true);
        setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }), 80);
      }
    } catch { toast({ title: "Failed to send reply", variant: "destructive" }); }
    finally { setReplying(false); }
  }

  /* Change ticket status */
  async function changeStatus(status: string) {
    if (!selected) return;
    try {
      const res = await fetch(`${BASE}/api/tickets/${selected.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setSelected((s) => s ? { ...s, status } : null);
        loadTickets(true);
        toast({ title: `Marked as ${status.replace("_", " ")}` });
      }
    } catch { toast({ title: "Failed to update status", variant: "destructive" }); }
  }

  /* Change ticket priority */
  async function changePriority(priority: string) {
    if (!selected) return;
    try {
      const res = await fetch(`${BASE}/api/tickets/${selected.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (res.ok) {
        setSelected((s) => s ? { ...s, priority } : null);
        loadTickets(true);
      }
    } catch {}
  }

  useEffect(() => { loadTickets(); }, []);

  /* ── Derived ── */
  const q = search.trim().toLowerCase();
  const filtered = tickets.filter((t) => {
    if (typeFilter === "feature" && !isFeatureRequest(t.subject)) return false;
    if (typeFilter === "support" && isFeatureRequest(t.subject)) return false;
    if (statusFilter !== "any" && t.status !== statusFilter) return false;
    if (q && !t.subject.toLowerCase().includes(q) && !t.userFullName?.toLowerCase().includes(q) && !t.userEmail?.toLowerCase().includes(q)) return false;
    return true;
  });

  const unreadCount   = tickets.filter(isUnread).length;
  const openCount     = tickets.filter((t) => t.status === "open").length;
  const inProgCount   = tickets.filter((t) => t.status === "in_progress").length;
  const featureCount  = tickets.filter((t) => isFeatureRequest(t.subject)).length;
  const supportCount  = tickets.filter((t) => !isFeatureRequest(t.subject)).length;

  /* ─── Render ──────────────────────────────────────────────────── */
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">

      {/* ── Top stats strip ─────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 bg-muted/20 px-4 py-2.5 flex-wrap">
        <div className="flex items-center gap-1.5 mr-2">
          <Inbox className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Admin Inbox</span>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />
        {[
          { label: "Open",          val: openCount,    cls: "text-blue-600 dark:text-blue-400" },
          { label: "In progress",   val: inProgCount,  cls: "text-amber-600 dark:text-amber-400" },
          { label: "Feature reqs",  val: featureCount, cls: "text-violet-600 dark:text-violet-400" },
          { label: "Support",       val: supportCount, cls: "text-slate-600 dark:text-slate-300" },
        ].map(({ label, val, cls }) => (
          <div key={label} className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1">
            <span className={`text-sm font-bold tabular-nums ${cls}`}>{val}</span>
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        ))}
        <div className="ml-auto">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground" onClick={() => loadTickets()}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Body: list + detail ─────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* ── Left: ticket list ─────────────────────────────────── */}
        <div className="flex w-[320px] shrink-0 flex-col border-r border-border/50 xl:w-[360px]">

          {/* Search + filter */}
          <div className="space-y-2 border-b border-border/40 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets…"
                className="h-8 rounded-lg pl-8 text-xs"
                aria-label="Search tickets"
              />
            </div>
            <div className="flex gap-1">
              {/* Type filter */}
              {(["all", "feature", "support"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${typeFilter === f ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                >
                  {f === "all" ? "All" : f === "feature" ? "Features" : "Support"}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {([
                { val: "any",         label: "Any" },
                { val: "open",        label: "Open" },
                { val: "in_progress", label: "In progress" },
                { val: "resolved",    label: "Resolved" },
                { val: "closed",      label: "Closed" },
              ] as { val: FilterStatus; label: string }[]).map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => setStatusFilt(val)}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${statusFilter === val ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-14 px-4 text-center">
                <Filter className="mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No tickets match</p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">Try changing the filters above.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {filtered.map((t) => {
                  const unread   = isUnread(t);
                  const isFeat   = isFeatureRequest(t.subject);
                  const isActive = selected?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTicket(t)}
                      className={`w-full px-3 py-3 text-left transition-colors hover:bg-muted/40 ${isActive ? "bg-primary/6 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Unread dot */}
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`} aria-label={unread ? "Unread" : ""} />
                        {/* Type icon */}
                        <span className={`mt-0.5 shrink-0 ${isFeat ? "text-violet-500" : "text-sky-500"}`}>
                          {isFeat ? <Lightbulb className="h-3.5 w-3.5" /> : <TicketCheck className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[13px] leading-tight ${unread ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                            {displaySubject(t.subject)}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <StatusBadge status={t.status} />
                            <span className={`text-[10px] font-medium ${PRIORITY_LABEL[t.priority] ?? ""}`}>{t.priority}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span className="truncate">{t.userFullName ?? t.userEmail ?? `User #${t.userId}`}</span>
                            <span className="ml-auto shrink-0">{timeAgo(t.updatedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: detail panel ───────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">
          {!selected ? (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              </span>
              <div>
                <p className="font-semibold text-muted-foreground">Select a ticket</p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">Click any ticket in the list to view the conversation.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="shrink-0 border-b border-border/50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${isFeatureRequest(selected.subject) ? "text-violet-500" : "text-sky-500"}`}>
                    {isFeatureRequest(selected.subject)
                      ? <Lightbulb className="h-5 w-5" />
                      : <TicketCheck className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold leading-tight">
                        {displaySubject(selected.subject)}
                      </h2>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${isFeatureRequest(selected.subject) ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700/50 dark:bg-violet-950/20 dark:text-violet-300" : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700/50 dark:bg-sky-950/20 dark:text-sky-300"}`}>
                        {isFeatureRequest(selected.subject) ? "Feature Request" : "Support"}
                      </Badge>
                      <StatusBadge status={selected.status} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{selected.userFullName ?? selected.userEmail ?? `User #${selected.userId}`}</span>
                      {selected.userEmail && selected.userFullName && <span>{selected.userEmail}</span>}
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(selected.createdAt).toLocaleString()}</span>
                      <span>#{selected.id}</span>
                    </div>
                  </div>
                </div>

                {/* Priority selector */}
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground mr-1">Priority:</span>
                  {["low","medium","high","critical"].map((p) => (
                    <button key={p} onClick={() => changePriority(p)}
                      className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${selected.priority === p ? `border-current ${PRIORITY_LABEL[p]}` : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[p]}`} />
                      {p}
                    </button>
                  ))}
                </div>

                {/* Status selector */}
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground mr-1">Status:</span>
                  {(["open","in_progress","resolved","closed"] as const).map((s) => {
                    const cfg = STATUS_CONFIG[s];
                    return (
                      <button key={s} onClick={() => changeStatus(s)}
                        className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${selected.status === s ? cfg.cls : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                        {cfg.icon}{cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Thread */}
              <div ref={threadRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {detailLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Original message */}
                    <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                          {(selected.userFullName ?? selected.userEmail ?? "U")[0]}
                        </span>
                        <span className="text-xs font-semibold">{selected.userFullName ?? selected.userEmail}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{new Date(selected.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{selected.description}</p>
                    </div>

                    {/* Replies */}
                    {selected.replies.map((r) => (
                      <div key={r.id}
                        className={`rounded-xl border px-4 py-3 ${r.isAdmin
                          ? "border-primary/20 bg-primary/5 dark:border-primary/20 dark:bg-primary/5"
                          : "border-border/50 bg-muted/30"}`}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold uppercase ${r.isAdmin ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {(r.authorName ?? "A")[0]}
                          </span>
                          <span className="text-xs font-semibold">{r.authorName}</span>
                          {r.isAdmin && (
                            <Badge variant="outline" className="h-4 border-primary/30 bg-primary/5 px-1.5 text-[9px] font-semibold text-primary">
                              Admin
                            </Badge>
                          )}
                          <span className="ml-auto text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{r.message}</p>
                      </div>
                    ))}

                    {selected.replies.length === 0 && !detailLoading && (
                      <p className="text-center text-xs text-muted-foreground py-4">No replies yet — be the first to respond.</p>
                    )}
                  </>
                )}
              </div>

              {/* Reply form */}
              {selected.status !== "closed" ? (
                <form onSubmit={sendReply} className="shrink-0 border-t border-border/50 px-5 py-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Write a reply… (Shift+Enter for new line)"
                        className="min-h-[72px] resize-none rounded-xl text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(e as unknown as React.FormEvent); }
                        }}
                      />
                    </div>
                    <Button type="submit" size="icon" disabled={replying || !reply.trim()} className="h-10 w-10 shrink-0 rounded-xl" aria-label="Send reply">
                      {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">Press Enter to send · Shift+Enter for new line</p>
                </form>
              ) : (
                <div className="shrink-0 flex items-center justify-center gap-2 border-t border-border/50 px-5 py-3 text-xs text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5" />
                  This ticket is closed. Reopen it to reply.
                  <button onClick={() => changeStatus("open")} className="text-primary hover:underline underline-offset-2">Reopen</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
