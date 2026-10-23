import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient, type Query } from "@tanstack/react-query";
import {
  useGetDataProtection,
  useGetDataProtectionEvents,
  useGetDataProtectionArchived,
  useRestoreDataProtectionRecord,
  useCreateDataProtectionCheckpoint,
  useVerifyDataProtectionStorage,
  useRetryDataProtectionEvidence,
  useCreateDataProtectionExport,
  useVerifyDataProtectionExport,
  downloadDataProtectionEvidence,
  getGetDataProtectionQueryKey,
  getGetDataProtectionEventsQueryKey,
  getGetDataProtectionArchivedQueryKey,
  type GetDataProtectionArchivedEntity,
  type ProtectionArchivedRecord,
  type ProtectionAuditEvent,
  type ProtectionRecoveryExport,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Database,
  Download,
  FileCheck2,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { IssueRecoveryPanel } from "@/components/admin/issue-recovery-panel";
import { SqlBackupPanel } from "@/components/admin/sql-backup-panel";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const DP_PREFIX = "/api/admin/data-protection";
const COPY_DELAY_WARN_MS = 15 * 60 * 1000;

const ENTITIES: { value: GetDataProtectionArchivedEntity; label: string }[] = [
  { value: "users", label: "Users" },
  { value: "sites", label: "Sites" },
  { value: "projects", label: "Projects" },
  { value: "app_issues", label: "Issues" },
];

function errMessage(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "object") {
    const o = e as { data?: { error?: string; message?: string }; message?: string };
    return o.data?.error ?? o.data?.message ?? o.message ?? "Request failed";
  }
  return String(e);
}

function fmtDate(v?: string | null) {
  if (!v) return "Never";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

function ago(v?: string | null) {
  if (!v) return null;
  const ms = Date.now() - new Date(v).getTime();
  if (Number.isNaN(ms)) return null;
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Tone = "ok" | "warn" | "bad" | "neutral";
const toneClass: Record<Tone, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  bad: "border-destructive/35 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted/50 text-muted-foreground",
};

function Pill({ tone, children, testId }: { tone: Tone; children: ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

function Panel({ title, icon, tone, children, action }: { title: string; icon: ReactNode; tone: Tone; children: ReactNode; action?: ReactNode }) {
  const bar = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-destructive", neutral: "bg-border" }[tone];
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm" aria-label={title}>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </section>
  );
}

function Row({ k, v, testId }: { k: string; v: ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span data-testid={testId} className="text-right font-medium tabular-nums">{v}</span>
    </div>
  );
}

function Counts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts ?? {});
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">No counts recorded</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, n]) => (
        <span key={k} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
          {k} <strong className="tabular-nums">{n.toLocaleString()}</strong>
        </span>
      ))}
    </div>
  );
}

function PassphraseField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const len = value.length;
  const valid = len >= 16 && len <= 512;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Passphrase</Label>
      <Input
        id={id}
        data-testid={`input-${id}`}
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={512}
        aria-describedby={`${id}-hint`}
        aria-invalid={len > 0 && !valid}
      />
      <p id={`${id}-hint`} className={`text-xs ${len > 0 && !valid ? "text-destructive" : "text-muted-foreground"}`}>
        16 to 512 characters ({len} entered). Not stored by Ampera; it is cleared after the request. Keep it somewhere safe: without it the file cannot be decrypted.
      </p>
    </div>
  );
}

export default function AdminDataProtectionPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const status = useGetDataProtection({
    query: { queryKey: getGetDataProtectionQueryKey(), refetchInterval: 30_000, refetchOnMount: "always" },
  });

  const [eventPage, setEventPage] = useState(1);
  const [eventEntity, setEventEntity] = useState<string>("");
  const eventParams = { page: eventPage, ...(eventEntity ? { entity: eventEntity } : {}) };
  const events = useGetDataProtectionEvents(eventParams, {
    query: { queryKey: getGetDataProtectionEventsQueryKey(eventParams), refetchInterval: 30_000, refetchOnMount: "always" },
  });

  const [archEntity, setArchEntity] = useState<GetDataProtectionArchivedEntity>("users");
  const [archPage, setArchPage] = useState(1);
  const archParams = { entity: archEntity, page: archPage };
  const archived = useGetDataProtectionArchived(archParams, {
    query: { queryKey: getGetDataProtectionArchivedQueryKey(archParams), refetchOnMount: "always" },
  });

  const refreshProtection = () => {
    qc.invalidateQueries({ queryKey: getGetDataProtectionQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDataProtectionEventsQueryKey() });
  };

  const checkpoint = useCreateDataProtectionCheckpoint({
    mutation: {
      onSuccess: () => { toast({ title: "Checkpoint recorded" }); refreshProtection(); },
      onError: (e) => toast({ title: "Checkpoint failed", description: errMessage(e), variant: "destructive" }),
    },
  });
  const verifyStorage = useVerifyDataProtectionStorage({
    mutation: {
      onSuccess: () => { toast({ title: "Evidence storage verified" }); refreshProtection(); },
      onError: (e) => { toast({ title: "Storage check failed", description: errMessage(e), variant: "destructive" }); refreshProtection(); },
    },
  });
  const retry = useRetryDataProtectionEvidence({
    mutation: {
      onSuccess: (s) => {
        qc.setQueryData(getGetDataProtectionQueryKey(), s);
        qc.invalidateQueries({ queryKey: getGetDataProtectionEventsQueryKey() });
        toast({ title: "Evidence copy retried", description: `${s.audit.pending} pending, ${s.audit.failed} failed.` });
      },
      onError: (e) => toast({ title: "Retry failed", description: errMessage(e), variant: "destructive" }),
    },
  });

  // Restore
  const [restoreTarget, setRestoreTarget] = useState<{ entity: GetDataProtectionArchivedEntity; record: ProtectionArchivedRecord } | null>(null);
  const [reason, setReason] = useState("");
  const restore = useRestoreDataProtectionRecord();
  const reasonValid = reason.trim().length >= 5 && reason.trim().length <= 500;
  const submitRestore = (e: FormEvent) => {
    e.preventDefault();
    if (!restoreTarget || !reasonValid) return;
    const { entity, record } = restoreTarget;
    restore.mutate(
      { data: { entity, id: record.id, reason: reason.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Record restored", description: `${record.label ?? `#${record.id}`} is active again.` });
          setRestoreTarget(null);
          setReason("");
          qc.invalidateQueries({ queryKey: getGetDataProtectionArchivedQueryKey() });
          refreshProtection();
          const segs: Record<string, string[]> = {
            users: ["users", "admin-users"],
            sites: ["sites", "my-sites", "site"],
            projects: ["projects"],
            app_issues: ["issues", "app-issues"],
          };
          const wanted = segs[entity] ?? [];
          qc.invalidateQueries({
            predicate: (q: Query) => {
              const head = String(q.queryKey[0] ?? "").toLowerCase();
              return wanted.some((w) => head === w || head.startsWith(`${w}-`) || head.includes(`/api/${w}`) || head.includes(`/api/admin/${w}`));
            },
          });
        },
        onError: (err) => toast({ title: "Restore failed", description: errMessage(err), variant: "destructive" }),
      },
    );
  };

  // Exports
  const [createPass, setCreatePass] = useState("");
  const createExport = useCreateDataProtectionExport();
  const createValid = createPass.length >= 16 && createPass.length <= 512;
  const submitExport = (e: FormEvent) => {
    e.preventDefault();
    if (!createValid) return;
    const passphrase = createPass;
    setCreatePass("");
    createExport.mutate(
      { data: { passphrase } },
      {
        onSuccess: (x) => { toast({ title: "Encrypted export created", description: `${fmtBytes(x.size_bytes)}, SHA-256 ${x.sha256.slice(0, 12)}...` }); refreshProtection(); },
        onError: (err) => toast({ title: "Export failed", description: errMessage(err), variant: "destructive" }),
      },
    );
  };

  const [verifyTarget, setVerifyTarget] = useState<ProtectionRecoveryExport | null>(null);
  const [verifyPass, setVerifyPass] = useState("");
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; text: string } | null>(null);
  const verifyExport = useVerifyDataProtectionExport();
  const verifyValid = verifyPass.length >= 16 && verifyPass.length <= 512;
  const submitVerify = (e: FormEvent) => {
    e.preventDefault();
    if (!verifyTarget || !verifyValid) return;
    const passphrase = verifyPass;
    setVerifyPass("");
    setVerifyResult(null);
    verifyExport.mutate(
      { id: verifyTarget.id, data: { passphrase } },
      {
        onSuccess: (r) => setVerifyResult({ ok: true, text: typeof r?.message === "string" ? r.message : "Decryption, checksum and record counts match." }),
        onError: (err) => setVerifyResult({ ok: false, text: errMessage(err) }),
      },
    );
  };

  const [downloading, setDownloading] = useState<string | null>(null);
  const downloadExport = async (x: ProtectionRecoveryExport) => {
    setDownloading(x.id);
    try {
      const res = await fetch(`${BASE}${DP_PREFIX}/exports/${encodeURIComponent(x.id)}/download`, { credentials: "include" });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      saveBlob(await res.blob(), `ampera-metadata-export-${x.created_at.slice(0, 10)}-${x.id.slice(0, 8)}.enc`);
    } catch (e) {
      toast({ title: "Download failed", description: errMessage(e), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };
  const downloadEvidence = async (ev: ProtectionAuditEvent) => {
    setDownloading(ev.id);
    try {
      const data = await downloadDataProtectionEvidence(ev.id);
      saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `ampera-evidence-${ev.id}.json`);
    } catch (e) {
      toast({ title: "Evidence download failed", description: errMessage(e), variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const s = status.data;
  const oldestPendingMs = s?.audit.oldest_pending_at ? Date.now() - new Date(s.audit.oldest_pending_at).getTime() : 0;
  const copyDelayed = !!s && s.audit.pending > 0 && oldestPendingMs > COPY_DELAY_WARN_MS;
  const storageTone: Tone = !s ? "neutral" : !s.storage.configured || s.storage.error ? "bad" : !s.storage.verifiedAt ? "warn" : "ok";
  const auditTone: Tone = !s ? "neutral" : s.audit.failed > 0 ? "bad" : copyDelayed || s.audit.pending > 0 ? "warn" : "ok";
  const dbPrivileged = !!s && (s.database.superuser || s.database.owner || s.database.can_create || !s.database.restrictedRuntime);
  const dbTone: Tone = !s ? "neutral" : dbPrivileged ? "warn" : "ok";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Super admin</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-foreground">
            <FileCheck2 className="h-6 w-6 text-primary" aria-hidden="true" />
            Data protection
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Tamper-evident audit evidence, archived records you can restore, and encrypted metadata exports. Deleting users, sites and projects archives them; nothing here erases scan data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {status.isFetching ? "Refreshing..." : status.dataUpdatedAt ? `Updated ${new Date(status.dataUpdatedAt).toLocaleTimeString()}` : ""}
          </span>
          <Button data-testid="button-refresh" variant="outline" size="sm" onClick={() => { refreshProtection(); qc.invalidateQueries({ queryKey: getGetDataProtectionArchivedQueryKey() }); }} disabled={status.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${status.isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </Button>
          <Button data-testid="button-checkpoint" size="sm" onClick={() => checkpoint.mutate()} disabled={checkpoint.isPending}>
            {checkpoint.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />}
            Record checkpoint
          </Button>
        </div>
      </header>

      {status.isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-sm text-destructive">
          <span>Protection status could not be loaded: {errMessage(status.error)}</span>
          <Button size="sm" variant="outline" onClick={() => status.refetch()}>Retry</Button>
        </div>
      )}

      {s && dbPrivileged && (
        <div role="alert" data-testid="alert-db-privileged" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">The app is connected with a privileged database role ({s.database.role}).</p>
            <p className="mt-1">
              A compromised or buggy app session could bypass archive protection and audit triggers.
              {s.database.superuser && " The role is a superuser."}
              {s.database.owner && " It owns application tables."}
              {s.database.can_create && " It can create objects."}
              {" "}Production should run with a restricted runtime role and migrations disabled at startup. This is expected in development.
            </p>
          </div>
        </div>
      )}

      {s && copyDelayed && (
        <div role="alert" data-testid="alert-copy-delayed" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          <span className="flex items-center gap-2"><Timer className="h-4 w-4" aria-hidden="true" /> Evidence copy to object storage is delayed. Oldest pending event was recorded {ago(s.audit.oldest_pending_at)}. Events stay in the database until copied.</span>
          <Button size="sm" variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>Retry now</Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {status.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
        ) : s ? (
          <>
            <Panel
              title="Evidence storage"
              tone={storageTone}
              icon={storageTone === "bad" ? <CloudOff className="h-4 w-4 text-destructive" aria-hidden="true" /> : <UploadCloud className="h-4 w-4 text-primary" aria-hidden="true" />}
              action={<Button data-testid="button-verify-storage" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => verifyStorage.mutate()} disabled={verifyStorage.isPending}>{verifyStorage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Verify"}</Button>}
            >
              <Row k="Configured" v={s.storage.configured ? <Pill tone="ok">Yes</Pill> : <Pill tone="bad">No</Pill>} testId="text-storage-configured" />
              <Row k="Bucket" v={<span className="font-mono text-xs">{s.storage.bucket ?? "None"}</span>} />
              <Row k="Last verified" v={s.storage.verifiedAt ? ago(s.storage.verifiedAt) : "Never"} />
              {s.storage.error && <p data-testid="text-storage-error" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">Outage: {s.storage.error}</p>}
            </Panel>
            <Panel
              title="Audit evidence"
              tone={auditTone}
              icon={<FileCheck2 className="h-4 w-4 text-primary" aria-hidden="true" />}
              action={<Button data-testid="button-retry-evidence" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => retry.mutate()} disabled={retry.isPending || (s.audit.pending === 0 && s.audit.failed === 0)}>{retry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : "Retry copy"}</Button>}
            >
              <Row k="Events" v={s.audit.total.toLocaleString()} testId="text-audit-total" />
              <Row k="Awaiting copy" v={s.audit.pending > 0 ? <Pill tone="warn">{s.audit.pending}</Pill> : "0"} testId="text-audit-pending" />
              <Row k="Failed copy" v={s.audit.failed > 0 ? <Pill tone="bad">{s.audit.failed}</Pill> : "0"} testId="text-audit-failed" />
              <Row k="Oldest pending" v={s.audit.oldest_pending_at ? ago(s.audit.oldest_pending_at) : "None"} />
              <Row k="Last copied" v={s.audit.last_uploaded_at ? ago(s.audit.last_uploaded_at) : "Never"} />
            </Panel>
            <Panel title="Database role" tone={dbTone} icon={<Database className="h-4 w-4 text-primary" aria-hidden="true" />}>
              <Row k="Role" v={<span className="font-mono text-xs">{s.database.role}</span>} testId="text-db-role" />
              <Row k="Superuser" v={s.database.superuser ? <Pill tone="warn">Yes</Pill> : "No"} />
              <Row k="Table owner" v={s.database.owner ? <Pill tone="warn">Yes</Pill> : "No"} />
              <Row k="Can create" v={s.database.can_create ? <Pill tone="warn">Yes</Pill> : "No"} />
              <Row k="Restricted runtime" v={s.database.restrictedRuntime ? <Pill tone="ok">Yes</Pill> : <Pill tone="warn">No</Pill>} />
              <Row k="Startup migrations" v={s.database.startupMigrationsEnabled ? "Enabled" : "Disabled"} />
            </Panel>
            <Panel title="Latest checkpoint" tone={!s.checkpoint ? "warn" : s.checkpoint.warnings.length ? "warn" : "ok"} icon={<ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />}>
              {s.checkpoint ? (
                <>
                  <Row k="Checked" v={ago(s.checkpoint.checked_at)} testId="text-checkpoint-at" />
                  <Counts counts={s.checkpoint.counts} />
                  {s.checkpoint.warnings.length > 0 && (
                    <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
                      {s.checkpoint.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{w}</li>)}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No checkpoint yet. Record one to snapshot row counts so unexpected drops are detectable.</p>
              )}
            </Panel>
          </>
        ) : null}
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-5">
          <TabsTrigger className="min-w-0 whitespace-normal px-2 py-2 text-xs sm:text-sm" value="events" data-testid="tab-events">Audit trail</TabsTrigger>
          <TabsTrigger className="min-w-0 whitespace-normal px-2 py-2 text-xs sm:text-sm" value="archived" data-testid="tab-archived">Archived records</TabsTrigger>
          <TabsTrigger className="min-w-0 whitespace-normal px-2 py-2 text-xs sm:text-sm" value="exports" data-testid="tab-exports">Encrypted exports</TabsTrigger>
          <TabsTrigger className="min-w-0 whitespace-normal px-2 py-2 text-xs sm:text-sm" value="issue-recovery" data-testid="tab-issue-recovery">Issue recovery</TabsTrigger>
          <TabsTrigger className="col-span-2 min-w-0 whitespace-normal px-2 py-2 text-xs sm:col-span-1 sm:text-sm" value="sql-backups" data-testid="tab-sql-backups">SQL backups</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="event-entity" className="text-sm">Entity</Label>
            <select
              id="event-entity"
              data-testid="select-event-entity"
              value={eventEntity}
              onChange={(e) => { setEventEntity(e.target.value); setEventPage(1); }}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All</option>
              {ENTITIES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Record</th>
                  <th className="px-3 py-2 font-medium">Actors</th>
                  <th className="px-3 py-2 font-medium">Evidence copy</th>
                  <th className="px-3 py-2 font-medium"><span className="sr-only">Download</span></th>
                </tr>
              </thead>
              <tbody>
                {events.isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-3 py-2"><Skeleton className="h-6" /></td></tr>
                ))}
                {events.isError && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-destructive">Could not load events. <Button variant="link" size="sm" onClick={() => events.refetch()}>Retry</Button></td></tr>
                )}
                {events.data && events.data.events.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No audit events recorded{eventEntity ? " for this entity" : ""} yet.</td></tr>
                )}
                {events.data?.events.map((ev) => (
                  <tr key={ev.id} data-testid={`row-event-${ev.id}`} className="border-t border-border/60 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs" title={fmtDate(ev.created_at)}>{fmtDate(ev.created_at)}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="font-mono text-[11px]">{ev.action}</Badge><div className="mt-1 text-[11px] text-muted-foreground">{ev.source}</div></td>
                    <td className="px-3 py-2 font-mono text-xs">{ev.entity_type} #{ev.entity_id}</td>
                    <td className="px-3 py-2 text-xs">
                      <div title="Application user claimed by the app session. Verified by app authentication, not by the database.">
                        <span className="text-muted-foreground">App (claimed): </span>
                        {ev.actor_id ? <span className="font-medium">user #{ev.actor_id}</span> : <span className="italic text-muted-foreground">none</span>}
                      </div>
                      <div title="Database role recorded by the database itself. Cannot be spoofed by the app.">
                        <span className="text-muted-foreground">Database (verified): </span>
                        <span className="font-mono">{ev.database_actor}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {ev.uploaded_at ? (
                        <Pill tone="ok"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Copied {ago(ev.uploaded_at)}</Pill>
                      ) : ev.last_error ? (
                        <div className="space-y-1"><Pill tone="bad">Failed ({ev.attempts ?? 0} attempts)</Pill><p className="max-w-[220px] break-words text-destructive">{ev.last_error}</p></div>
                      ) : (
                        <Pill tone="warn">Pending{ev.attempts ? ` (${ev.attempts} attempts)` : ""}</Pill>
                      )}
                      {ev.object_key && <p className="mt-1 max-w-[220px] truncate font-mono text-[10px] text-muted-foreground" title={ev.object_key}>{ev.object_key}</p>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button data-testid={`button-evidence-${ev.id}`} variant="ghost" size="sm" className="h-7" onClick={() => downloadEvidence(ev)} disabled={downloading === ev.id} aria-label={`Download evidence JSON for event ${ev.id}`}>
                        {downloading === ev.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={eventPage} hasMore={!!events.data?.hasMore} onChange={setEventPage} label="audit events" />
        </TabsContent>

        <TabsContent value="archived" className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Archived entity">
            {ENTITIES.map((e) => (
              <Button key={e.value} data-testid={`button-archived-${e.value}`} size="sm" variant={archEntity === e.value ? "default" : "outline"} aria-pressed={archEntity === e.value} onClick={() => { setArchEntity(e.value); setArchPage(1); }}>
                {e.label}
              </Button>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card">
            {archived.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : archived.isError ? (
              <div className="p-6 text-center text-sm text-destructive">Could not load archived records. <Button variant="link" size="sm" onClick={() => archived.refetch()}>Retry</Button></div>
            ) : archived.data && archived.data.records.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <ArchiveRestore className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">No archived {ENTITIES.find((e) => e.value === archEntity)?.label.toLowerCase()}</p>
                <p className="text-xs text-muted-foreground">Archived records appear here and can be restored with a recorded reason.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {archived.data?.records.map((r) => (
                  <li key={r.id} data-testid={`row-archived-${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.label ?? <span className="italic text-muted-foreground">Unnamed</span>}</p>
                      <p className="text-xs text-muted-foreground">#{r.id} &middot; created {fmtDate(r.created_at)}</p>
                    </div>
                    <Button data-testid={`button-restore-${r.id}`} size="sm" variant="outline" onClick={() => { setReason(""); setRestoreTarget({ entity: archEntity, record: r }); }}>
                      <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" /> Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Pager page={archPage} hasMore={!!archived.data?.hasMore} onChange={setArchPage} label="archived records" />
        </TabsContent>

        <TabsContent value="exports" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
            <form onSubmit={submitExport} className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />New encrypted export</h2>
              <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <strong>Business metadata only. Not a full database backup.</strong> Includes bounded records such as users, sites, projects and issues. Excludes page-level scan results, permissions and file bytes.
              </div>
              <PassphraseField id="create-passphrase" value={createPass} onChange={setCreatePass} />
              <Button data-testid="button-create-export" type="submit" disabled={!createValid || createExport.isPending} className="w-full">
                {createExport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Create export
              </Button>
            </form>
            <div className="rounded-xl border border-border bg-card">
              {status.isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
              ) : !s || s.exports.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No exports yet.</div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {s.exports.map((x) => (
                    <li key={x.id} data-testid={`row-export-${x.id}`} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{fmtDate(x.created_at)} <span className="text-xs text-muted-foreground">&middot; {fmtBytes(x.size_bytes)}</span></p>
                          <p className="break-all font-mono text-[11px] text-muted-foreground">SHA-256 {x.sha256}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button data-testid={`button-verify-export-${x.id}`} size="sm" variant="outline" onClick={() => { setVerifyPass(""); setVerifyResult(null); setVerifyTarget(x); }}>Verify</Button>
                          <Button data-testid={`button-download-export-${x.id}`} size="sm" variant="outline" onClick={() => downloadExport(x)} disabled={downloading === x.id}>
                            {downloading === x.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}Download
                          </Button>
                        </div>
                      </div>
                      <Counts counts={x.counts} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="issue-recovery" className="space-y-4">
          <IssueRecoveryPanel />
        </TabsContent>
        <TabsContent value="sql-backups" className="space-y-4">
          <SqlBackupPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={!!restoreTarget} onOpenChange={(o) => { if (!o && !restore.isPending) { setRestoreTarget(null); setReason(""); } }}>
        <DialogContent>
          <form onSubmit={submitRestore} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Restore {restoreTarget?.record.label ?? `#${restoreTarget?.record.id}`}</DialogTitle>
              <DialogDescription>The record becomes active again. Your reason is written to the audit trail.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="restore-reason">Reason</Label>
              <Textarea id="restore-reason" data-testid="input-restore-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} aria-describedby="restore-reason-hint" />
              <p id="restore-reason-hint" className="text-xs text-muted-foreground">5 to 500 characters ({reason.trim().length}).</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setRestoreTarget(null); setReason(""); }} disabled={restore.isPending}>Cancel</Button>
              <Button data-testid="button-confirm-restore" type="submit" disabled={!reasonValid || restore.isPending}>
                {restore.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Restore
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!verifyTarget} onOpenChange={(o) => { if (!o && !verifyExport.isPending) { setVerifyTarget(null); setVerifyPass(""); setVerifyResult(null); } }}>
        <DialogContent>
          <form onSubmit={submitVerify} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Verify export</DialogTitle>
              <DialogDescription>
                Checks that the file decrypts with this passphrase and that its checksum and record counts match. It does not import, restore or overwrite any data.
              </DialogDescription>
            </DialogHeader>
            <PassphraseField id="verify-passphrase" value={verifyPass} onChange={setVerifyPass} />
            {verifyResult && (
              <div role="status" data-testid="status-verify-result" className={`rounded-md border p-3 text-sm ${verifyResult.ok ? toneClass.ok : toneClass.bad}`}>
                {verifyResult.ok ? "Verified. " : "Verification failed. "}{verifyResult.text}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setVerifyTarget(null); setVerifyPass(""); setVerifyResult(null); }}>Close</Button>
              <Button data-testid="button-confirm-verify" type="submit" disabled={!verifyValid || verifyExport.isPending}>
                {verifyExport.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Verify
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pager({ page, hasMore, onChange, label }: { page: number; hasMore: boolean; onChange: (p: number) => void; label: string }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="flex items-center justify-end gap-2" aria-label={`${label} pages`}>
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
      <span className="text-xs text-muted-foreground">Page {page}</span>
      <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
    </nav>
  );
}
