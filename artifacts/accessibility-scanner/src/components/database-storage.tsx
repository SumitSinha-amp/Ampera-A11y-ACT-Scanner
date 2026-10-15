import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DatabaseStorageStatus } from "@workspace/api-client-react";
import { AlertTriangle, Database, Download, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useAuth, isAdmin, isSuperAdmin } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function storageRequest(method = "GET", body?: unknown): Promise<DatabaseStorageStatus> {
  const suffix = method === "POST" ? "/check" : "";
  const response = await fetch(`${BASE}/api/admin/database-storage${suffix}`, {
    method, credentials: "include", headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? "Could not load database storage monitoring.");
  }
  return response.json();
}
function useStorageStatus() {
  const { user } = useAuth();
  const key = ["database-storage", user?.id];
  const query = useQuery({
    queryKey: key, queryFn: () => storageRequest(), enabled: isAdmin(user),
    staleTime: 30_000, refetchInterval: 60_000,
  });
  return { ...query, key };
}
export function DatabaseStorageWarning() {
  const { user } = useAuth();
  const query = useStorageStatus();
  const data = query.data;
  if (!isAdmin(user) || !data?.enabled) return null;
  const unknown = query.isError || data.status === "unavailable" || data.status === "stale";
  if (!unknown && data.status !== "low") return null;
  return (
    <div role="alert" className={`mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3 rounded-xl border p-3 text-sm ${
      unknown ? "border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100" :
        "border-red-500/50 bg-red-50 text-red-950 dark:bg-red-950 dark:text-red-100"
    }`} data-testid="database-storage-warning">
      <div className="flex min-w-0 flex-1 gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{unknown ? "Database storage monitoring unavailable" : "Database storage critically low"}</p>
          <p>{unknown ? "Current remaining storage could not be confirmed. Check Azure Monitor." :
            `${((data.freeBytes ?? 0) / 1e9).toFixed(2)} GB remaining. Increase PostgreSQL storage in Azure before writes are blocked.`}</p>
          {data.sampledAt && <p className="mt-1 text-xs">Last Azure reading: {new Date(data.sampledAt).toLocaleString()}</p>}
        </div>
      </div>
      <Link href="/settings?section=database-storage" className="shrink-0 underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Storage settings</Link>
    </div>
  );
}
export function DatabaseStorageSettings() {
  const { user } = useAuth();
  const query = useStorageStatus();
  const client = useQueryClient();
  const { toast } = useToast();
  const [resourceId, setResourceId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!dirty && query.data) {
      setResourceId(query.data.resourceId);
      setEnabled(query.data.enabled);
    }
  }, [query.data?.resourceId, query.data?.enabled, dirty]);
  if (!isAdmin(user)) return null;
  const editable = isSuperAdmin(user);
  const data = query.data;
  async function update(method: "PUT" | "POST") {
    setBusy(true); setError("");
    try {
      const value = await storageRequest(method, method === "PUT" ? { resourceId: resourceId.trim(), enabled } : undefined);
      client.setQueryData(query.key, value);
      if (method === "PUT") setDirty(false);
      toast({ title: method === "PUT" ? "Storage monitoring settings saved" : "Storage check completed", description: value.message });
    } catch (err) { setError(err instanceof Error ? err.message : "Storage monitoring could not be updated."); }
    finally { setBusy(false); }
  }
  return (
    <Card id="database-storage" className="scroll-mt-6 rounded-2xl" data-testid="database-storage-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" aria-hidden />Database storage alerts</CardTitle>
        <CardDescription>Warn administrators when Azure PostgreSQL has 5 GB or less remaining. Azure metrics are checked every 5 minutes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading && <p role="status" className="text-sm">Loading storage monitoring…</p>}
        {query.isError && <p role="alert" className="text-sm text-destructive">Storage monitoring settings could not be loaded. <button className="underline" onClick={() => void query.refetch()}>Retry</button></p>}
        {data && <div className="rounded-xl border bg-muted/40 p-3 text-sm" aria-live="polite">
          <p className="font-semibold">{data.message}</p>
          {data.freeBytes !== null && <p>Last measured free storage: {(data.freeBytes / 1e9).toFixed(2)} GB</p>}
          {data.sampledAt && <p className="mt-1 text-xs text-muted-foreground">Azure measurement: {new Date(data.sampledAt).toLocaleString()}</p>}
          {data.enabled && !data.identityAvailable && <p className="mt-2">Azure managed identity is unavailable in this environment. The app cannot read live storage yet.</p>}
        </div>}
        <div className="space-y-2">
          <Label htmlFor="database-storage-resource">Azure PostgreSQL server resource ID</Label>
          <Input id="database-storage-resource" value={resourceId} disabled={!editable || busy || !data}
            onChange={e => { setResourceId(e.target.value); setDirty(true); }}
            aria-describedby="database-storage-resource-help"
            placeholder="/subscriptions/…/resourceGroups/…/providers/Microsoft.DBforPostgreSQL/flexibleServers/…" />
          <p id="database-storage-resource-help" className="text-xs text-muted-foreground">Copy the Resource ID from your PostgreSQL Flexible Server’s JSON View in Azure. This is not a database password or connection string.</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="database-storage-enabled">Enable in-app warning and administrator notifications</Label>
          <Switch id="database-storage-enabled" checked={enabled} disabled={!editable || busy || !data}
            onCheckedChange={value => { setEnabled(value); setDirty(true); }} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {editable ? <div className="flex flex-wrap gap-2">
          <Button onClick={() => void update("PUT")} disabled={busy || !dirty || !data}>Save storage settings</Button>
          <Button variant="outline" onClick={() => void update("POST")} disabled={busy || !data?.enabled || dirty}>
            <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />Check now
          </Button>
        </div> : <p className="text-xs text-muted-foreground">A Super Admin can change this configuration.</p>}
        <details className="rounded-xl border p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Activate both app and email alerts in Azure</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Enable the system-assigned managed identity on the Azure App Service hosting Ampera.</li>
            <li>On the PostgreSQL server’s Access control (IAM), grant that identity the <strong>Monitoring Reader</strong> role. The app reads only Azure’s Storage Free metric.</li>
            <li>Save the server resource ID above, enable monitoring, and use Check now on the Azure-hosted app. This Replit preview cannot use the App Service’s identity.</li>
            <li>Download the email alert template below. In Azure, open <strong>Deploy a custom template → Build your own template → Load file</strong>. Enter the database’s Azure region and the recipient email, then review and deploy.</li>
            <li>Open the resulting Azure Monitor action group and use its Test action to confirm email delivery. Azure may charge for alert rules. Deployment is not performed automatically.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">The email rule runs independently of Ampera, evaluates every minute, and resolves after storage recovers. App notifications are sent once per low-storage episode. Email activation is managed in Azure; Ampera does not claim or verify it is enabled.</p>
          <p className="mt-2 text-xs text-muted-foreground">Threshold: 5 GB = 5,000,000,000 bytes. Azure may already block writes below 5 GiB or at 95% usage, so this is a critical warning, not a guarantee of advance notice.</p>
        </details>
        {data?.resourceId && !dirty && <Button variant="outline" asChild>
          <a href={`${BASE}/api/admin/database-storage/azure-template`}>
            <Download className="mr-2 h-4 w-4" aria-hidden />Download Azure email alert template
          </a>
        </Button>}
      </CardContent>
    </Card>
  );
}
