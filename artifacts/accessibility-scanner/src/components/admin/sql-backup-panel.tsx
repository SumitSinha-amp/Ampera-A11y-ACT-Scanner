import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSqlBackupCatalog,
  useGetSqlBackups,
  useCreateSqlBackup,
  getGetSqlBackupCatalogQueryKey,
  getGetSqlBackupsQueryKey,
  getDownloadSqlBackupUrl,
  SqlBackupInputConfirmation,
  type SqlBackupJob,
  type SqlBackupTable,
} from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Copy, DatabaseZap, Download, Info, Loader2, RefreshCw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const CONFIRM = SqlBackupInputConfirmation.EXPORT_DATABASE;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const POLL_MS = 4000;
const RESTORE_CMD = "psql -X --set ON_ERROR_STOP=on --single-transaction --dbname=restore_database --file=backup.sql";

type Scope = "all" | "selected";
type Content = "schema-and-data" | "data-only";

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
  if (!Number.isFinite(n) || n < 0) return "Unknown";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
function fmtRows(n: number) {
  if (n < 0) return "unknown";
  return `~${n.toLocaleString()}`;
}
function isExpired(j: SqlBackupJob) {
  const t = new Date(j.expiresAt).getTime();
  return Number.isNaN(t) ? false : t <= Date.now();
}
function untilLabel(v: string) {
  const ms = new Date(v).getTime() - Date.now();
  if (Number.isNaN(ms)) return v;
  if (ms <= 0) return "expired";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min left`;
  return `${Math.floor(m / 60)} h ${m % 60} min left`;
}

function Note({ tone, children, testId }: { tone: "warn" | "bad" | "ok" | "info"; children: ReactNode; testId?: string }) {
  const cls = {
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    bad: "border-destructive/35 bg-destructive/10 text-destructive",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    info: "border-border bg-muted/40 text-foreground",
  }[tone];
  return <div data-testid={testId} className={`rounded-lg border p-3 text-xs leading-relaxed ${cls}`}>{children}</div>;
}

function Choice({ name, value, checked, onChange, title, desc, testId }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; desc: string; testId: string }) {
  return (
    <label className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors ${checked ? "border-primary/60 bg-primary/5" : "border-border hover:bg-muted/40"}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} data-testid={testId} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
}

function JobStatus({ j }: { j: SqlBackupJob }) {
  if (j.status === "running") return <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Running</span>;
  if (j.status === "failed") return <span className="inline-flex items-center gap-1 rounded-full border border-destructive/35 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><XCircle className="h-3 w-3" aria-hidden="true" />Failed</span>;
  if (isExpired(j)) return <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">Download expired</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Ready</span>;
}

export function SqlBackupPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const catalog = useGetSqlBackupCatalog({ query: { queryKey: getGetSqlBackupCatalogQueryKey(), refetchOnMount: "always" } });
  const jobs = useGetSqlBackups({
    query: {
      queryKey: getGetSqlBackupsQueryKey(),
      refetchOnMount: "always",
      refetchInterval: (q) => (q.state.data?.some((j) => j.status === "running") ? POLL_MS : false),
    },
  });

  const [scope, setScope] = useState<Scope>("all");
  const [content, setContent] = useState<Content>("schema-and-data");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [includeDeps, setIncludeDeps] = useState(true);
  const [typed, setTyped] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<{ id: string; text: string } | null>(null);

  const cat = catalog.data;
  const tables = useMemo(() => cat?.tables ?? [], [cat]);
  const byId = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const m = new Map<string, SqlBackupTable[]>();
    for (const t of tables) {
      if (q && !`${t.schema}.${t.name}`.toLowerCase().includes(q)) continue;
      const arr = m.get(t.schema) ?? [];
      arr.push(t);
      m.set(t.schema, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tables, search]);
  const visibleIds = useMemo(() => grouped.flatMap(([, ts]) => ts.map((t) => t.id)), [grouped]);

  // Transitive dependency closure for preview.
  const { additions, missingDeps } = useMemo(() => {
    const seen = new Set(selected);
    const added: string[] = [];
    const missing = new Set<string>();
    const stack = [...selected];
    while (stack.length) {
      const id = stack.pop() as string;
      for (const d of byId.get(id)?.dependencies ?? []) {
        if (!seen.has(d)) { seen.add(d); added.push(d); stack.push(d); }
      }
    }
    for (const id of selected) for (const d of byId.get(id)?.dependencies ?? []) if (!selected.has(d)) missing.add(d);
    return { additions: added.sort(), missingDeps: [...missing].sort() };
  }, [selected, byId]);

  const totals = useMemo(() => {
    const ids = scope === "all" ? tables.map((t) => t.id) : [...selected, ...(includeDeps ? additions : [])];
    let rows = 0, bytes = 0;
    for (const id of ids) { const t = byId.get(id); if (t) { rows += Math.max(0, t.estimatedRows); bytes += Math.max(0, t.sizeBytes); } }
    return { count: ids.length, rows, bytes };
  }, [scope, tables, selected, includeDeps, additions, byId]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSchema = (ids: string[], on: boolean) => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

  const running = !!jobs.data?.some((j) => j.status === "running");
  const create = useCreateSqlBackup();
  const confirmValid = typed === CONFIRM;
  const scopeValid = scope === "all" || selected.size > 0;
  const canSubmit = !!cat?.available && confirmValid && scopeValid && !create.isPending && !running;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      { data: { scope, content, tableIds: scope === "all" ? [] : [...selected], includeDependencies: scope === "selected" ? includeDeps : true, confirmation: CONFIRM } },
      {
        onSuccess: (job) => {
          setTyped("");
          qc.setQueryData<SqlBackupJob[]>(getGetSqlBackupsQueryKey(), (old) => [job, ...(old ?? []).filter((j) => j.id !== job.id)]);
          qc.invalidateQueries({ queryKey: getGetSqlBackupsQueryKey() });
          toast({ title: "SQL backup started", description: "Progress updates below. The file stays downloadable for 24 hours once ready." });
        },
        onError: (err) => toast({ title: "SQL backup could not start", description: errMessage(err), variant: "destructive" }),
      },
    );
  };

  const download = async (j: SqlBackupJob) => {
    setDownloadError(null);
    if (isExpired(j)) { setDownloadError({ id: j.id, text: "This download link has expired." }); return; }
    const href = `${BASE}${getDownloadSqlBackupUrl(encodeURIComponent(j.id))}`;
    setDownloading(j.id);
    try {
      // Lightweight authenticated preflight so permission/expiry failures surface here,
      // then hand the stream to the browser's native downloader (no in-memory buffering).
      const res = await fetch(href, { method: "HEAD", credentials: "include" });
      if (!res.ok && res.status !== 405 && res.status !== 501) {
        const reason = res.status === 410 ? "The download has expired." : res.status === 403 || res.status === 401 ? "Your session is not authorised to download this backup." : res.status === 404 ? "Backup not found." : `Server returned ${res.status}.`;
        throw new Error(reason);
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = j.filename || "backup.sql";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      const text = errMessage(e);
      setDownloadError({ id: j.id, text });
      toast({ title: "Download failed", description: text, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const copyCmd = async () => {
    try { await navigator.clipboard.writeText(RESTORE_CMD); toast({ title: "Restore command copied" }); }
    catch { toast({ title: "Could not copy", description: "Select the command text and copy it manually.", variant: "destructive" }); }
  };

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: getGetSqlBackupCatalogQueryKey() });
    qc.invalidateQueries({ queryKey: getGetSqlBackupsQueryKey() });
  };

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-label="SQL backup source">
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${!cat ? "bg-border" : cat.available ? "bg-emerald-500" : "bg-destructive"}`} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><DatabaseZap className="h-4 w-4 text-primary" aria-hidden="true" />PostgreSQL SQL backups</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Plain SQL dumps produced with pg_dump for disaster recovery or migration. Export only; nothing on this tab modifies or restores the live database.</p>
          </div>
          <Button data-testid="button-refresh-sql-backups" variant="outline" size="sm" onClick={refreshAll} disabled={catalog.isFetching || jobs.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${catalog.isFetching || jobs.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />Refresh
          </Button>
        </div>
        <div className="mt-3">
          {catalog.isLoading ? <Skeleton className="h-12" /> : catalog.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">Catalogue could not be loaded: {errMessage(catalog.error)} <Button size="sm" variant="link" onClick={() => catalog.refetch()}>Retry</Button></div>
          ) : cat ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                {[["Database", cat.database], ["Server", cat.serverVersion], ["pg_dump", cat.dumpVersion || "Unavailable"], ["Environment", cat.environment]].map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className="text-muted-foreground">{k}</dt><dd className="truncate font-mono" title={v} data-testid={`text-sql-${k.toLowerCase().replace(/[^a-z]/g, "")}`}>{v}</dd></div>
                ))}
              </dl>
              {!cat.available && <div className="mt-3"><Note tone="bad" testId="text-sql-unavailable"><strong>SQL backups are unavailable.</strong> {cat.unavailableReason || "The server cannot run pg_dump right now."}</Note></div>}
            </>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <form onSubmit={submit} className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="Create SQL backup">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Tables</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice name="sql-scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} title="All tables" desc={`${tables.length.toLocaleString()} tables in the database.`} testId="radio-sql-scope-all" />
              <Choice name="sql-scope" value="selected" checked={scope === "selected"} onChange={() => setScope("selected")} title="Select tables" desc="Choose specific tables to include data for." testId="radio-sql-scope-selected" />
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Content</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice name="sql-content" value="schema-and-data" checked={content === "schema-and-data"} onChange={() => setContent("schema-and-data")} title="Schema and data" desc="Recreates structure and rows. Best for a new empty database." testId="radio-sql-content-full" />
              <Choice name="sql-content" value="data-only" checked={content === "data-only"} onChange={() => setContent("data-only")} title="Data only" desc="Rows only, for a database that already has a compatible schema." testId="radio-sql-content-data" />
            </div>
            {content === "schema-and-data" && scope === "selected" && (
              <Note tone="info"><span className="flex gap-1.5"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>With selected tables, the file still contains <strong>every schema definition</strong> in the database (tables, types, functions, sequences) but <strong>row data only for the selected tables and their dependencies</strong>. This avoids restores failing on missing types or functions; unselected tables are created empty.</span></span></Note>
            )}
            {content === "data-only" && (
              <Note tone="warn"><span className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>Data-only assumes the target already has a compatible schema and that the target tables are <strong>empty</strong>. Foreign keys, cyclic relationships and audit triggers may require an administrator to prepare the target (for example ordering loads or temporarily disabling triggers). This is not a safe merge into a database that already holds rows.</span></span></Note>
            )}
          </fieldset>

          {scope === "selected" && (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input data-testid="input-sql-table-search" aria-label="Search tables" placeholder="Search schema.table" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-8" />
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="outline" data-testid="button-sql-select-all" onClick={() => toggleSchema(visibleIds, true)} disabled={visibleIds.length === 0}>Select {search ? "shown" : "all"}</Button>
                  <Button type="button" size="sm" variant="ghost" data-testid="button-sql-clear" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>Clear</Button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                {catalog.isLoading ? <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
                  : grouped.length === 0 ? <p className="p-6 text-center text-xs text-muted-foreground">{search ? `No tables match "${search}".` : "No tables reported by the catalogue."}</p>
                  : grouped.map(([schema, ts]) => {
                    const ids = ts.map((t) => t.id);
                    const n = ids.filter((id) => selected.has(id)).length;
                    return (
                      <div key={schema} role="group" aria-label={`Schema ${schema}`}>
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-muted px-3 py-1.5">
                          <span className="font-mono text-xs font-semibold">{schema} <span className="font-sans font-normal text-muted-foreground">{n}/{ts.length}</span></span>
                          <button type="button" data-testid={`button-sql-schema-${schema}`} className="rounded text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => toggleSchema(ids, n < ts.length)}>{n < ts.length ? "Select schema" : "Clear schema"}</button>
                        </div>
                        <ul>
                          {ts.map((t) => {
                            const on = selected.has(t.id);
                            const auto = !on && includeDeps && additions.includes(t.id);
                            return (
                              <li key={t.id} className="border-b border-border/50 last:border-0">
                                <label className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-muted/40 ${on ? "bg-primary/5" : ""}`}>
                                  <input type="checkbox" checked={on} onChange={() => toggle(t.id)} data-testid={`checkbox-sql-table-${t.id}`} className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-mono text-xs" title={t.id}>{t.name}</span>
                                    {(auto || t.dependencies.length > 0) && <span className="block text-[11px] text-muted-foreground">{auto ? "Added as dependency" : `Depends on ${t.dependencies.length}`}</span>}
                                  </span>
                                  <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{fmtRows(t.estimatedRows)} rows<br />{fmtBytes(t.sizeBytes)}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
                <input type="checkbox" checked={includeDeps} onChange={(e) => setIncludeDeps(e.target.checked)} data-testid="checkbox-sql-include-deps" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
                <span className="text-sm"><span className="font-medium">Include foreign-key dependencies</span><span className="block text-xs text-muted-foreground">Adds referenced tables so every selected row has the rows it points to. Recommended.</span></span>
              </label>
              {includeDeps && additions.length > 0 && (
                <Note tone="info" testId="text-sql-dependency-additions"><p className="mb-1 font-medium">{additions.length} {additions.length === 1 ? "table" : "tables"} will be added as dependencies:</p><div className="flex flex-wrap gap-1">{additions.map((d) => <span key={d} className="rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[11px]">{d}</span>)}</div></Note>
              )}
              {!includeDeps && missingDeps.length > 0 && (
                <Note tone="warn" testId="text-sql-dependency-warning"><p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Referenced tables are not selected</p><p className="mb-1">Restoring rows that reference these tables can fail foreign-key checks unless the target already holds matching rows:</p><div className="flex flex-wrap gap-1">{missingDeps.map((d) => <span key={d} className="rounded border border-amber-500/30 px-1.5 py-0.5 font-mono text-[11px]">{d}</span>)}</div></Note>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs" data-testid="text-sql-summary" aria-live="polite">
            <span><strong className="tabular-nums">{totals.count.toLocaleString()}</strong> tables with data</span>
            <span className="text-muted-foreground">~{totals.rows.toLocaleString()} rows estimated</span>
            <span className="text-muted-foreground">{fmtBytes(totals.bytes)} on disk</span>
          </div>

          <Note tone="warn">
            <p className="mb-1 font-semibold">Before you export</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>The SQL file is <strong>not encrypted</strong>. It may contain password hashes, session tokens and configuration secrets. Store it like a credential.</li>
              <li>Files in external R2 or App Storage (attachments, evidence objects) are <strong>not included</strong>.</li>
              <li>Server-level roles and grants are <strong>not included</strong>; create them on the target first.</li>
            </ul>
          </Note>

          <div className="space-y-1.5">
            <Label htmlFor="sql-confirm">Type <span className="font-mono">{CONFIRM}</span> to confirm</Label>
            <Input id="sql-confirm" data-testid="input-sql-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby="sql-confirm-hint" />
            <p id="sql-confirm-hint" className="text-xs text-muted-foreground">
              {running ? "A backup is already running. Wait for it to finish." : !scopeValid ? "Select at least one table." : cat && !cat.available ? "Backups are unavailable on this server." : confirmValid ? "Confirmed." : "Case sensitive."}
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" data-testid="button-create-sql-backup" disabled={!canSubmit} className="w-full sm:w-auto">
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <DatabaseZap className="mr-2 h-4 w-4" aria-hidden="true" />}Create SQL backup
            </Button>
          </div>
        </form>

        <aside className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground" aria-label="Restoring a SQL backup">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Info className="h-4 w-4" aria-hidden="true" />Restoring</h3>
          <p>Restore into a <strong className="text-foreground">new, empty database</strong>, never over the live one:</p>
          <div className="relative rounded-md border border-border bg-background">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all p-2.5 pr-9 font-mono text-[11px] text-foreground" data-testid="text-sql-restore-command">{RESTORE_CMD}</pre>
            <button type="button" onClick={copyCmd} data-testid="button-copy-restore-command" aria-label="Copy restore command" className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><Copy className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
          <ul className="list-disc space-y-1 pl-4">
            <li>Target must run the same or a newer supported PostgreSQL version{cat ? ` (source ${cat.serverVersion})` : ""}.</li>
            <li>Required extension binaries must be installed on the target server.</li>
            <li>Use a psql compatible with the pg_dump that produced the file{cat?.dumpVersion ? ` (${cat.dumpVersion})` : ""}.</li>
            <li>--single-transaction with ON_ERROR_STOP rolls everything back on the first error.</li>
            <li>Ampera has no in-app restore for SQL backups.</li>
          </ul>
          <p>Downloads are available for 24 hours. The backup file remains retained privately in R2 after the link expires.</p>
          <p>Large SQL backups stream directly to private storage without creating a complete local file. Related-table selection can include partition tables. Exports remain subject to PostgreSQL timeouts and storage-provider multipart limits.</p>
        </aside>
      </div>

      <section className="rounded-xl border border-border bg-card" aria-label="SQL backup jobs">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold">Backup jobs</h3>
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">{running ? "Checking progress every few seconds" : jobs.dataUpdatedAt ? `Updated ${new Date(jobs.dataUpdatedAt).toLocaleTimeString()}` : ""}</span>
        </div>
        {jobs.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          : jobs.isError ? <div role="alert" className="p-6 text-center text-sm text-destructive">Could not load backup jobs: {errMessage(jobs.error)} <Button size="sm" variant="link" onClick={() => jobs.refetch()}>Retry</Button></div>
          : !jobs.data || jobs.data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center"><DatabaseZap className="h-8 w-8 text-muted-foreground" aria-hidden="true" /><p className="text-sm font-medium">No SQL backups yet</p><p className="text-xs text-muted-foreground">Backups you create appear here with progress, checksum and download.</p></div>
          ) : (
            <ul className="divide-y divide-border/60">
              {jobs.data.map((j) => {
                const canDownload = j.status === "ready" && !isExpired(j);
                const included = [...j.tableIds, ...j.addedDependencies];
                return (
                  <li key={j.id} data-testid={`row-sql-backup-${j.id}`} className="space-y-2 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2"><JobStatus j={j} /><span className="text-sm font-medium">{fmtDate(j.createdAt)}</span></div>
                        <p className="text-xs text-muted-foreground">
                          {j.scope === "all" ? "All tables" : "Selected tables"} · {j.content === "schema-and-data" ? "Schema and data" : "Data only"} · <span className="font-mono">{j.database}</span> {j.serverVersion}
                        </p>
                        {j.status === "running" && <p className="text-xs text-amber-800 dark:text-amber-300" data-testid={`text-sql-stage-${j.id}`}>Stage: {j.stage || "starting"}</p>}
                      </div>
                      {j.status === "ready" && (
                        <Button size="sm" variant={canDownload ? "default" : "outline"} data-testid={`button-download-sql-${j.id}`} disabled={!canDownload || downloading === j.id} onClick={() => download(j)} className="w-full shrink-0 sm:w-auto">
                          {downloading === j.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
                          {canDownload ? `Download ${fmtBytes(j.sizeBytes)}` : "Expired"}
                        </Button>
                      )}
                    </div>
                    {j.status === "failed" && <Note tone="bad" testId={`text-sql-error-${j.id}`}><strong>Failed{j.stage ? ` during ${j.stage}` : ""}:</strong> {j.error || "No error detail reported."}</Note>}
                    {downloadError?.id === j.id && <Note tone="bad" testId={`text-sql-download-error-${j.id}`}>{downloadError.text}</Note>}
                    {j.status === "ready" && (
                      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
                        <dt className="text-muted-foreground">File</dt><dd className="break-all font-mono">{j.filename}</dd>
                        <dt className="text-muted-foreground">SHA-256</dt><dd className="break-all font-mono text-[11px]" data-testid={`text-sql-sha-${j.id}`}>{j.sha256}</dd>
                        <dt className="text-muted-foreground">Download expires</dt><dd>{fmtDate(j.expiresAt)} ({untilLabel(j.expiresAt)})</dd>
                      </dl>
                    )}
                    {j.scope === "selected" && included.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Tables with data ({included.length}{j.addedDependencies.length ? `, ${j.addedDependencies.length} added as dependencies` : ""})</summary>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {j.tableIds.map((t) => <span key={t} className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">{t}</span>)}
                          {j.addedDependencies.map((t) => <span key={t} className="rounded border border-dashed border-primary/40 px-1.5 py-0.5 font-mono text-[11px]" title="Added as dependency">{t}</span>)}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </div>
  );
}
