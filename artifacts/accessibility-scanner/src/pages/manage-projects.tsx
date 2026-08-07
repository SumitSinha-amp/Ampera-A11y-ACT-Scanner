import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Link2, Loader2, Plus, Unlink } from "lucide-react";
import { useSite } from "@/contexts/site";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const BASE = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

interface ProjectSite {
  id: number;
  name: string;
}

interface Project {
  id: number;
  name: string;
  createdAt: string;
  sites: ProjectSite[];
}

async function fetchProjects(query: string): Promise<Project[]> {
  const response = await fetch(`${BASE}/api/projects${query}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Unable to load projects");
  return response.json();
}

async function createProject(name: string, siteId: number): Promise<void> {
  const response = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, siteId }),
  });
  if (!response.ok) throw new Error("Unable to create project");
}

async function updateAssociation(
  projectId: number,
  siteId: number,
  method: "POST" | "DELETE",
): Promise<void> {
  const response = await fetch(
    method === "POST"
      ? `${BASE}/api/projects/${projectId}/sites`
      : `${BASE}/api/projects/${projectId}/sites/${siteId}`,
    {
      method,
      credentials: "include",
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify({ siteId }) : undefined,
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Unable to update project association");
  }
}

export default function ManageProjectsPage() {
  const { activeSite, sites } = useSite();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const siteId = activeSite?.id ?? null;
  const canCreate = user?.permissions.canCreateProject !== false;
  const canDelete = user?.permissions.canDeleteProject !== false;

  const siteProjectsQuery = useQuery<Project[]>({
    queryKey: ["projects", siteId],
    queryFn: () => fetchProjects(`?siteId=${siteId}`),
    enabled: siteId != null,
  });
  const allProjectsQuery = useQuery<Project[]>({
    queryKey: ["projects", "manageable"],
    queryFn: () => fetchProjects("?includeUnassociated=true"),
    enabled: siteId != null,
  });

  const currentProjects = siteProjectsQuery.data ?? [];
  const manageableProjects = allProjectsQuery.data ?? [];
  const availableToAttach = useMemo(
    () =>
      manageableProjects.filter(
        (project) => !project.sites.some((site) => site.id === siteId),
      ),
    [manageableProjects, siteId],
  );

  const refreshProjects = () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!siteId) throw new Error("Select a site first");
      return createProject(newProjectName.trim(), siteId);
    },
    onSuccess: () => {
      setNewProjectName("");
      refreshProjects();
      toast({ title: "Project created", description: `Added under ${activeSite?.name}.` });
    },
    onError: (error: Error) =>
      toast({ title: "Project could not be created", description: error.message, variant: "destructive" }),
  });

  const associationMutation = useMutation({
    mutationFn: ({ projectId, method }: { projectId: number; method: "POST" | "DELETE" }) => {
      if (!siteId) throw new Error("Select a site first");
      return updateAssociation(projectId, siteId, method);
    },
    onSuccess: (_data, variables) => {
      setSelectedProjectId("");
      refreshProjects();
      toast({
        title: variables.method === "POST" ? "Project linked" : "Project unlinked",
        description: variables.method === "POST"
          ? `The project is now available for ${activeSite?.name}.`
          : "The project remains available to its other sites.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Project association could not be changed", description: error.message, variant: "destructive" }),
  });

  if (!activeSite) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Manage Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a site from the global site switcher to manage its projects.
          </p>
        </div>
        <Alert>
          <AlertDescription>
            Projects are always associated with a site. Choose a site first, then create or link projects under it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manage Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the projects available for <span className="font-medium text-foreground">{activeSite.name}</span>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            Add a project under this site
          </CardTitle>
          <CardDescription>
            New projects created here will only appear when this site is selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canCreate && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="new-project-name" className="sr-only">New project name</Label>
                <Input
                  id="new-project-name"
                  placeholder="New project name…"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newProjectName.trim()) createMutation.mutate();
                  }}
                />
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!newProjectName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create project
              </Button>
            </div>
          )}

          {canCreate && availableToAttach.length > 0 && (
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Link an existing or legacy project…" />
                </SelectTrigger>
                <SelectContent>
                  {availableToAttach.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                      {project.sites.length === 0 ? " (unassociated legacy project)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => associationMutation.mutate({ projectId: Number(selectedProjectId), method: "POST" })}
                disabled={!selectedProjectId || associationMutation.isPending}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Link to site
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects under {activeSite.name}</CardTitle>
          <CardDescription>
            Only these projects are available in the New Scan project selector for this site.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {siteProjectsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
            </div>
          ) : currentProjects.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No projects are associated with this site yet.
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {currentProjects.map((project) => (
                <div key={project.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {project.sites.map((site) => (
                        <Badge key={site.id} variant="secondary" className="text-xs">{site.name}</Badge>
                      ))}
                    </div>
                  </div>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => associationMutation.mutate({ projectId: project.id, method: "DELETE" })}
                      disabled={associationMutation.isPending}
                      title="Remove this site association"
                    >
                      <Unlink className="mr-2 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {sites.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Switch sites from the global header to manage each site’s project list separately.
        </p>
      )}
    </div>
  );
}