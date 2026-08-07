import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Plus, ChevronRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdmin } from "@/contexts/auth";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] || map.open}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    low: "text-gray-500",
    medium: "text-blue-600",
    high: "text-orange-600",
    critical: "text-red-600 font-semibold",
  };
  return <span className={`text-xs ${map[priority] || ""}`}>{priority}</span>;
}

export default function TicketsPage() {
  const [location, navigate] = useLocation();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTicket, setDetailTicket] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [cSubject, setCSubject] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cPriority, setCPriority] = useState("medium");
  const [cError, setCError] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const adminUser = isAdmin(user);

  async function loadTickets() {
    try {
      const res = await fetch(`${BASE}/api/tickets`, { credentials: "include" });
      if (res.ok) setTickets(await res.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { loadTickets(); }, []);

  useEffect(() => {
    const query = location.split("?")[1] ?? "";
    if (new URLSearchParams(query).get("create") === "1") {
      setCreateOpen(true);
      setCError("");
      navigate("/tickets", { replace: true });
    }
  }, [location, navigate]);

  async function openTicket(ticket: Ticket) {
    setDetailLoading(true);
    setDetailTicket({ ...ticket, replies: [] });
    try {
      const res = await fetch(`${BASE}/api/tickets/${ticket.id}`, { credentials: "include" });
      if (res.ok) setDetailTicket(await res.json());
    } finally { setDetailLoading(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCError("");
    setCLoading(true);
    try {
      const res = await fetch(`${BASE}/api/tickets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: cSubject, description: cDesc, priority: cPriority }),
      });
      const data = await res.json();
      if (!res.ok) { setCError(data.error || "Failed to create ticket"); return; }
      setCreateOpen(false);
      setCSubject(""); setCDesc(""); setCPriority("medium");
      loadTickets();
      toast({ title: "Ticket created" });
    } catch { setCError("Network error"); }
    finally { setCLoading(false); }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!detailTicket || !replyMessage.trim()) return;
    setReplyLoading(true);
    try {
      const res = await fetch(`${BASE}/api/tickets/${detailTicket.id}/replies`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyMessage }),
      });
      if (res.ok) {
        setReplyMessage("");
        // Reload ticket detail
        const detailRes = await fetch(`${BASE}/api/tickets/${detailTicket.id}`, { credentials: "include" });
        if (detailRes.ok) setDetailTicket(await detailRes.json());
        loadTickets();
      }
    } finally { setReplyLoading(false); }
  }

  async function handleStatusChange(status: string) {
    if (!detailTicket) return;
    try {
      const res = await fetch(`${BASE}/api/tickets/${detailTicket.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setDetailTicket(t => t ? { ...t, status } : null);
        loadTickets();
        toast({ title: "Status updated" });
      }
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {adminUser ? `${tickets.length} ticket${tickets.length !== 1 ? "s" : ""} across all users` : "Submit and track your support requests"}
          </p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setCError(""); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Ticket
        </Button>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground mb-4" />
            <p className="font-medium">No tickets yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a support ticket if you need help.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  className="w-full text-left px-4 py-4 hover:bg-muted/40 flex items-center gap-4 transition-colors"
                  onClick={() => openTicket(t)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.subject}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {adminUser && t.userFullName && <span>{t.userFullName}</span>}
                      <span>Priority: <PriorityBadge priority={t.priority} /></span>
                      <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Ticket Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Support Ticket</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {cError && <Alert variant="destructive"><AlertDescription>{cError}</AlertDescription></Alert>}
            <div className="space-y-2"><Label>Subject</Label><Input value={cSubject} onChange={e => setCSubject(e.target.value)} placeholder="Brief description of the issue" required /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="Provide as much detail as possible..." rows={4} required /></div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={cPriority} onValueChange={setCPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={cLoading}>{cLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Submit Ticket</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!detailTicket} onOpenChange={v => !v && setDetailTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              <span>#{detailTicket?.id} {detailTicket?.subject}</span>
              {detailTicket && <StatusBadge status={detailTicket.status} />}
            </DialogTitle>
            {adminUser && detailTicket?.userFullName && (
              <p className="text-xs text-muted-foreground">From: {detailTicket.userFullName} ({detailTicket.userEmail})</p>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
            {detailLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : (
              <>
                {/* Original message */}
                <div className="bg-muted/40 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap">{detailTicket?.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">{detailTicket && new Date(detailTicket.createdAt).toLocaleString()}</p>
                </div>

                {/* Replies */}
                {detailTicket?.replies.map((r) => (
                  <div key={r.id} className={`rounded-lg p-4 ${r.isAdmin ? "bg-primary/5 border border-primary/10" : "bg-muted/40"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{r.authorName}</span>
                      {r.isAdmin && <Badge variant="outline" className="text-xs py-0">Support</Badge>}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">{new Date(r.createdAt).toLocaleString()}</p>
                  </div>
                ))}

                {/* Admin status controls */}
                {adminUser && detailTicket && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    {["open", "in_progress", "resolved", "closed"].map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${detailTicket.status === s ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                      >
                        {s.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Reply form */}
          {detailTicket?.status !== "closed" && (
            <form onSubmit={handleReply} className="border-t pt-4 space-y-3">
              <Textarea
                value={replyMessage}
                onChange={e => setReplyMessage(e.target.value)}
                placeholder="Write a reply..."
                rows={3}
                required
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={replyLoading || !replyMessage.trim()}>
                  {replyLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Send Reply
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
