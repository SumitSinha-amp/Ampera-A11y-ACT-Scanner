import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, RotateCcw, ShieldCheck, Users, UsersRound, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type PermissionKey =
  | "canScan"
  | "canExport"
  | "canViewAllScans"
  | "canEditScan"
  | "canDeleteScan"
  | "canManageScan"
  | "canCreateProject"
  | "canDeleteProject"
  | "canDisableJs"
  | "canSmartAnalysis"
  | "canSwitchSite"
  | "canCreateCrawl"
  | "canDeleteCrawl"
  | "canViewCrawlHistory"
  | "canViewQualityAssurance"
  | "canViewSiteAccessibilityDashboard"
  | "canManageSites"
  | "canManageSiteTargetScore"
  | "canViewIssues"
  | "canCreateIssue"
  | "canEditIssue"
  | "canCommentIssue"
  | "canManageIssues"
  | "canViewHtmlReplay";

type PermissionSet = Record<PermissionKey, boolean>;

interface UserPermission extends PermissionSet {
  userId: number;
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

interface UserGroup extends PermissionSet {
  id: number;
  name: string;
  description: string | null;
  roleLabel: string | null;
  canManageSiteTargetScore: boolean;
  createdAt: string;
  members: { id: number; fullName: string; username: string }[];
}

const PERMISSION_GROUPS: {
  id: string;
  label: string;
  note?: string;
  items: { key: PermissionKey; label: string; shortLabel: string; desc: string }[];
}[] = [
  {
    id: "issues",
    label: "Issue management",
    note: "View issues is required before the other issue actions take effect, and issue access still respects the sites a person can access.",
    items: [
      { key: "canViewIssues", label: "View issues", shortLabel: "View", desc: "See issues for accessible sites" },
      { key: "canCreateIssue", label: "Create issues", shortLabel: "Create", desc: "Raise tasks, stories, and bugs from findings" },
      { key: "canEditIssue", label: "Edit issues", shortLabel: "Edit", desc: "Update issue fields, status, and checklists" },
      { key: "canCommentIssue", label: "Comment", shortLabel: "Comment", desc: "Add comments and updates to issues" },
      { key: "canManageIssues", label: "Manage issues", shortLabel: "Manage", desc: "Archive issues when they are no longer needed" },
    ],
  },
  {
    id: "scanning",
    label: "Scanning",
    items: [
      { key: "canScan", label: "Create scans", shortLabel: "Create", desc: "Start new accessibility scans" },
      { key: "canEditScan", label: "Edit scans", shortLabel: "Edit", desc: "Rename and update scan metadata" },
      { key: "canDeleteScan", label: "Delete scans", shortLabel: "Delete", desc: "Permanently remove scans" },
      { key: "canManageScan", label: "Manage scans", shortLabel: "Manage", desc: "Pause, resume, cancel, and retry scans" },
      { key: "canDisableJs", label: "Disable JS scans", shortLabel: "No JS", desc: "Scan pages with JavaScript disabled" },
    ],
  },
  {
    id: "access",
    label: "Data access",
    items: [
      { key: "canViewAllScans", label: "View all scans", shortLabel: "All scans", desc: "See scans from all users" },
      { key: "canExport", label: "Export reports", shortLabel: "Export", desc: "Download reports and scan exports" },
      { key: "canSmartAnalysis", label: "Smart analysis", shortLabel: "Smart", desc: "Access component-level Smart Analysis" },
      { key: "canSwitchSite", label: "Switch sites", shortLabel: "Switch", desc: "Use the global site selector" },
      { key: "canViewHtmlReplay", label: "HTML replay", shortLabel: "HTML replay", desc: "Replay live HTML interactively in issue viewer" },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    items: [
      { key: "canCreateProject", label: "Create projects", shortLabel: "Create", desc: "Create a project under an accessible site" },
      { key: "canDeleteProject", label: "Delete projects", shortLabel: "Delete", desc: "Delete projects and associations" },
    ],
  },
  {
    id: "crawler",
    label: "Crawler & sites",
    note: "Manage Sites is capability access only. Site membership is assigned separately in Site Manager.",
    items: [
      { key: "canCreateCrawl", label: "Create crawls", shortLabel: "Create", desc: "Start new crawler scans" },
      { key: "canDeleteCrawl", label: "Delete crawls", shortLabel: "Delete", desc: "Delete crawler sessions" },
      { key: "canViewCrawlHistory", label: "View crawl history", shortLabel: "History", desc: "View crawler history, pages, and progress" },
      { key: "canViewQualityAssurance", label: "Quality assurance", shortLabel: "QA", desc: "View QA dashboards and reports" },
      { key: "canViewSiteAccessibilityDashboard", label: "Site dashboard", shortLabel: "Dashboard", desc: "View accessibility dashboards" },
      { key: "canManageSiteTargetScore", label: "Manage target score", shortLabel: "Target", desc: "Set or clear an accessible site's target score" },
      { key: "canManageSites", label: "Manage Sites", shortLabel: "Manage Sites", desc: "Create, edit, delete, and configure sites" },
    ],
  },
];

const PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items);

const ROLE_STYLES: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
  admin: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  user: "bg-muted text-muted-foreground border-border",
};

const DEFAULT_PERMISSION: PermissionSet = {
  canScan: true,
  canExport: true,
  canViewAllScans: false,
  canEditScan: true,
  canDeleteScan: true,
  canManageScan: true,
  canCreateProject: true,
  canDeleteProject: true,
  canDisableJs: false,
  canSmartAnalysis: false,
  canSwitchSite: false,
  canCreateCrawl: true,
  canDeleteCrawl: true,
  canViewCrawlHistory: true,
  canViewQualityAssurance: true,
  canViewSiteAccessibilityDashboard: true,
  canManageSites: false,
  canManageSiteTargetScore: false,
  canViewIssues: true,
  canCreateIssue: true,
  canEditIssue: true,
  canCommentIssue: true,
  canManageIssues: true,
  canViewHtmlReplay: false,
};

function getInitials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function roleLabel(role: string) {
  return role.replace("_", " ");
}

function errorMessage(response: Response, fallback: string) {
  return response.json().then((body) => body?.error || fallback).catch(() => fallback);
}

function MatrixSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      aria-label={checked ? "Permission enabled" : "Permission disabled"}
      className="h-5 w-9 data-[state=checked]:bg-primary"
    />
  );
}

function UserMatrix({
  users,
  localPerms,
  dirty,
  saving,
  onToggle,
  onSave,
  onReset,
}: {
  users: UserWithPerms[];
  localPerms: Record<number, UserPermission>;
  dirty: Record<number, boolean>;
  saving: Record<number, boolean>;
  onToggle: (userId: number, key: PermissionKey, value: boolean) => void;
  onSave: (userId: number) => void;
  onReset: (userId: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="min-w-[1420px] w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky left-0 z-20 min-w-[260px] border-r bg-muted/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              User
            </th>
            {PERMISSION_GROUPS.map((group) => (
              <th key={group.id} colSpan={group.items.length} className="border-r px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </th>
            ))}
            <th className="w-[116px] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Save</th>
          </tr>
          <tr className="border-b bg-background">
            <th className="sticky left-0 z-20 border-r bg-background px-4 py-2 text-left text-xs font-medium text-muted-foreground">Members</th>
            {PERMISSIONS.map((permission) => (
              <th key={permission.key} className="min-w-[68px] border-r px-2 py-2 text-center align-bottom" title={permission.desc}>
                <span className="block text-[10px] font-medium leading-tight text-muted-foreground">{permission.shortLabel}</span>
              </th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSuperAdminUser = user.role === "super_admin";
            const perm = localPerms[user.id] ?? DEFAULT_PERMISSION;
            return (
              <tr key={user.id} className={`border-b last:border-0 ${dirty[user.id] ? "bg-amber-50/50 dark:bg-amber-950/10" : "hover:bg-muted/20"}`}>
                <td className="sticky left-0 z-10 border-r bg-card px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {getInitials(user.fullName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{user.fullName}</span>
                        {dirty[user.id] && <span className="text-[10px] font-medium text-amber-700">Unsaved</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate text-xs text-muted-foreground">{user.username}</span>
                        <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[10px] capitalize ${ROLE_STYLES[user.role] ?? ROLE_STYLES.user}`}>
                          {roleLabel(user.role)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </td>
                {PERMISSIONS.map((permission) => (
                  <td key={permission.key} className="border-r px-2 py-3 text-center">
                    <MatrixSwitch
                      checked={
                        isSuperAdminUser ||
                        (user.role === "admin" && permission.key !== "canSwitchSite" && permission.key !== "canViewHtmlReplay") ||
                        Boolean(perm[permission.key])
                      }
                      disabled={
                        isSuperAdminUser ||
                        (user.role === "admin" && permission.key !== "canSwitchSite" && permission.key !== "canViewHtmlReplay") ||
                        saving[user.id]
                      }
                      onChange={(value) => onToggle(user.id, permission.key, value)}
                    />
                  </td>
                ))}
                <td className="px-3 py-3">
                  {isSuperAdminUser ? (
                    <span className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3" /> Full access</span>
                  ) : (
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onReset(user.id)} disabled={!dirty[user.id] || saving[user.id]} title="Reset changes">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onSave(user.id)} disabled={!dirty[user.id] || saving[user.id]}>
                        {saving[user.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                        Save
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupMatrix({
  groups,
  localPerms,
  dirty,
  saving,
  onToggle,
  onSave,
  onReset,
}: {
  groups: UserGroup[];
  localPerms: Record<number, UserGroup>;
  dirty: Record<number, boolean>;
  saving: Record<number, boolean>;
  onToggle: (groupId: number, key: PermissionKey, value: boolean) => void;
  onSave: (groupId: number) => void;
  onReset: (groupId: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="min-w-[1420px] w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky left-0 z-20 min-w-[260px] border-r bg-muted/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group</th>
            {PERMISSION_GROUPS.map((group) => (
              <th key={group.id} colSpan={group.items.length} className="border-r px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</th>
            ))}
            <th className="w-[116px] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Save</th>
          </tr>
          <tr className="border-b bg-background">
            <th className="sticky left-0 z-20 border-r bg-background px-4 py-2 text-left text-xs font-medium text-muted-foreground">Teams</th>
            {PERMISSIONS.map((permission) => (
              <th key={permission.key} className="min-w-[68px] border-r px-2 py-2 text-center" title={permission.desc}>
                <span className="block text-[10px] font-medium leading-tight text-muted-foreground">{permission.shortLabel}</span>
              </th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const perm = localPerms[group.id] ?? group;
            return (
              <tr key={group.id} className={`border-b last:border-0 ${dirty[group.id] ? "bg-amber-50/50 dark:bg-amber-950/10" : "hover:bg-muted/20"}`}>
                <td className="sticky left-0 z-10 border-r bg-card px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{group.name}</span>
                      {dirty[group.id] && <span className="text-[10px] font-medium text-amber-700">Unsaved</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {group.members?.length ?? 0} member{(group.members?.length ?? 0) === 1 ? "" : "s"}
                      {group.roleLabel ? ` · ${group.roleLabel}` : ""}
                    </p>
                  </div>
                </td>
                {PERMISSIONS.map((permission) => (
                  <td key={permission.key} className="border-r px-2 py-3 text-center">
                    <MatrixSwitch checked={Boolean(perm[permission.key])} disabled={saving[group.id]} onChange={(value) => onToggle(group.id, permission.key, value)} />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onReset(group.id)} disabled={!dirty[group.id] || saving[group.id]} title="Reset changes">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onSave(group.id)} disabled={!dirty[group.id] || saving[group.id]}>
                      {saving[group.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                      Save
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPermissionsPage() {
  const [users, setUsers] = useState<UserWithPerms[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [localUserPerms, setLocalUserPerms] = useState<Record<number, UserPermission>>({});
  const [localGroupPerms, setLocalGroupPerms] = useState<Record<number, UserGroup>>({});
  const [dirtyUsers, setDirtyUsers] = useState<Record<number, boolean>>({});
  const [dirtyGroups, setDirtyGroups] = useState<Record<number, boolean>>({});
  const [savingUsers, setSavingUsers] = useState<Record<number, boolean>>({});
  const [savingGroups, setSavingGroups] = useState<Record<number, boolean>>({});
  const [activeTab, setActiveTab] = useState<"users" | "groups">("users");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  async function loadPermissions() {
    setLoading(true);
    try {
      const [usersResponse, groupsResponse] = await Promise.all([
        fetch(`${BASE}/api/admin/permissions`, { credentials: "include" }),
        fetch(`${BASE}/api/admin/groups`, { credentials: "include" }),
      ]);
      if (!usersResponse.ok) throw new Error(await errorMessage(usersResponse, "Unable to load user permissions"));
      if (!groupsResponse.ok) throw new Error(await errorMessage(groupsResponse, "Unable to load group permissions"));
      const [userData, groupData] = await Promise.all([usersResponse.json(), groupsResponse.json()]);
      setUsers(userData);
      setGroups(groupData);
      setLocalUserPerms(Object.fromEntries(userData.map((user: UserWithPerms) => [user.id, { ...user.permissions }])));
      setLocalGroupPerms(Object.fromEntries(groupData.map((group: UserGroup) => [group.id, { ...group }])));
      setDirtyUsers({});
      setDirtyGroups({});
    } catch (error) {
      toast({ title: "Unable to load permissions", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPermissions(); }, []);

  function updateUser(userId: number, key: PermissionKey, value: boolean) {
    setLocalUserPerms((current) => ({ ...current, [userId]: { ...current[userId], [key]: value } }));
    setDirtyUsers((current) => ({ ...current, [userId]: true }));
  }

  function updateGroup(groupId: number, key: PermissionKey, value: boolean) {
    setLocalGroupPerms((current) => ({ ...current, [groupId]: { ...current[groupId], [key]: value } }));
    setDirtyGroups((current) => ({ ...current, [groupId]: true }));
  }

  async function saveUser(userId: number) {
    const permissions = localUserPerms[userId];
    if (!permissions) return;
    setSavingUsers((current) => ({ ...current, [userId]: true }));
    try {
      const response = await fetch(`${BASE}/api/admin/permissions/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(permissions),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Failed to save user permissions"));
      setDirtyUsers((current) => ({ ...current, [userId]: false }));
      toast({ title: "User permissions saved" });
    } catch (error) {
      toast({ title: "Failed to save user permissions", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSavingUsers((current) => ({ ...current, [userId]: false }));
    }
  }

  async function saveGroup(groupId: number) {
    const group = localGroupPerms[groupId];
    if (!group) return;
    setSavingGroups((current) => ({ ...current, [groupId]: true }));
    try {
      const response = await fetch(`${BASE}/api/admin/groups/${groupId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(PERMISSIONS.map(({ key }) => [key, group[key]]))),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Failed to save group permissions"));
      setGroups((current) => current.map((item) => item.id === groupId ? { ...item, ...group } : item));
      setDirtyGroups((current) => ({ ...current, [groupId]: false }));
      toast({ title: "Group permissions saved" });
    } catch (error) {
      toast({ title: "Failed to save group permissions", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSavingGroups((current) => ({ ...current, [groupId]: false }));
    }
  }

  function resetUser(userId: number) {
    const original = users.find((user) => user.id === userId)?.permissions;
    if (!original) return;
    setLocalUserPerms((current) => ({ ...current, [userId]: { ...original } }));
    setDirtyUsers((current) => ({ ...current, [userId]: false }));
  }

  function resetGroup(groupId: number) {
    const original = groups.find((group) => group.id === groupId);
    if (!original) return;
    setLocalGroupPerms((current) => ({ ...current, [groupId]: { ...original } }));
    setDirtyGroups((current) => ({ ...current, [groupId]: false }));
  }

  const configurableUsers = useMemo(() => users, [users]);
  const dirtyCount = Object.values(activeTab === "users" ? dirtyUsers : dirtyGroups).filter(Boolean).length;

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage individual users and group capability grants from one matrix.</p>
        </div>
        {dirtyCount > 0 && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">{dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}</Badge>}
      </div>

      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <strong>Manage Sites is separate from site membership.</strong> Enable the capability here, then grant the user or group access to specific sites in <strong>Site Manager</strong>. Creating a project also requires access to the selected site.
        </AlertDescription>
      </Alert>

      <div className="flex w-fit items-center gap-1 rounded-lg border bg-muted/40 p-1">
        <button type="button" onClick={() => setActiveTab("users")} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${activeTab === "users" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Users className="h-4 w-4" /> Users
          <span className="text-xs text-muted-foreground">{users.length}</span>
        </button>
        <button type="button" onClick={() => setActiveTab("groups")} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${activeTab === "groups" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <UsersRound className="h-4 w-4" /> Groups
          <span className="text-xs text-muted-foreground">{groups.length}</span>
        </button>
      </div>

      {activeTab === "users" ? (
        configurableUsers.length > 0 ? (
          <UserMatrix
            users={configurableUsers}
            localPerms={localUserPerms}
            dirty={dirtyUsers}
            saving={savingUsers}
            onToggle={updateUser}
            onSave={saveUser}
            onReset={resetUser}
          />
        ) : <div className="py-12 text-center text-muted-foreground">No users found.</div>
      ) : (
        groups.length > 0 ? (
          <GroupMatrix
            groups={groups}
            localPerms={localGroupPerms}
            dirty={dirtyGroups}
            saving={savingGroups}
            onToggle={updateGroup}
            onSave={saveGroup}
            onReset={resetGroup}
          />
        ) : <div className="py-12 text-center text-muted-foreground">No groups found. Create a group first.</div>
      )}
    </div>
  );
}