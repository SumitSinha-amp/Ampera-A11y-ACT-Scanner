import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Search,
  Users,
  UsersRound,
  Trash2,
  Plus,
  Loader2,
  ExternalLink,
  FileText,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Site {
  id: number;
  name: string;
  baseUrl: string;
  description: string | null;
  userId: string | null;
  userCount?: number;
  scanCount?: number;
}

interface SiteUser {
  userId: number;
  fullName: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
}

interface SiteGroup {
  groupId: number;
  name: string;
  description: string | null;
  createdAt: string;
}

interface SiteAccess {
  users: SiteUser[];
  groups: SiteGroup[];
}

interface User {
  id: number;
  fullName: string;
  email: string;
  username: string;
  role: string;
}

interface Group {
  id: number;
  name: string;
  description: string | null;
}

function SiteAccessDialog({ site, onClose }: { site: Site; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addUserId, setAddUserId] = useState<string>("");
  const [addGroupId, setAddGroupId] = useState<string>("");

  const { data: access, isLoading: accessLoading } = useQuery<SiteAccess>({
    queryKey: ["site-access", site.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/sites/${site.id}/access`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load access");
      return res.json();
    },
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/users`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: allGroups = [] } = useQuery<Group[]>({
    queryKey: ["admin-groups"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/groups`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const grantedUserIds = new Set((access?.users ?? []).map((u) => u.userId));
  const grantedGroupIds = new Set((access?.groups ?? []).map((g) => g.groupId));
  const availableUsers = allUsers.filter((u) => !grantedUserIds.has(u.id));
  const availableGroups = allGroups.filter((g) => !grantedGroupIds.has(g.id));

  const grantUser = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`${BASE}/api/admin/sites/${site.id}/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to grant access");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-access", site.id] });
      setAddUserId("");
      toast({ title: "User access granted" });
    },
    onError: () => toast({ title: "Failed to grant access", variant: "destructive" }),
  });

  const revokeUser = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`${BASE}/api/admin/sites/${site.id}/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to revoke access");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-access", site.id] });
      toast({ title: "User access revoked" });
    },
    onError: () => toast({ title: "Failed to revoke access", variant: "destructive" }),
  });

  const grantGroup = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await fetch(`${BASE}/api/admin/sites/${site.id}/groups`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (!res.ok) throw new Error("Failed to grant group access");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-access", site.id] });
      setAddGroupId("");
      toast({ title: "Group access granted" });
    },
    onError: () => toast({ title: "Failed to grant group access", variant: "destructive" }),
  });

  const revokeGroup = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await fetch(`${BASE}/api/admin/sites/${site.id}/groups/${groupId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error("Failed to revoke group access");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-access", site.id] });
      toast({ title: "Group access revoked" });
    },
    onError: () => toast({ title: "Failed to revoke group access", variant: "destructive" }),
  });

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          {site.name}
        </DialogTitle>
        <p className="text-xs text-muted-foreground truncate">{site.baseUrl}</p>
      </DialogHeader>

      {accessLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="users">
          <TabsList className="w-full">
            <TabsTrigger value="users" className="flex-1 gap-2">
              <Users className="w-3.5 h-3.5" />
              Users
              {access?.users?.length ? (
                <Badge variant="secondary" className="ml-1 text-xs">{access.users.length}</Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex-1 gap-2">
              <UsersRound className="w-3.5 h-3.5" />
              Groups
              {access?.groups?.length ? (
                <Badge variant="secondary" className="ml-1 text-xs">{access.groups.length}</Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-3 mt-3">
            <div className="flex gap-2">
              <Select value={addUserId} onValueChange={setAddUserId}>
                <SelectTrigger className="flex-1 text-sm">
                  <SelectValue placeholder="Select user to add…" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length === 0 ? (
                    <SelectItem value="__none__" disabled>All users already have access</SelectItem>
                  ) : (
                    availableUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.fullName || u.username}
                        <span className="ml-1 text-muted-foreground text-xs">({u.email})</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!addUserId || grantUser.isPending}
                onClick={() => addUserId && grantUser.mutate(parseInt(addUserId, 10))}
              >
                {grantUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </Button>
            </div>

            <div className="divide-y divide-border rounded-md border">
              {(access?.users ?? []).length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No users have access yet</div>
              ) : (
                (access?.users ?? []).map((u) => (
                  <div key={u.userId} className="flex items-center justify-between px-3 py-2.5 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{u.fullName || u.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs capitalize">{u.role}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => u.role !== "owner" && revokeUser.mutate(u.userId)}
                      disabled={u.role === "owner" || revokeUser.isPending}
                      title={u.role === "owner" ? "Cannot remove site owner" : "Remove access"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="groups" className="space-y-3 mt-3">
            <div className="flex gap-2">
              <Select value={addGroupId} onValueChange={setAddGroupId}>
                <SelectTrigger className="flex-1 text-sm">
                  <SelectValue placeholder="Select group to add…" />
                </SelectTrigger>
                <SelectContent>
                  {availableGroups.length === 0 ? (
                    <SelectItem value="__none__" disabled>All groups already have access</SelectItem>
                  ) : (
                    availableGroups.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!addGroupId || grantGroup.isPending}
                onClick={() => addGroupId && grantGroup.mutate(parseInt(addGroupId, 10))}
              >
                {grantGroup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </Button>
            </div>

            <div className="divide-y divide-border rounded-md border">
              {(access?.groups ?? []).length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No groups have access yet</div>
              ) : (
                (access?.groups ?? []).map((g) => (
                  <div key={g.groupId} className="flex items-center justify-between px-3 py-2.5 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      {g.description && (
                        <p className="text-xs text-muted-foreground truncate">{g.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => revokeGroup.mutate(g.groupId)}
                      disabled={revokeGroup.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </DialogContent>
  );
}

export default function AdminSiteManagerPage() {
  const [search, setSearch] = useState("");
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  const { data: sitesData, isLoading } = useQuery<{ sites: Site[] }>({
    queryKey: ["admin-all-sites"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sites`, { credentials: "include" });
      if (!res.ok) return { sites: [] };
      return res.json();
    },
  });

  const sites = sitesData?.sites ?? [];
  const filtered = search.trim()
    ? sites.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.baseUrl.toLowerCase().includes(search.toLowerCase()),
      )
    : sites;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Site Manager</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage which users and groups have access to each site.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search sites…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {filtered.length} site{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading sites…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{search ? "No sites match your search." : "No sites found."}</p>
        </div>
      ) : (
        <div className="rounded-md border divide-y divide-border">
          {filtered.map((site) => (
            <div key={site.id} className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/30 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium text-sm truncate">{site.name}</span>
                </div>
                <a
                  href={site.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5 w-fit"
                >
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate max-w-[300px]">{site.baseUrl}</span>
                </a>
                {site.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[400px]">
                    {site.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {site.userCount !== undefined && (
                  <div className="hidden sm:flex flex-col items-center text-center min-w-[48px]">
                    <span className="text-sm font-semibold">{site.userCount}</span>
                    <span className="text-xs text-muted-foreground">users</span>
                  </div>
                )}
                {site.scanCount !== undefined && (
                  <div className="hidden sm:flex flex-col items-center text-center min-w-[48px]">
                    <span className="text-sm font-semibold">{site.scanCount}</span>
                    <span className="text-xs text-muted-foreground">scans</span>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setSelectedSite(site)}
                >
                  <Users className="w-3.5 h-3.5" />
                  Edit Access
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSite && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setSelectedSite(null); }}>
          <SiteAccessDialog site={selectedSite} onClose={() => setSelectedSite(null)} />
        </Dialog>
      )}
    </div>
  );
}
