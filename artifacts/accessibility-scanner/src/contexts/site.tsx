import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_KEY = "active-site-id";

export interface MySite {
  id: number;
  name: string;
  baseUrl: string;
  description: string | null;
  role: string;
  pageCount: number;
}

interface SiteContextValue {
  sites: MySite[];
  activeSite: MySite | null;
  /** The numeric site ID currently selected — available immediately from localStorage,
   *  before the full `sites` list has loaded. Null when "All sites" is selected or
   *  no site has ever been chosen. Use this (not `activeSite?.id`) to build API query
   *  params that need to fire on first render. */
  activeSiteId: number | null;
  setActiveSite: (site: MySite | null) => void;
  isLoading: boolean;
}

const SiteContext = createContext<SiteContextValue>({
  sites: [],
  activeSite: null,
  activeSiteId: null,
  setActiveSite: () => {},
  isLoading: false,
});

// "all" = user explicitly chose "All sites"; number string = specific site; absent = first visit
type SiteIdState = number | "all" | null; // null = never set → will auto-select

function readStoredSiteId(): SiteIdState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    if (stored === "all") return "all";
    const parsed = parseInt(stored, 10);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const { data, isLoading } = useQuery<{ sites: MySite[] }>({
    queryKey: ["my-sites", user?.id, user?.role],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sites/my-sites`, { credentials: "include" });
      if (!res.ok) return { sites: [] };
      return res.json();
    },
  });

  const sites = data?.sites ?? [];

  const [activeSiteIdState, setActiveSiteIdState] = useState<SiteIdState>(readStoredSiteId);

  useEffect(() => {
    if (sites.length === 0) return;
    // Only Superadmin may keep the global "All sites" selection.
    if (activeSiteIdState === "all" && isSuperAdmin) return;
    // Valid specific site already selected
    if (typeof activeSiteIdState === "number" && sites.some((s) => s.id === activeSiteIdState)) return;
    // First visit (null) or stored site no longer accessible — auto-select first site
    const first = sites[0];
    setActiveSiteIdState(first.id);
    try { localStorage.setItem(STORAGE_KEY, String(first.id)); } catch {}
  }, [sites, activeSiteIdState, isSuperAdmin]);

  const activeSite =
    (activeSiteIdState === "all" && isSuperAdmin) || activeSiteIdState === null
      ? null
      : (sites.find((s) => s.id === activeSiteIdState) ?? null);

  // Numeric ID available immediately (from localStorage state), before sites list loads.
  // Null when "all" is selected or nothing is stored yet.
  const activeSiteId =
    typeof activeSiteIdState === "number" ? activeSiteIdState : null;

  const setActiveSite = useCallback((site: MySite | null) => {
    if (site === null && isSuperAdmin) {
      setActiveSiteIdState("all");
      try { localStorage.setItem(STORAGE_KEY, "all"); } catch {}
    } else if (site) {
      setActiveSiteIdState(site.id);
      try { localStorage.setItem(STORAGE_KEY, String(site.id)); } catch {}
    }
  }, [isSuperAdmin]);

  return (
    <SiteContext.Provider value={{ sites, activeSite, activeSiteId, setActiveSite, isLoading }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
