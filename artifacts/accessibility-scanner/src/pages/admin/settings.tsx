import { useEffect, useState } from "react";
import {
  Loader2, Save, Mail, Eye, EyeOff, Check, XCircle,
  Bot, Shield, Zap, Server, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { invalidateAIConfigCache } from "@/components/ai-config-cache";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface AllSettings {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  ai_engine_enabled: string;
  ai_external_enabled: string;
  ai_external_provider: string;
  ai_external_api_key: string;
  ai_external_model: string;
}

const DEFAULTS: AllSettings = {
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_from: "noreply@amperatech.ai",
  ai_engine_enabled: "true",
  ai_external_enabled: "false",
  ai_external_provider: "gemini",
  ai_external_api_key: "",
  ai_external_model: "",
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-foreground">
        {label}
        {hint && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AllSettings>(DEFAULTS);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [tab, setTab] = useState<"ai" | "smtp">("ai");

  useEffect(() => {
    fetch(`${BASE}/api/admin/settings`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: Partial<AllSettings>) => {
        setSettings((prev) => ({ ...prev, ...data }));
        setFetching(false);
      })
      .catch(() => setFetching(false));
  }, []);

  function setField(key: keyof AllSettings) {
    return (e: { target: { value: string } }) =>
      setSettings((p) => ({ ...p, [key]: e.target.value }));
  }

  function toggleField(key: "ai_engine_enabled" | "ai_external_enabled") {
    return (val: boolean) =>
      setSettings((p) => ({ ...p, [key]: val ? "true" : "false" }));
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = { ...settings };
      if (!apiKeyDirty) body["ai_external_api_key"] = "••••••••";
      const res = await fetch(`${BASE}/api/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      setApiKeyDirty(false);
      invalidateAIConfigCache();
      toast({ title: "Settings saved", description: "Configuration updated successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${BASE}/api/admin/settings/test-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: "Test email sent successfully." });
      } else {
        setTestResult({ ok: false, message: data.error || "Failed to send test email." });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error while sending test email." });
    } finally {
      setTesting(false);
    }
  };

  const modelPlaceholder = settings.ai_external_provider === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash";
  const apiKeyIsSet = settings.ai_external_api_key === "••••••••";

  return (
    <div className="relative w-full space-y-6 pb-10 pt-4">
      <header className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Shield className="h-5 w-5"/>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-primary">Super admin</p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">System settings</h1>
          </div>
        </div>
        {fetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </header>

      <div className="relative rounded-[22px] border border-border/50 bg-card/60 backdrop-blur-xl shadow-sm overflow-hidden">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="flex h-auto w-full items-center justify-start gap-0 rounded-none border-b border-border/50 bg-transparent p-0">
            <TabsTrigger value="ai" className="inline-flex items-center gap-2 rounded-none border-b-2 border-transparent px-5 py-3 text-xs font-semibold text-muted-foreground transition-all data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground">
              <Bot className="h-3.5 w-3.5"/> AI settings
            </TabsTrigger>
            <TabsTrigger value="smtp" className="inline-flex items-center gap-2 rounded-none border-b-2 border-transparent px-5 py-3 text-xs font-semibold text-muted-foreground transition-all data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground">
              <Server className="h-3.5 w-3.5"/> SMTP
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="ai" className="p-6 mt-0 space-y-6">
            {/* Rule-based engine */}
            <div className="rounded-2xl border border-border/50 bg-card/30 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                  <Zap className="h-5 w-5"/>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Rule-based AI engine</p>
                  <p className="text-[11px] text-muted-foreground">Local heuristic engine — no API key required</p>
                </div>
                <div className="ml-auto">
                  <Switch aria-label="Enable rule-based AI engine" checked={settings.ai_engine_enabled === "true"} onCheckedChange={toggleField("ai_engine_enabled")}/>
                </div>
              </div>
              <div className={`rounded-xl border p-3 text-xs ${settings.ai_engine_enabled === "true" ? "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400" : "border-border bg-muted/50 text-muted-foreground"}`}>
                {settings.ai_engine_enabled === "true" ? (
                  <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5"/>Engine active — generates fix suggestions for all 78+ rules without external calls</span>
                ) : "Engine disabled"}
              </div>
            </div>

            {/* External AI */}
            <div className="rounded-2xl border border-border/50 bg-card/30 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                  <Bot className="h-5 w-5"/>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">External AI (optional)</p>
                  <p className="text-[11px] text-muted-foreground">Augments rule-based suggestions with LLM explanations</p>
                </div>
                <div className="ml-auto">
                  <Switch aria-label="Enable external AI" checked={settings.ai_external_enabled === "true"} onCheckedChange={toggleField("ai_external_enabled")}/>
                </div>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="ai-external-provider" label="AI provider">
                  <Select value={settings.ai_external_provider} onValueChange={(v) => setSettings((p) => ({ ...p, ai_external_provider: v }))}>
                    <SelectTrigger id="ai-external-provider" className="h-9 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="ai-external-model" label="Model (optional)" hint="leave blank for default">
                  <Input id="ai-external-model" value={settings.ai_external_model} onChange={setField("ai_external_model")} placeholder={modelPlaceholder} className="h-9 text-xs bg-background"/>
                </Field>
                <div className="sm:col-span-2">
                  <Field id="ai-external-api-key" label="API key" hint="stored encrypted, never sent to browser">
                    <div className="relative">
                      <Input 
                        id="ai-external-api-key"
                        type={showApiKey ? "text" : "password"} 
                        placeholder={apiKeyIsSet && !apiKeyDirty ? "••••••••  (saved — enter new key to replace)" : settings.ai_external_provider === "gemini" ? "AIzaSy..." : "sk-..."}
                        value={apiKeyDirty ? settings.ai_external_api_key : ""}
                        onChange={(e) => {
                          setApiKeyDirty(true);
                          setSettings((p) => ({ ...p, ai_external_api_key: e.target.value }));
                        }}
                        className="h-9 pr-10 text-xs bg-background"
                      />
                      <button
                        type="button"
                        aria-label={showApiKey ? "Hide API key" : "Show API key"}
                        className="absolute inset-y-0 right-1 z-10 flex w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onClick={() => setShowApiKey((v) => !v)}
                      >
                        {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </Field>
                </div>
              </div>

              <div className="flex pt-2">
                <Button onClick={handleSave} disabled={saving} className="h-9 w-full sm:w-auto text-xs font-semibold shadow-sm">
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> : <Save className="h-3.5 w-3.5 mr-2"/>} Save AI settings
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="smtp" className="p-6 mt-0 space-y-6">
            {/* SMTP config */}
            <div className="rounded-2xl border border-border/50 bg-card/30 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400">
                  <Mail className="h-5 w-5"/>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">SMTP configuration</p>
                  <p className="text-[11px] text-muted-foreground">Used for scan completion and alert emails</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="smtp-host" label="SMTP host"><Input id="smtp-host" value={settings.smtp_host} onChange={setField("smtp_host")} placeholder="smtp.example.com" className="h-9 text-xs bg-background"/></Field>
                <Field id="smtp-port" label="Port"><Input id="smtp-port" value={settings.smtp_port} onChange={setField("smtp_port")} placeholder="587" className="h-9 text-xs bg-background"/></Field>
                <Field id="smtp-username" label="Username"><Input id="smtp-username" value={settings.smtp_user} onChange={setField("smtp_user")} placeholder="username" className="h-9 text-xs bg-background"/></Field>
                <Field id="smtp-password" label="Password" hint="encrypted at rest">
                  <div className="relative">
                    <Input 
                      id="smtp-password"
                      type={showPass ? "text" : "password"} 
                      value={settings.smtp_pass} 
                      onChange={setField("smtp_pass")} 
                      placeholder="••••••••" 
                      className="h-9 pr-10 text-xs bg-background"
                    />
                    <button
                      type="button"
                      aria-label={showPass ? "Hide SMTP password" : "Show SMTP password"}
                      className="absolute inset-y-0 right-1 z-10 flex w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onClick={() => setShowPass((v) => !v)}
                    >
                      {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </Field>
                <Field id="smtp-from-address" label="From address"><Input id="smtp-from-address" value={settings.smtp_from} onChange={setField("smtp_from")} placeholder="noreply@domain.com" className="h-9 text-xs bg-background"/></Field>
              </div>
              <div className="flex pt-2">
                <Button onClick={handleSave} disabled={saving} className="h-9 w-full sm:w-auto text-xs font-semibold shadow-sm">
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> : <Save className="h-3.5 w-3.5 mr-2"/>} Save SMTP settings
                </Button>
              </div>
            </div>

            {/* Test email */}
            <div className="rounded-2xl border border-border/50 bg-card/30 p-5 space-y-4 shadow-sm">
              <p className="text-xs font-semibold text-foreground">Send test email</p>
              <div className="flex gap-3">
                <label htmlFor="smtp-test-email" className="sr-only">Test email recipient</label>
                <Input id="smtp-test-email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="recipient@example.com" className="h-9 flex-1 text-xs bg-background"/>
                <Button variant="outline" onClick={handleTest} disabled={testing || !testEmail} className="h-9 text-xs font-semibold">
                  {testing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> : <Send className="h-3.5 w-3.5 mr-2"/>} {testing ? "Sending..." : "Send test"}
                </Button>
              </div>
              {testResult && (
                <p className={`inline-flex items-center gap-1.5 text-xs font-semibold ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {testResult.ok ? <Check className="h-3.5 w-3.5"/> : <XCircle className="h-3.5 w-3.5"/>}
                  {testResult.message}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
