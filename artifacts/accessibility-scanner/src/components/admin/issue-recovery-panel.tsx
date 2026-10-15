import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetIssueRecoveryBackups,
  useCreateIssueRecoveryBackup,
  usePreviewIssueRecoveryBackup,
  useRestoreIssueRecoveryBackup,
  getGetIssueRecoveryBackupsQueryKey,
  getGetDataProtectionQueryKey,
  getGetDataProtectionEventsQueryKey,
  getGetDataProtectionArchivedQueryKey,
  IssueRecoveryRestorationConfirmation,
  type IssueRecoveryBackup,
  type IssueRecoveryPreview,
} from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, DatabaseBackup, Eye, Info, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const CONFIRM = IssueRecoveryRestorationConfirmation.RESTORE_ISSUES;
const POLL_MS = 5000;
const START_GRACE_MS = 90_000;

function errMessage(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "object") {
    const o = e as { data?: { error?: string; message?: string }; message?: string };
    return o.data?.error ?? o.data?.message ?? o.message ?? "Request failed";
  }
  return String(e);
}
function fmtDate(v?: string | null) {
  if (!v) return "Unknown";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function CountChips({ counts, testId }: { counts?: Record<string, unknown> | null; testId?: string }) {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => typeof n === "number") as [string, number][];
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {entries.map(([k, n]) => (
        <span key={k} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
          {k} <strong className="tabular-nums">{n.toLocaleString()}</strong>
        </span>
      ))}
    </div>
  );
}

function Note({ tone, children }: { tone: "warn" | "bad" | "ok" | "info"; children: ReactNode }) {
  const cls = {
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    bad: "border-destructive/35 bg-destructive/10 text-destructive",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    info: "border-border bg-muted/40 text-foreground",
  }[tone];
  return <div className={`rounded-lg border p-3 text-sm ${cls}`}>{children}</div>;
}

export function IssueRecoveryPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const params = cursor ? { cursor } : undefined;
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const catalogue = useGetIssueRecoveryBackups(params, {
    query: {
      queryKey: getGetIssueRecoveryBackupsQueryKey(params),
      refetchOnMount: "always",
      refetchInterval: (q) => {
        const running = !!q.state.data?.state.running;
        const pendingStart = startedAt !== null && Date.now() - startedAt < START_GRACE_MS;
        return running || pendingStart ? POLL_MS : false;
      },
    },
  });
  const cat = catalogue.data;
  const running = !!cat?.state.running;

  // Clear the "just started" flag once state shows running or a newer completed backup.
  useEffect(() => {
    if (startedAt === null || !cat) return;
    const last = cat.state.last_backup_at ? new Date(cat.state.last_backup_at).getTime() : 0;
    if (running || last >= startedAt - 5000 || Date.now() - startedAt > START_GRACE_MS) {
      if (!running) setStartedAt(null);
    }
  }, [cat, running, startedAt]);

  const refreshCatalogue = () => qc.invalidateQueries({ queryKey: getGetIssueRecoveryBackupsQueryKey() });

  const createBackup = useCreateIssueRecoveryBackup({
    mutation: {
      onSuccess: () => {
        setStartedAt(Date.now());
        toast({ title: "Backup started", description: "It runs in the background; progress updates here." });
        setCursors([undefined]);
        refreshCatalogue();
      },
      onError: (e) => toast({ title: "Backup could not start", description: errMessage(e), variant: "destructive" }),
    },
  });

  const [selected, setSelected] = useState<IssueRecoveryBackup | null>(null);
  const [preview, setPreview] = useState<IssueRecoveryPreview | null>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const previewMut = usePreviewIssueRecoveryBackup();
  const restoreMut = useRestoreIssueRecoveryBackup();

  const runPreview = (b: IssueRecoveryBackup) => {
    setSelected(b);
    setPreview(null);
    setResult(null);
    setTyped("");
    previewMut.mutate(
      { id: b.id },
      {
        onSuccess: (p) => setPreview(p),
        onError: (e) => toast({ title: "Preview failed", description: errMessage(e), variant: "destructive" }),
      },
    );
  };

  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= 5 && trimmed.length <= 500;
  const confirmValid = typed === CONFIRM;
  const hasConflicts = !!preview && preview.conflicts.length > 0;
  const canSubmit = !!preview && !!selected && preview.canRestore && !hasConflicts && !running && reasonValid && confirmValid && !restoreMut.isPending;

  const submitRestore = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !preview || !selected) return;
    restoreMut.mutate(
      { id: selected.id, data: { previewHash: preview.previewHash, reason: trimmed, confirmation: CONFIRM } },
      {
        onSuccess: (r) => {
          setResult(r ?? {});
          setPreview(null);
          setReason("");
          setTyped("");
          toast({ title: "Issues restored", description: `From backup taken ${fmtDate(selected.createdAt)}.` });
          refreshCatalogue();
          qc.invalidateQueries({ queryKey: getGetDataProtectionQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDataProtectionEventsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDataProtectionArchivedQueryKey() });
          // Mark issue caches stale without forcing refetches here; issue screens reload on next view.
          qc.invalidateQueries({ queryKey: ["issues"], refetchType: "none" });
          qc.invalidateQueries({ queryKey: ["issues-people"], refetchType: "none" });
        },
        onError: (err) => toast({ title: "Restore failed", description: errMessage(err), variant: "destructive" }),
      },
    );
  };

  const resultCounts = result && typeof result.counts === "object" && result.counts ? (result.counts as Record<string, unknown>) : result;
  const busy = running || startedAt !== null;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm" aria-label="Issue backups">
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${cat?.state.last_error ? "bg-destructive" : busy ? "bg-amber-500" : "bg-emerald-500"}`} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><DatabaseBackup className="h-4 w-4 text-primary" aria-hidden="true" />Issue Management backups</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Catalogue is read directly from private R2, so it still works if the database index is lost.
              {cat && <> Namespace <span className="font-mono">{cat.namespace}</span>, automatic every {cat.intervalMinutes} minutes.</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="button-refresh-issue-backups" variant="outline" size="sm" onClick={refreshCatalogue} disabled={catalogue.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${catalogue.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />Refresh
            </Button>
            <Button data-testid="button-create-issue-backup" size="sm" onClick={() => createBackup.mutate()} disabled={createBackup.isPending || busy}>
              {createBackup.isPending || busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <DatabaseBackup className="mr-2 h-4 w-4" aria-hidden="true" />}
              {busy ? "Backup running" : "Back up now"}
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm" role="status" aria-live="polite">
          {catalogue.isLoading ? (
            <Skeleton className="h-16" />
          ) : cat ? (
            <>
              {busy && (
                <Note tone="warn">
                  <span className="flex items-center gap-2" data-testid="status-issue-backup-running"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {running ? `Backup in progress${cat.state.last_started_at ? `, started ${fmtDate(cat.state.last_started_at)}` : ""}.` : "Backup requested, waiting for the worker to report progress."}
                  </span>
                </Note>
              )}
              {cat.state.last_error && <Note tone="bad"><span data-testid="text-issue-backup-error">Last backup error: {cat.state.last_error}</span></Note>}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="text-xs"><span className="text-muted-foreground">Last completed: </span><strong data-testid="text-issue-last-backup">{cat.state.last_backup_at ? fmtDate(cat.state.last_backup_at) : "Never"}</strong></div>
                {cat.state.last_backup_id && <div className="truncate text-xs"><span className="text-muted-foreground">ID: </span><span className="font-mono">{cat.state.last_backup_id}</span></div>}
              </div>
              <CountChips counts={cat.state.counts} testId="text-issue-backup-counts" />
            </>
          ) : null}
        </div>
      </section>

      <div className="rounded-xl border border-border bg-card">
        {catalogue.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : catalogue.isError ? (
          <div role="alert" className="p-6 text-center text-sm text-destructive">Could not read the backup catalogue: {errMessage(catalogue.error)} <Button variant="link" size="sm" onClick={() => catalogue.refetch()}>Retry</Button></div>
        ) : cat && cat.backups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <DatabaseBackup className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">{cursors.length > 1 ? "No older backups" : "No issue backups yet"}</p>
            <p className="text-xs text-muted-foreground">Start one now or wait for the next scheduled run.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {cat?.backups.map((b) => (
              <li key={b.id} data-testid={`row-issue-backup-${b.id}`} className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${selected?.id === b.id ? "bg-muted/40" : ""}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{fmtDate(b.createdAt)}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground" title={b.id}>{b.id} · {fmtBytes(b.sizeBytes)}</p>
                </div>
                <Button data-testid={`button-preview-issue-backup-${b.id}`} size="sm" variant="outline" onClick={() => runPreview(b)} disabled={previewMut.isPending}>
                  {previewMut.isPending && selected?.id === b.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Preview restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button data-testid="button-issue-backups-newer" variant="outline" size="sm" disabled={cursors.length <= 1} onClick={() => setCursors((c) => c.slice(0, -1))}>
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Newer
        </Button>
        <Button data-testid="button-issue-backups-older" variant="outline" size="sm" disabled={!cat?.nextCursor} onClick={() => cat?.nextCursor && setCursors((c) => [...c, cat.nextCursor ?? undefined])}>
          Older<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {result && (
        <Note tone="ok">
          <p className="flex items-center gap-2 font-semibold" data-testid="text-issue-restore-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Restore completed{typeof result.message === "string" ? `: ${result.message}` : "."}</p>
          <div className="mt-2"><CountChips counts={resultCounts} testId="text-issue-restore-counts" /></div>
        </Note>
      )}

      {selected && previewMut.isPending && <Skeleton className="h-40 rounded-xl" />}

      {preview && selected && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5" aria-label="Restore preview" data-testid="panel-issue-restore-preview">
          <h3 className="text-sm font-semibold">Preview: data captured at {fmtDate(preview.createdAt)}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="mb-1 text-xs text-muted-foreground">Missing records that will be restored</p><CountChips counts={preview.counts} testId="text-preview-missing" /></div>
            <div><p className="mb-1 text-xs text-muted-foreground">Records in backup</p><CountChips counts={preview.backupCounts} testId="text-preview-backup" /></div>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <p>Existing issues preserved unchanged: <strong data-testid="text-preview-existing">{preview.existingIssues.toLocaleString()}</strong></p>
            <p>Attachment links switched to this backup's files: <strong data-testid="text-preview-relink">{preview.attachmentsToRelink.toLocaleString()}</strong></p>
          </div>
          {preview.warnings.length > 0 && (
            <Note tone="warn"><ul className="space-y-1">{preview.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{w}</li>)}</ul></Note>
          )}
          {hasConflicts && (
            <Note tone="bad"><p className="font-semibold">Restore blocked by conflicts</p><ul className="mt-1 list-disc space-y-1 pl-5">{preview.conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></Note>
          )}
          {running && <Note tone="warn">A backup is running. Restore is disabled until it finishes.</Note>}

          <form onSubmit={submitRestore} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="issue-restore-reason">Reason</Label>
              <Textarea id="issue-restore-reason" data-testid="input-issue-restore-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-describedby="issue-restore-reason-hint" aria-invalid={reason.length > 0 && !reasonValid} />
              <p id="issue-restore-reason-hint" className={`text-xs ${reason.length > 0 && !reasonValid ? "text-destructive" : "text-muted-foreground"}`}>5 to 500 characters ({trimmed.length} entered). Recorded in the audit trail.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-restore-confirm">Type <span className="font-mono">{CONFIRM}</span> to confirm</Label>
              <Input id="issue-restore-confirm" data-testid="input-issue-restore-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" data-testid="button-issue-restore-cancel" onClick={() => { setPreview(null); setSelected(null); setTyped(""); }}>Cancel</Button>
              <Button type="submit" size="sm" variant="destructive" data-testid="button-issue-restore" disabled={!canSubmit}>
                {restoreMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Restore missing issues
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground" aria-label="What issue recovery covers">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Info className="h-4 w-4" aria-hidden="true" />What recovery covers</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Backups contain full issues, comments, activity, links and finalized attachment bytes.</li>
          <li>Archived issues are restored with their archive state kept.</li>
          <li>Missing authors are recreated as disabled, archived reference accounts with no login, roles or permissions.</li>
          <li>Sites recreated by a restore have scheduling disabled.</li>
          <li>Original scan and page findings, and permissions, are not part of these backups.</li>
          <li>Existing issue and comment content is never overwritten. Matching attachment links may be switched to this backup's files; the preview shows how many.</li>
          <li>The last completed backup is the recovery point. Changes after it are not recoverable here; this is not a zero-loss guarantee.</li>
          <li>Backup manifests are stored in private R2 and are not passphrase-encrypted exports.</li>
        </ul>
      </section>
    </div>
  );
}
