import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
}

function getBase() {
  return (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
}

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${getBase()}/api/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

async function createProject(name: string): Promise<Project> {
  const res = await fetch(`${getBase()}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

interface ProjectSelectorProps {
  value: number | null;
  onChange: (projectId: number | null, projectName: string | null) => void;
  required?: boolean;
  error?: boolean;
}

export function ProjectSelector({
  value,
  onChange,
  required,
  error,
}: ProjectSelectorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const selectedProject = projects.find((p) => p.id === value) ?? null;

  const createMutation = useMutation({
    mutationFn: (name: string) => createProject(name),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onChange(project.id, project.name);
      setNewProjectName("");
      setShowCreate(false);
      setOpen(false);
      toast({ title: `Project "${project.name}" created` });
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
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
        >
          <span className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selectedProject ? selectedProject.name : "Select project…"}
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
          <CommandInput placeholder="Search projects…" />
          <CommandList>
            <CommandEmpty>
              <span className="text-sm text-muted-foreground">No projects found.</span>
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

            <CommandSeparator />

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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
