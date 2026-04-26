import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Shield,
  ShieldCheck,
  Trash2,
  CheckCircle2,
  Plus,
  Eye,
  Sun,
  Moon,
  Monitor,
  ListFilter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const ELEMENT_VIEWER_LS_KEY = "a11y-element-viewer-enabled";

export function isElementViewerEnabled(): boolean {
  try {
    return localStorage.getItem(ELEMENT_VIEWER_LS_KEY) === "true";
  } catch {
    return false;
  }
}

export const PROXY_LS_KEY = "a11y-scanner-proxy-pacs";
export const ACTIVE_PROXY_KEY = "a11y-scanner-active-proxy";

export const URL_LIMIT_LS_KEY = "a11y-url-limit-enabled";
export const URL_LIMIT_VALUE_LS_KEY = "a11y-url-limit-value";
export const DEFAULT_URL_LIMIT = 100;

export function isUrlLimitEnabled(): boolean {
  try {
    return localStorage.getItem(URL_LIMIT_LS_KEY) === "true";
  } catch {
    return false;
  }
}

export function getUrlLimitValue(): number {
  try {
    const v = parseInt(localStorage.getItem(URL_LIMIT_VALUE_LS_KEY) ?? "", 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_URL_LIMIT;
  } catch {
    return DEFAULT_URL_LIMIT;
  }
}

export const THEME_LS_KEY = "a11y-theme";
export type Theme = "light" | "dark" | "system";

export function getSavedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_LS_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const useDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", useDark);
}

export function loadSavedProxies(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PROXY_LS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function getActiveProxy(): string {
  return localStorage.getItem(ACTIVE_PROXY_KEY) || "";
}

export default function Settings() {
  const { toast } = useToast();
  const [savedProxies, setSavedProxies] = useState<string[]>([]);
  const [activeProxy, setActiveProxy] = useState<string>("");
  const [newPacUrl, setNewPacUrl] = useState("");
  const [elementViewerEnabled, setElementViewerEnabledState] =
    useState<boolean>(false);
  const [theme, setThemeState] = useState<Theme>("system");
  const [urlLimitEnabled, setUrlLimitEnabledState] = useState(false);
  const [urlLimitValue, setUrlLimitValueState] = useState(DEFAULT_URL_LIMIT);
  const [urlLimitInput, setUrlLimitInput] = useState(String(DEFAULT_URL_LIMIT));

  useEffect(() => {
    setSavedProxies(loadSavedProxies());
    setActiveProxy(getActiveProxy());
    setElementViewerEnabledState(isElementViewerEnabled());
    setThemeState(getSavedTheme());
    setUrlLimitEnabledState(isUrlLimitEnabled());
    const saved = getUrlLimitValue();
    setUrlLimitValueState(saved);
    setUrlLimitInput(String(saved));
  }, []);

  const handleThemeChange = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_LS_KEY, t);
    applyTheme(t);
    toast({
      title: `Theme set to ${t === "system" ? "system default" : t === "dark" ? "dark" : "light"}`,
    });
  };

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
      {/* Theme */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>
            Choose a colour scheme for the interface.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Monitor },
              ] as { value: Theme; label: string; icon: React.ElementType }[]
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleThemeChange(value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  theme === value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/40 hover:bg-muted/40 text-muted-foreground"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      {/* URL Limit */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-muted-foreground" />
            <CardTitle>URL Limit</CardTitle>
          </div>
          <CardDescription>
            Restrict the number of URLs that can be added to a scan. When
            enabled, adding URLs beyond the limit is blocked and an alert is
            shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable URL limit</p>
              <p className="text-xs text-muted-foreground mt-1">
                {urlLimitEnabled
                  ? `Scans are limited to ${urlLimitValue} URL${urlLimitValue === 1 ? "" : "s"}`
                  : "No limit — scans can include any number of URLs"}
              </p>
            </div>
            <Switch
              checked={urlLimitEnabled}
              onCheckedChange={(v) => {
                setUrlLimitEnabledState(v);
                localStorage.setItem(URL_LIMIT_LS_KEY, String(v));
                window.dispatchEvent(new CustomEvent("a11y-url-limit-changed"));
                toast({
                  title: v
                    ? `URL limit enabled (${urlLimitValue})`
                    : "URL limit disabled",
                });
              }}
            />
          </div>

          {urlLimitEnabled && (
            <div className="space-y-2 pt-1 border-t">
              <Label htmlFor="url-limit-input">Maximum number of URLs</Label>
              <div className="flex gap-2 items-center max-w-xs">
                <Input
                  id="url-limit-input"
                  type="number"
                  min={1}
                  max={10000}
                  value={urlLimitInput}
                  onChange={(e) => setUrlLimitInput(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(urlLimitInput, 10);
                    if (!Number.isFinite(n) || n < 1) {
                      setUrlLimitInput(String(urlLimitValue));
                      return;
                    }
                    const clamped = Math.min(Math.max(n, 1), 10000);
                    setUrlLimitValueState(clamped);
                    setUrlLimitInput(String(clamped));
                    localStorage.setItem(
                      URL_LIMIT_VALUE_LS_KEY,
                      String(clamped),
                    );
                    window.dispatchEvent(
                      new CustomEvent("a11y-url-limit-changed"),
                    );
                    toast({ title: `URL limit set to ${clamped}` });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  URLs maximum
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter a number between 1 and 10,000. Changes take effect
                immediately on the scan page.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Proxy PAC Setting */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Proxy PAC Configuration</CardTitle>
          </div>
          <CardDescription>
            Add and manage PAC file URLs for scanning environments behind a
            corporate proxy. The active PAC URL is used when proxy mode is
            enabled on the scan page.
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") addProxy();
                }}
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
                    <code
                      className="flex-1 text-xs font-mono truncate"
                      title={pac}
                    >
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
            <p className="text-sm text-muted-foreground">
              No PAC URLs saved yet. Add one above.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Element Viewer */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Element Viewer</CardTitle>
          </div>
          <CardDescription>
            When enabled, a side panel appears next to Page Results on each scan
            detail page. Click any issue occurrence to inspect its HTML source
            and live page preview, and navigate between occurrences with Prev /
            Next controls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Element Viewer</p>
              <p className="text-xs text-muted-foreground mt-1">
                Shows HTML source viewer and live page preview alongside issue
                results
              </p>
            </div>
            <Switch
              checked={elementViewerEnabled}
              onCheckedChange={(v) => {
                setElementViewerEnabledState(v);
                localStorage.setItem(ELEMENT_VIEWER_LS_KEY, String(v));
                window.dispatchEvent(new Event("storage"));
                toast({
                  title: v
                    ? "Element Viewer enabled"
                    : "Element Viewer disabled",
                });
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
