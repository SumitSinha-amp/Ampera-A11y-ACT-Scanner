import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface GroupMember { id: number; fullName: string; username: string }
interface UserGroup { id: number; name: string; description: string | null; roleLabel: string | null; createdAt: string; members: GroupMember[] }
interface AppUser { id: number; fullName: string; username: string }

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<UserGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<UserGroup | null>(null);
  const [addMemberGroup, setAddMemberGroup] = useState<UserGroup | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cRoleLabel, setCRoleLabel] = useState("");
  const [cError, setCError] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const { toast } = useToast();

  async function loadAll() {
    try {
      const [gr, ur] = await Promise.all([
        fetch(`${BASE}/api/admin/groups`, { credentials: "include" }),
        fetch(`${BASE}/api/admin/users`, { credentials: "include" }),
      ]);
      if (gr.ok) setGroups(await gr.json());
      if (ur.ok) setAllUsers(await ur.json());
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
      const res = await fetch(`${BASE}/api/admin/groups`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cName, description: cDesc || null, roleLabel: cRoleLabel || null }),
      });
      const data = await res.json();
      if (!res.ok) { setCError(data.error || "Failed"); return; }
      setCreateOpen(false);
      setCName(""); setCDesc(""); setCRoleLabel("");
      loadAll();
      toast({ title: "Group created" });
    } catch { setCError("Network error"); }
    finally { setCLoading(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editGroup) return;
    try {
      await fetch(`${BASE}/api/admin/groups/${editGroup.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cName, description: cDesc || null, roleLabel: cRoleLabel || null }),
      });
      setEditGroup(null);
      loadAll();
      toast({ title: "Group updated" });
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
  }

  function openEdit(g: UserGroup) {
    setEditGroup(g);
    setCName(g.name);
    setCDesc(g.description || "");
    setCRoleLabel(g.roleLabel || "");
    setCError("");
  }

  async function handleDelete() {
    if (!deleteGroup) return;
    try {
      await fetch(`${BASE}/api/admin/groups/${deleteGroup.id}`, { method: "DELETE", credentials: "include" });
      setDeleteGroup(null);
      loadAll();
      toast({ title: "Group deleted" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  }

  async function handleAddMember() {
    if (!addMemberGroup || !selectedUserId) return;
    try {
      await fetch(`${BASE}/api/admin/groups/${addMemberGroup.id}/members`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: parseInt(selectedUserId, 10) }),
      });
      loadAll();
      setSelectedUserId("");
      toast({ title: "Member added" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  }

  async function handleRemoveMember(groupId: number, userId: number) {
    try {
      await fetch(`${BASE}/api/admin/groups/${groupId}/members/${userId}`, { method: "DELETE", credentials: "include" });
      loadAll();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  }

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">{groups.length} group{groups.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setCName(""); setCDesc(""); setCRoleLabel(""); setCError(""); }} className="gap-2">
          <Plus className="w-4 h-4" /> Create Group
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{g.name}</CardTitle>
                  {g.roleLabel && (
                    <span className="inline-block mt-0.5 mr-1.5 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{g.roleLabel}</span>
                  )}
                  {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setAddMemberGroup(g); setSelectedUserId(""); }}>
                    <UserPlus className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteGroup(g)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">{g.members.length} member{g.members.length !== 1 ? "s" : ""}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 text-xs">
                    <span>{m.fullName}</span>
                    <button onClick={() => handleRemoveMember(g.id, m.id)} className="text-muted-foreground hover:text-destructive ml-0.5">
                      <UserMinus className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {g.members.length === 0 && <span className="text-xs text-muted-foreground">No members yet</span>}
              </div>
            </CardContent>
          </Card>
        ))}
        {groups.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No groups yet. Create one to get started.
          </div>
        )}
      </div>

      {/* Create Group Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Group</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {cError && <Alert variant="destructive"><AlertDescription>{cError}</AlertDescription></Alert>}
            <div className="space-y-2"><Label>Name</Label><Input value={cName} onChange={e => setCName(e.target.value)} placeholder="e.g. QA Team" required /></div>
            <div className="space-y-2"><Label>Role Label <span className="text-muted-foreground font-normal">(optional)</span></Label><Input value={cRoleLabel} onChange={e => setCRoleLabel(e.target.value)} placeholder="e.g. QA Engineer" /></div>
            <div className="space-y-2"><Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label><Input value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="Brief description" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={cLoading}>{cLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={!!editGroup} onOpenChange={v => !v && setEditGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Group</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={cName} onChange={e => setCName(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Role Label <span className="text-muted-foreground font-normal">(optional)</span></Label><Input value={cRoleLabel} onChange={e => setCRoleLabel(e.target.value)} placeholder="e.g. QA Engineer" /></div>
            <div className="space-y-2"><Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label><Input value={cDesc} onChange={e => setCDesc(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditGroup(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteGroup} onOpenChange={v => !v && setDeleteGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>Delete <strong>{deleteGroup?.name}</strong>? Members will not be deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroup(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={!!addMemberGroup} onOpenChange={v => !v && setAddMemberGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Member to {addMemberGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
              <SelectContent>
                {allUsers
                  .filter(u => !addMemberGroup?.members.find(m => m.id === u.id))
                  .map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.fullName} ({u.username})</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberGroup(null)}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={!selectedUserId}>Add Member</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
