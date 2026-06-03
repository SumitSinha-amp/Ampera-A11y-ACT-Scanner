import { useEffect, useState } from "react";
import {
  Loader2, Save, Mail, Eye, EyeOff, CheckCircle2, XCircle,
  Bot, Cpu, Key, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

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
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground mt-1">Configure AI engine, SMTP, and other system-wide options.</p>
        </div>
        {fetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      <Tabs defaultValue="ai">
        <TabsList className="mb-2">
          <TabsTrigger value="ai" className="gap-1.5">
            <Cpu className="w-3.5 h-3.5" />
            AI Settings
          </TabsTrigger>
          <TabsTrigger value="smtp" className="gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            SMTP
          </TabsTrigger>
        </TabsList>

        {/* ── AI tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="ai" className="space-y-5 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-violet-500" />
                AI Fix Engine
              </CardTitle>
              <CardDescription>
                Offline rule-based engine that explains accessibility violations and suggests code fixes — no API key required, zero latency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Enable Rule-Based Engine</Label>
                  <p className="text-xs text-muted-foreground">
                    Shows context-aware "Why &amp; Fix" guidance on every issue.
                  </p>
                </div>
                <Switch
                  checked={settings.ai_engine_enabled === "true"}
                  onCheckedChange={toggleField("ai_engine_enabled")}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-500" />
                External AI
                <Badge variant="outline" className="ml-1 text-xs font-normal">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Connect Gemini or OpenAI for deeper analysis. The API key is stored securely and never exposed to the browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Enable External AI</Label>
                  <p className="text-xs text-muted-foreground">Shows an "Ask AI" button on every issue.</p>
                </div>
                <Switch
                  checked={settings.ai_external_enabled === "true"}
                  onCheckedChange={toggleField("ai_external_enabled")}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select
                  value={settings.ai_external_provider}
                  onValueChange={(v) => setSettings((p) => ({ ...p, ai_external_provider: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai_external_api_key" className="flex items-center gap-1.5">
                  <Key className="w-3 h-3" />
                  API Key
                  {apiKeyIsSet && !apiKeyDirty && (
                    <Badge variant="secondary" className="text-xs font-normal ml-1">Key saved</Badge>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="ai_external_api_key"
                    type={showApiKey ? "text" : "password"}
                    placeholder={
                      apiKeyIsSet && !apiKeyDirty
                        ? "••••••••  (saved — enter new key to replace)"
                        : settings.ai_external_provider === "gemini"
                        ? "AIzaSy..."
                        : "sk-..."
                    }
                    value={apiKeyDirty ? settings.ai_external_api_key : ""}
                    onChange={(e) => {
                      setApiKeyDirty(true);
                      setSettings((p) => ({ ...p, ai_external_api_key: e.target.value }));
                    }}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                    onClick={() => setShowApiKey((v) => !v)}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  {settings.ai_external_provider === "gemini"
                    ? "Get a free key at aistudio.google.com/apikey"
                    : "Get a key at platform.openai.com/api-keys"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai_external_model">
                  Model <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="ai_external_model"
                  placeholder={modelPlaceholder}
                  value={settings.ai_external_model}
                  onChange={setField("ai_external_model")}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default model ({modelPlaceholder}).
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save AI Settings
            </Button>
          </div>
        </TabsContent>

        {/* ── SMTP tab ────────────────────────────────────────────────────── */}
        <TabsContent value="smtp" className="space-y-5 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                SMTP Configuration
              </CardTitle>
              <CardDescription>
                Settings saved here override environment variables. Leave blank to use env vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="smtp_host">SMTP Host</Label>
                  <Input id="smtp_host" placeholder="smtp.gmail.com" value={settings.smtp_host} onChange={setField("smtp_host")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp_port">Port</Label>
                  <Input id="smtp_port" placeholder="587" value={settings.smtp_port} onChange={setField("smtp_port")} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp_user">Username</Label>
                <Input id="smtp_user" placeholder="you@example.com" value={settings.smtp_user} onChange={setField("smtp_user")} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp_pass">Password</Label>
                <div className="relative">
                  <Input
                    id="smtp_pass"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={settings.smtp_pass}
                    onChange={setField("smtp_pass")}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                    onClick={() => setShowPass((v) => !v)}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="smtp_from">From Address</Label>
                <Input id="smtp_from" placeholder="noreply@amperatech.ai" value={settings.smtp_from} onChange={setField("smtp_from")} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send Test Email</CardTitle>
              <CardDescription>
                Verify your SMTP settings are working by sending a test email. Save settings first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="recipient@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  type="email"
                />
                <Button onClick={handleTest} disabled={testing || !testEmail} variant="outline">
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Test"}
                </Button>
              </div>

              {testResult && (
                <Alert variant={testResult.ok ? "default" : "destructive"}>
                  {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  <AlertDescription>{testResult.message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save SMTP Settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
