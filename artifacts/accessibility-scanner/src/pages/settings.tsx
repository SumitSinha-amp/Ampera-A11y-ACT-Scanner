import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Shield, ShieldCheck, Trash2, CheckCircle2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const PROXY_LS_KEY = "a11y-scanner-proxy-pacs";
export const ACTIVE_PROXY_KEY = "a11y-scanner-active-proxy";

export function loadSavedProxies(): string[] {
  try { return JSON.parse(localStorage.getItem(PROXY_LS_KEY) || "[]"); } catch { return []; }
}

export function getActiveProxy(): string {
  return localStorage.getItem(ACTIVE_PROXY_KEY) || "";
}

export default function Settings() {
  const { toast } = useToast();
  const [savedProxies, setSavedProxies] = useState<string[]>([]);
  const [activeProxy, setActiveProxy] = useState<string>("");
  const [newPacUrl, setNewPacUrl] = useState("");

  useEffect(() => {
    setSavedProxies(loadSavedProxies());
    setActiveProxy(getActiveProxy());
  }, []);

  const addProxy = () => {
    const url = newPacUrl.trim();
    if (!url) return;
    const existing = loadSavedProxies().filter((p) => p !== url);
    const updated = [url, ...existing].slice(0, 8);
    localStorage.setItem(PROXY_LS_KEY, JSON.stringify(updated));
    setSavedProxies(updated);
    if (!activeProxy) {
      localStorage.setItem(ACTIVE_PROXY_KEY, url);
      setActiveProxy(url);
    }
    setNewPacUrl("");
    toast({ title: "PAC URL saved" });
  };

  const selectProxy = (url: string) => {
    localStorage.setItem(ACTIVE_PROXY_KEY, url);
    setActiveProxy(url);
    toast({ title: "Active proxy updated" });
  };

  const clearActiveProxy = () => {
    localStorage.removeItem(ACTIVE_PROXY_KEY);
    setActiveProxy("");
    toast({ title: "Active proxy cleared" });
  };

  const removeProxy = (url: string) => {
    const remaining = loadSavedProxies().filter((p) => p !== url);
    localStorage.setItem(PROXY_LS_KEY, JSON.stringify(remaining));
    setSavedProxies(remaining);
    if (activeProxy === url) {
      localStorage.removeItem(ACTIVE_PROXY_KEY);
      setActiveProxy("");
    }
    toast({ title: "PAC URL removed" });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure scanner preferences and proxy settings.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Proxy PAC Configuration</CardTitle>
          </div>
          <CardDescription>
            Add and manage PAC file URLs for scanning environments behind a corporate proxy.
            The active PAC URL is used when proxy mode is enabled on the scan page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium">Active Proxy PAC</p>
            {activeProxy ? (
              <div className="flex items-center gap-2 flex-wrap">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <code className="text-sm font-mono text-blue-700 dark:text-blue-400 flex-1 break-all">
                  {activeProxy}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={clearActiveProxy}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No active proxy PAC set. Select one below or add a new one.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Add PAC URL</Label>
            <div className="flex gap-2">
              <Input
                placeholder="http://example.com/proxy/autoproxy.pac"
                value={newPacUrl}
                onChange={(e) => setNewPacUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addProxy(); }}
                className="font-mono text-sm"
              />
              <Button onClick={addProxy} disabled={!newPacUrl.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
          </div>

          {savedProxies.length > 0 ? (
            <div className="space-y-2">
              <Label>Saved PAC URLs</Label>
              <div className="border rounded-md overflow-hidden divide-y">
                {savedProxies.map((pac) => (
                  <div
                    key={pac}
                    className={`flex items-center gap-3 px-4 py-3 group ${activeProxy === pac ? "bg-blue-50 dark:bg-blue-950/20" : "hover:bg-muted/40"}`}
                  >
                    <code className="flex-1 text-xs font-mono truncate" title={pac}>
                      {pac}
                    </code>
                    <div className="flex items-center gap-2 shrink-0">
                      {activeProxy === pac ? (
                        <Badge
                          variant="secondary"
                          className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs"
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => selectProxy(pac)}
                        >
                          Use this
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeProxy(pac)}
                        aria-label="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No PAC URLs saved yet. Add one above.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
