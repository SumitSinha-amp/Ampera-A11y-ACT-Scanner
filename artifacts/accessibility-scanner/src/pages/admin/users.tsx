import { useEffect, useState } from "react";
import {
  Loader2, Plus, Pencil, Trash2, RefreshCw, Copy, CheckCheck, Shield, ShieldOff, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface UserGroup { id: number; name: string }
interface AppUser {
  id: number;
  email: string;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  mustResetPassword: boolean;
  createdAt: string;
  groups: UserGroup[];
}

function RoleBadge({ role }: { role: string }) {
  const variants: Record<string, string> = {
    super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200",
    admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200",
    user: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variants[role] || variants.user}`}>
      {role.replace("_", " ")}
    </span>
  );
}

function GroupMultiSelect({
  allGroups,
  selected,
  onChange,
}: {
  allGroups: UserGroup[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  if (allGroups.length === 0) {
    return <p className="text-xs text-muted-foreground">No groups available. Create groups first.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allGroups.map((g) => {
        const active = selected.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => toggle(g.id)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            {g.name}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [allGroups, setAllGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);
  const [inviteResult, setInviteResult] = useState<{ tempPassword?: string; inviteLink?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Create form state
  const [cEmail, setCEmail] = useState("");
  const [cUsername, setCUsername] = useState("");
  const [cFullName, setCFullName] = useState("");
  const [cRole, setCRole] = useState("user");
  const [cGroupIds, setCGroupIds] = useState<number[]>([]);
  const [cError, setCError] = useState("");
  const [cLoading, setCLoading] = useState(false);

  // Edit form state
  const [eFullName, setEFullName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eRole, setERole] = useState("user");
  const [eActive, setEActive] = useState(true);
  const [eGroupIds, setEGroupIds] = useState<number[]>([]);
  const [eError, setEError] = useState("");
  const [eLoading, setELoading] = useState(false);

  async function loadAll() {
    try {
      const [usersRes, groupsRes] = await Promise.all([
        fetch(`${BASE}/api/admin/users`, { credentials: "include" }),
        fetch(`${BASE}/api/admin/groups`, { credentials: "include" }),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (groupsRes.ok) {
        const groups = await groupsRes.json();
        setAllGroups(groups.map((g: any) => ({ id: g.id, name: g.name })));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCError("");
    setCLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cEmail, username: cUsername, fullName: cFullName, role: cRole, groupIds: cGroupIds }),
      });
      const data = await res.json();
      if (!res.ok) { setCError(data.error || "Failed to create user"); return; }
      setCreateOpen(false);
      setCEmail(""); setCUsername(""); setCFullName(""); setCRole("user"); setCGroupIds([]);
      loadAll();
      if (data.tempPassword || data.inviteLink) {
        setInviteResult({ tempPassword: data.tempPassword, inviteLink: data.inviteLink });
      } else {
        toast({ title: "User created", description: "Invite email sent successfully." });
      }
    } catch {
      setCError("Network error");
    } finally {
      setCLoading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEError("");
    setELoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/users/${editUser.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: eFullName, email: eEmail, role: eRole, isActive: eActive, groupIds: eGroupIds }),
      });
      const data = await res.json();
      if (!res.ok) { setEError(data.error || "Failed to update user"); return; }
      setEditUser(null);
      loadAll();
      toast({ title: "User updated" });
    } catch {
      setEError("Network error");
    } finally {
      setELoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser) return;
    try {
      await fetch(`${BASE}/api/admin/users/${deleteUser.id}`, { method: "DELETE", credentials: "include" });
      setDeleteUser(null);
      loadAll();
      toast({ title: "User deleted" });
    } catch {
      toast({ title: "Failed to delete user", variant: "destructive" });
    }
  }

  async function handleResendInvite(u: AppUser) {
    try {
      const res = await fetch(`${BASE}/api/admin/users/${u.id}/reset-invite`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.tempPassword || data.inviteLink) {
        setInviteResult({ tempPassword: data.tempPassword, inviteLink: data.inviteLink });
      } else {
        toast({ title: "Invite resent", description: "A new invite email has been sent." });
      }
      loadAll();
    } catch {
      toast({ title: "Failed to resend invite", variant: "destructive" });
    }
  }

  function openEdit(u: AppUser) {
    setEditUser(u);
    setEFullName(u.fullName);
    setEEmail(u.email);
    setERole(u.role);
    setEActive(u.isActive);
    setEGroupIds(u.groups.map((g) => g.id));
    setEError("");
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const isSuperAdmin = currentUser?.role === "super_admin";

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">{users.length} user{users.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setCError(""); setCGroupIds([]); }} className="gap-2">
          <Plus className="w-4 h-4" /> Create User
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Groups</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{u.fullName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.username}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3">
                      {u.groups.length > 0
                        ? <div className="flex flex-wrap gap-1">{u.groups.map(g => <Badge key={g.id} variant="outline" className="text-xs">{g.name}</Badge>)}</div>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {u.isActive
                          ? <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">Active</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                        {u.mustResetPassword && <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Password reset</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResendInvite(u)} title="Resend invite">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)} title="Edit user">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {isSuperAdmin && u.id !== currentUser?.id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteUser(u)} title="Delete user">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>The user will receive an invite email with their temporary password.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {cError && <Alert variant="destructive"><AlertDescription>{cError}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={cFullName} onChange={e => setCFullName(e.target.value)} placeholder="Jane Smith" required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="jane@company.com" required />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={cUsername} onChange={e => setCUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))} placeholder="janesmith" required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={cRole} onValueChange={setCRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {allGroups.length > 0 && (
              <div className="space-y-2">
                <Label>Groups <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <GroupMultiSelect allGroups={allGroups} selected={cGroupIds} onChange={setCGroupIds} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={cLoading}>
                {cLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={v => !v && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            {eError && <Alert variant="destructive"><AlertDescription>{eError}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={eFullName} onChange={e => setEFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={eEmail} onChange={e => setEEmail(e.target.value)} required />
            </div>
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={eRole} onValueChange={setERole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Groups</Label>
              <GroupMultiSelect allGroups={allGroups} selected={eGroupIds} onChange={setEGroupIds} />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setEActive(v => !v)} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded border ${eActive ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "border-border text-muted-foreground"}`}>
                {eActive ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                {eActive ? "Active" : "Inactive"}
              </button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button type="submit" disabled={eLoading}>
                {eLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteUser} onOpenChange={v => !v && setDeleteUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>Are you sure you want to delete <strong>{deleteUser?.fullName}</strong>? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Result Dialog */}
      <Dialog open={!!inviteResult} onOpenChange={v => !v && setInviteResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5" />User Created</DialogTitle>
            <DialogDescription>SMTP is not configured — share these credentials manually with the user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {inviteResult?.tempPassword && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Temporary Password</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">{inviteResult.tempPassword}</code>
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(inviteResult?.tempPassword || "")}>
                    {copied ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}
            {inviteResult?.inviteLink && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Password Reset Link</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all">{inviteResult.inviteLink}</code>
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(inviteResult?.inviteLink || "")}>
                    {copied ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setInviteResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
