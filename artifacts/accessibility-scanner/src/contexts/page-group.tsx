import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useSite } from "./site";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LS_PREFIX = "page-group-site-";

export interface PageGroup {
  id: string;
  name: string;
}

interface PageGroupContextValue {
  selectedGroup: PageGroup | null;
  setSelectedGroup: (group: PageGroup | null) => void;
  groups: PageGroup[];
  isLoading: boolean;
  isError: boolean;
}

const PageGroupContext = createContext<PageGroupContextValue>({
  selectedGroup: null,
  setSelectedGroup: () => {},
  groups: [],
  isLoading: false,
  isError: false,
});

function readStoredGroupId(siteId: number): string | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${siteId}`);
    return raw || null;
  } catch {
    return null;
  }
}

function writeStoredGroupId(siteId: number, groupId: string | null) {
  try {
    if (groupId === null) {
      localStorage.removeItem(`${LS_PREFIX}${siteId}`);
    } else {
      localStorage.setItem(`${LS_PREFIX}${siteId}`, String(groupId));
    }
  } catch {
    // ignore
  }
}

export function PageGroupProvider({ children }: { children: ReactNode }) {
  const { activeSite } = useSite();
  const siteId = activeSite?.id ?? null;

  const { data, isLoading, isError } = useQuery<PageGroup[]>({
    queryKey: ["page-groups", siteId],
    enabled: siteId !== null,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sites/${siteId}/page-groups`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      const rawGroups = Array.isArray(json) ? json : (json.groups ?? []);
      return rawGroups
        .map((group: { page_type?: string; name?: string; id?: string }) => {
          const name = group.page_type ?? group.name ?? "";
          return { id: group.id ?? name, name };
        })
        .filter((group: PageGroup) => group.id.length > 0);
    },
  });

  const groups: PageGroup[] = data ?? [];

  // Per-site stored selection — keyed by site id.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => {
    if (siteId === null) return null;
    return readStoredGroupId(siteId);
  });

  // Reset / restore when the active site changes.
  useEffect(() => {
    if (siteId === null) {
      setSelectedGroupId(null);
      return;
    }
    setSelectedGroupId(readStoredGroupId(siteId));
  }, [siteId]);

  // Validate stored selection once the groups list is loaded; clear it when
  // the previously stored group no longer exists in the current list.
  useEffect(() => {
    if (groups.length === 0) return;
    if (selectedGroupId !== null && !groups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(null);
      if (siteId !== null) writeStoredGroupId(siteId, null);
    }
  }, [groups, selectedGroupId, siteId]);

  const setSelectedGroup = useCallback(
    (group: PageGroup | null) => {
      const id = group?.id ?? null;
      setSelectedGroupId(id);
      if (siteId !== null) writeStoredGroupId(siteId, id);
    },
    [siteId],
  );

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  return (
    <PageGroupContext.Provider
      value={{ selectedGroup, setSelectedGroup, groups, isLoading, isError }}
    >
      {children}
    </PageGroupContext.Provider>
  );
}

export function usePageGroup() {
  return useContext(PageGroupContext);
}
