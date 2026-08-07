import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Globe, MoreHorizontal, Pencil, Trash2, ExternalLink, BarChart3, User, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth, isAdmin } from "@/contexts/auth";
import { useSite } from "@/contexts/site";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Site {
  id: number;
  name: string;
  baseUrl: string;
  description: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AppUserOption {
  id: number;
  fullName: string;
  username: string;
  role: string;
}

interface SiteFormProps {
  initial?: Partial<Site>;
  onSubmit: (data: { name: string; baseUrl: string; description: string; ownerUserId?: string | null }) => void;
  onCancel: () => void;
  isPending: boolean;
  title: string;
  showOwner: boolean;
  users: AppUserOption[];
}

function SiteForm({ initial, onSubmit, onCancel, isPending, title, showOwner, users }: SiteFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [ownerUserId, setOwnerUserId] = useState<string>(initial?.userId ?? "__unassigned__");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Site Name *</Label>
          <Input
            placeholder="e.g. Keysight Technologies"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Base URL *</Label>
          <Input
            type="url"
            placeholder="https://www.keysight.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">The root URL for this site, used for crawler scans.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            placeholder="Optional description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {showOwner && (
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Select value={ownerUserId} onValueChange={setOwnerUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.fullName} ({u.username}) — {u.role.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The assigned owner sees this site's Dashboard, Issues, and Compliance pages in their sidebar.
            </p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() =>
            onSubmit({
              name: name.trim(),
              baseUrl: baseUrl.trim(),
              description: description.trim(),
              ...(showOwner ? { ownerUserId: ownerUserId === "__unassigned__" ? null : ownerUserId } : {}),
            })
          }
          disabled={isPending || !name.trim() || !baseUrl.trim()}
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function SitesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const adminUser = isAdmin(user);
  const canManageSites = user?.permissions?.canManageSites ?? false;
  const { activeSite } = useSite();
  const [location, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const query = location.split("?")[1] ?? "";
    if (new URLSearchParams(query).get("create") === "1" && canManageSites) {
      setShowCreate(true);
      navigate("/crawler/sites", { replace: true });
    }
  }, [location, canManageSites, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sites`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sites");
      return res.json() as Promise<{ sites: Site[] }>;
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users-for-site-owner"],
    enabled: adminUser,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/users`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<AppUserOption[]>;
    },
  });
  const users = usersData ?? [];
  const usersById = new Map(users.map((u) => [String(u.id), u]));

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; baseUrl: string; description: string; ownerUserId?: string | null }) => {
      const res = await fetch(`${BASE}/api/sites`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to create site");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Site created" });
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["my-sites"] });
      qc.invalidateQueries({ queryKey: ["my-sites-legacy"] });
    },
    onError: (err) => { toast({ title: err.message, variant: "destructive" }); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; name: string; baseUrl: string; description: string; ownerUserId?: string | null }) => {
      const res = await fetch(`${BASE}/api/sites/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to update site");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Site updated" });
      setEditSite(null);
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["my-sites"] });
      qc.invalidateQueries({ queryKey: ["my-sites-legacy"] });
    },
    onError: (err) => { toast({ title: err.message, variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/sites/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete site");
    },
    onSuccess: () => {
      toast({ title: "Site deleted" });
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["my-sites"] });
      qc.invalidateQueries({ queryKey: ["my-sites-legacy"] });
    },
    onError: () => { toast({ title: "Failed to delete site", variant: "destructive" }); },
  });

  const sites = data?.sites ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sites</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your tracked sites. Select a site when creating crawler scans.
          </p>
        </div>
        {canManageSites && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Site
          </Button>
        )}
      </div>

      {isLoading && <div className="text-muted-foreground text-sm">Loading sites…</div>}

      {!isLoading && sites.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Globe className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No sites yet. Create one to associate with crawler scans.</p>
            {canManageSites && (
              <Button variant="outline" onClick={() => setShowCreate(true)}>Add your first site</Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sites.map((site) => {
          const isActive = activeSite?.id === site.id;
          return (
          <Card
            key={site.id}
            className={`hover:shadow-md transition-shadow${isActive ? " ring-2 ring-primary" : ""}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <CardTitle className="text-base truncate">{site.name}</CardTitle>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Active
                    </span>
                  )}
                </div>
                {canManageSites && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditSite(site)} className="gap-2">
                        <Pencil className="w-4 h-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteId(site.id)}
                        className="gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <a
                href={site.baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate"
              >
                {site.baseUrl}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              {site.description && (
                <p className="text-xs text-muted-foreground">{site.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Added {new Date(site.createdAt).toLocaleDateString()}
              </p>
              {adminUser && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3 shrink-0" />
                  {site.userId && usersById.get(site.userId)
                    ? `Owner: ${usersById.get(site.userId)!.fullName}`
                    : "Owner: Unassigned"}
                </p>
              )}
              <div className="pt-1">
                <div className={`grid ${canManageSites ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
                    <Link href={`/sites/${site.id}`}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                        <BarChart3 className="w-3.5 h-3.5" />
                        Dashboard
                      </Button>
                    </Link>
                  {canManageSites && (
                    <Link href={`/crawler/sites/${site.id}/manage`}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                        Manage crawl
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <SiteForm
          title="New Site"
          onSubmit={createMutation.mutate}
          onCancel={() => setShowCreate(false)}
          isPending={createMutation.isPending}
          showOwner={adminUser}
          users={users}
        />
      </Dialog>

      <Dialog open={editSite !== null} onOpenChange={(o) => { if (!o) setEditSite(null); }}>
        {editSite && (
          <SiteForm
            title="Edit Site"
            initial={editSite}
            onSubmit={(data) => updateMutation.mutate({ id: editSite.id, ...data })}
            onCancel={() => setEditSite(null)}
            isPending={updateMutation.isPending}
            showOwner={adminUser}
            users={users}
          />
        )}
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete site?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the site record. Existing crawler scans linked to this site will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId !== null) { deleteMutation.mutate(deleteId); setDeleteId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
