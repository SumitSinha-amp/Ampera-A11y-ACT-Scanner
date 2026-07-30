import { useEffect, useState } from "react";
import { Loader2, Save, RotateCcw, ShieldCheck, Scan, Eye, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface UserPermission {
  userId: number;
  canScan: boolean;
  canExport: boolean;
  canViewAllScans: boolean;
  canEditScan: boolean;
  canDeleteScan: boolean;
  canManageScan: boolean;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canDisableJs: boolean;
  canSmartAnalysis: boolean;
  canSwitchSite: boolean;
  allowedRules: string[] | null;
}

interface UserWithPerms {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
  permissions: UserPermission;
}

const PERM_GROUPS = [
  {
    id: "scanning",
    label: "Scanning",
    icon: Scan,
    items: [
      { key: "canScan" as const,       label: "Create Scans",   desc: "Start new accessibility scans" },
      { key: "canEditScan" as const,    label: "Edit Scans",     desc: "Rename and update metadata" },
      { key: "canDeleteScan" as const,  label: "Delete Scans",   desc: "Permanently remove scans" },
      { key: "canManageScan" as const,  label: "Manage Scans",   desc: "Pause, resume, cancel, retry" },
      { key: "canDisableJs" as const,   label: "Disable JS Scans", desc: "Scan pages with JavaScript turned off" },
    ],
  },
  {
    id: "access",
    label: "Data Access",
    icon: Eye,
    items: [
      { key: "canViewAllScans" as const, label: "View All Scans",  desc: "See scans from all users" },
      { key: "canExport" as const,       label: "Export Reports",  desc: "Download scan reports" },
      { key: "canSmartAnalysis" as const, label: "Smart Analysis", desc: "Access component-level Smart Analysis (Developer group always has access)" },
      { key: "canSwitchSite" as const,   label: "Switch Sites",    desc: "Access the site selector to view crawler history across different companies (super admins always have this)" },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderOpen,
    items: [
      { key: "canCreateProject" as const, label: "Create Projects", desc: "Add new projects" },
      { key: "canDeleteProject" as const, label: "Delete Projects", desc: "Remove projects" },
    ],
  },
];

const ROLE_STYLES: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
  admin:       "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  user:        "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${ROLE_STYLES[role] || ROLE_STYLES.user}`}>
      {role.replace("_", " ")}
    </span>
  );
}

function getInitials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
];

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

interface PermCardProps {
  user: UserWithPerms;
  perm: UserPermission;
  isDirty: boolean;
  isSaving: boolean;
  onToggle: (field: keyof UserPermission, value: boolean) => void;
  onSave: () => void;
  onReset: () => void;
}

function PermCard({ user, perm, isDirty, isSaving, onToggle, onSave, onReset }: PermCardProps) {
  const isFullAccess = user.role === "super_admin";
  const isAdminRole = user.role === "admin";

  return (
    <Card className={`transition-shadow ${isDirty ? "ring-2 ring-amber-300 dark:ring-amber-700 shadow-md" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-full ${getAvatarColor(user.id)} flex items-center justify-center text-white text-sm font-semibold shrink-0`}>
            {getInitials(user.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{user.fullName}</span>
              {isDirty && <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">Unsaved</Badge>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground font-mono truncate">{user.username}</span>
              <RoleBadge role={user.role} />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {isFullAccess ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3">
            <ShieldCheck className="w-4 h-4 text-purple-500 shrink-0" />
            <span>Full access — not configurable for super admins</span>
          </div>
        ) : (
          PERM_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.id} className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Icon className="w-3.5 h-3.5" />
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const locked = isAdminRole && item.key === "canViewAllScans";
                    const value = isAdminRole ? true : (perm[item.key] as boolean);
                    return (
                      <div key={item.key} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
                        <div className="min-w-0 mr-3">
                          <div className="text-sm font-medium leading-tight">{item.label}</div>
                          <div className="text-xs text-muted-foreground leading-tight mt-0.5">{item.desc}</div>
                        </div>
                        <Switch
                          checked={value}
                          disabled={locked || isSaving}
                          onCheckedChange={(v) => onToggle(item.key, v)}
                          className="shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {!isFullAccess && (
          <div className="flex gap-2 pt-1 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={onReset}
              disabled={!isDirty || isSaving}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset
            </Button>
            <Button
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={onSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <><Save className="w-3.5 h-3.5 mr-1.5" />Save</>
              }
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPermissionsPage() {
  const [users, setUsers] = useState<UserWithPerms[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [dirty, setDirty] = useState<Record<number, boolean>>({});
  const [localPerms, setLocalPerms] = useState<Record<number, UserPermission>>({});
  const { toast } = useToast();

  async function loadPermissions() {
    try {
      const res = await fetch(`${BASE}/api/admin/permissions`, { credentials: "include" });
      if (res.ok) {
        const data: UserWithPerms[] = await res.json();
        setUsers(data);
        const perms: Record<number, UserPermission> = {};
        for (const u of data) perms[u.id] = { ...u.permissions };
        setLocalPerms(perms);
        setDirty({});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPermissions(); }, []);

  function updatePerm(userId: number, field: keyof UserPermission, value: boolean) {
    setLocalPerms(prev => ({ ...prev, [userId]: { ...prev[userId], [field]: value } }));
    setDirty(prev => ({ ...prev, [userId]: true }));
  }

  async function saveUser(userId: number) {
    const perm = localPerms[userId];
    if (!perm) return;
    setSaving(prev => ({ ...prev, [userId]: true }));
    try {
      const res = await fetch(`${BASE}/api/admin/permissions/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(perm),
      });
      if (!res.ok) { toast({ title: "Failed to save", variant: "destructive" }); return; }
      setDirty(prev => ({ ...prev, [userId]: false }));
      toast({ title: "Permissions saved" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  }

  function resetUser(userId: number) {
    const orig = users.find(u => u.id === userId)?.permissions;
    if (!orig) return;
    setLocalPerms(prev => ({ ...prev, [userId]: { ...orig } }));
    setDirty(prev => ({ ...prev, [userId]: false }));
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const superAdmins = users.filter(u => u.role === "super_admin");
  const others = users.filter(u => u.role !== "super_admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">Control what each user can do. Changes take effect immediately after saving.</p>
      </div>

      <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <AlertDescription className="text-amber-800 dark:text-amber-300 text-sm">
          Super admins always have full access. Permissions here apply to <strong>admin</strong> and <strong>user</strong> roles only.
        </AlertDescription>
      </Alert>

      {others.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Configurable Users</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {others.map(u => {
              const perm = localPerms[u.id];
              if (!perm) return null;
              return (
                <PermCard
                  key={u.id}
                  user={u}
                  perm={perm}
                  isDirty={!!dirty[u.id]}
                  isSaving={!!saving[u.id]}
                  onToggle={(field, value) => updatePerm(u.id, field, value)}
                  onSave={() => saveUser(u.id)}
                  onReset={() => resetUser(u.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {superAdmins.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Super Administrators</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {superAdmins.map(u => {
              const perm = localPerms[u.id];
              if (!perm) return null;
              return (
                <PermCard
                  key={u.id}
                  user={u}
                  perm={perm}
                  isDirty={false}
                  isSaving={false}
                  onToggle={() => {}}
                  onSave={() => {}}
                  onReset={() => {}}
                />
              );
            })}
          </div>
        </div>
      )}

      {users.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No users found.</div>
      )}
    </div>
  );
}
