import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Check, ChevronDown, FolderOpen, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface Project {
  id: number;
  name: string;
  createdAt: string;
  sites?: { id: number; name: string }[];
}

function getBase() {
  return (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
}

async function fetchProjects(siteId: number | null): Promise<Project[]> {
  if (siteId == null) return [];
  const res = await fetch(`${getBase()}/api/projects?siteId=${siteId}`, { credentials: "include" });
  if (!res.ok) {
    let message = `Failed to fetch projects (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Preserve the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }
  return res.json();
}

async function createProject(name: string, siteId: number | null): Promise<Project> {
  if (siteId == null) throw new Error("A site must be selected first");
  const res = await fetch(`${getBase()}/api/projects`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, siteId }),
  });
  if (!res.ok) {
    let message = `Failed to create project (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Preserve the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }
  return res.json();
}

interface ProjectSelectorProps {
  value: number | null;
  onChange: (projectId: number | null, projectName: string | null) => void;
  required?: boolean;
  error?: boolean;
  siteId?: number | null;
  legacyProjectName?: string | null;
}

export function ProjectSelector({
  value,
  onChange,
  required,
  error,
  siteId = null,
  legacyProjectName = null,
}: ProjectSelectorProps) {
  const { user } = useAuth();
  const canCreate = user?.permissions.canCreateProject !== false;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  const {
    data: projects = [],
    isLoading,
    isError,
    error: projectsError,
    refetch,
  } = useQuery<Project[]>({
    queryKey: ["projects", siteId],
    queryFn: () => fetchProjects(siteId),
    enabled: siteId != null,
  });

  const selectedProject = projects.find((p) => p.id === value) ?? null;
  const selectedProjectLabel =
    selectedProject?.name ??
    (value != null && legacyProjectName ? `${legacyProjectName} (legacy association)` : null);

  const createMutation = useMutation({
    mutationFn: (name: string) => createProject(name, siteId),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects", siteId] });
      onChange(project.id, project.name);
      setNewProjectName("");
      setShowCreate(false);
      setOpen(false);
      toast({ title: `Project "${project.name}" created` });
    },
    onError: (error) => {
      toast({
        title: "Failed to create project",
        description: error instanceof Error
          ? error.message
          : "Confirm that you have project permission and access to the selected site.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (showCreate) {
      setTimeout(() => newProjectInputRef.current?.focus(), 50);
    }
  }, [showCreate]);

  const handleCreate = () => {
    const name = newProjectName.trim();
    if (!name) return;
    createMutation.mutate(name);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selectedProject && "text-muted-foreground",
            error && "border-destructive ring-1 ring-destructive",
          )}
          disabled={siteId == null}
          title={siteId == null ? "Select a site first" : undefined}
        >
          <span className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
                {selectedProjectLabel ?? "Select project…"}
            </span>
          </span>
          {isLoading ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
            <CommandInput placeholder={siteId == null ? "Select a site first" : "Search projects…"} />
          <CommandList>
            <CommandEmpty>
              {isError ? (
                <div className="space-y-2 px-3 py-2 text-left">
                  <p className="text-sm text-destructive">
                    {projectsError instanceof Error ? projectsError.message : "Unable to load projects."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => refetch()}
                  >
                    Try again
                  </Button>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {siteId == null ? "Select a site first." : "No projects found under this site."}
                </span>
              )}
            </CommandEmpty>
            {projects.length > 0 && (
              <CommandGroup heading="Projects">
                {projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={project.name}
                    onSelect={() => {
                      onChange(project.id, project.name);
                      setOpen(false);
                      setShowCreate(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === project.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {project.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {canCreate && <CommandSeparator />}

            {canCreate && (
            <CommandGroup>
              {!showCreate ? (
                <CommandItem
                  onSelect={() => setShowCreate(true)}
                  className="text-primary cursor-pointer"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create new project
                </CommandItem>
              ) : (
                <div className="px-2 py-2 flex gap-2">
                  <Input
                    ref={newProjectInputRef}
                    placeholder="New project name…"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
                      if (e.key === "Escape") { setShowCreate(false); setNewProjectName(""); }
                    }}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3"
                    onClick={handleCreate}
                    disabled={!newProjectName.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              )}
            </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
