// @refresh reset
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

export interface UserPermissions {
  canScan: boolean;
  canExport: boolean;
  canViewAllScans: boolean;
  canEditScan: boolean;
  canDeleteScan: boolean;
  canManageScan: boolean;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canDisableJs: boolean;
  canSmartAnalysis: boolean;
  canSwitchSite: boolean;
  canCreateCrawl: boolean;
  canDeleteCrawl: boolean;
  canViewCrawlHistory: boolean;
  canViewQualityAssurance: boolean;
  canViewSiteAccessibilityDashboard: boolean;
  canManageSites: boolean;
  canManageSiteTargetScore: boolean;
  canViewIssues: boolean;
  canCreateIssue: boolean;
  canEditIssue: boolean;
  canCommentIssue: boolean;
  canManageIssues: boolean;
  canViewHtmlReplay: boolean;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
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

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  profileImageUrl?: string | null;
  role: string;
  mustResetPassword: boolean;
  permissions: UserPermissions;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  authError: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retryAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// Aborting a fetch is best-effort: a stalled proxy or response body can leave
// its promise pending. Race the whole auth exchange so the UI always settles.
async function withAuthDeadline<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("The server did not respond in time. Please try again."));
    }, 12_000);
  });
  try {
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const refreshInFlight = useRef(false);

  const refreshUser = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const verifiedUser = await withAuthDeadline<AuthUser | null>(async (signal) => {
        const userRes = await fetch(`${BASE}/api/auth/me`, {
          credentials: "include",
          signal,
        });
        if (userRes.status === 401) return null;
        if (!userRes.ok) throw new Error("Session check failed");

        const userData = await userRes.json();
        const permsRes = await fetch(`${BASE}/api/auth/my-permissions`, {
          credentials: "include",
          signal,
        });
        if (permsRes.status === 401) return null;
        if (!permsRes.ok) throw new Error("Permission check failed");
        const perms = await permsRes.json();
        return { ...userData, permissions: perms };
      });
      setUser(verifiedUser);
      setAuthError(false);
    } catch {
      // A timeout or server failure is not evidence that the session expired.
      // Keep an existing user visible and let a fresh visit retry explicitly.
      setAuthError(true);
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    if (!authError || user) return;
    const timer = setInterval(() => { void refreshUser(); }, 20_000);
    return () => clearInterval(timer);
  }, [authError, user, refreshUser]);

  const retryAuth = useCallback(async () => {
    setLoading(true);
    try {
      await refreshUser();
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const verifiedUser = await withAuthDeadline<AuthUser>(async (signal) => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Login failed");
      }
      const userData = await res.json();
      const permsRes = await fetch(`${BASE}/api/auth/my-permissions`, { credentials: "include", signal });
      const perms = permsRes.ok ? await permsRes.json() : DEFAULT_PERMISSIONS;
      return { ...userData, permissions: perms };
    });
    setUser(verifiedUser);
    setAuthError(false);
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
    setAuthError(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, logout, refreshUser, retryAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "super_admin" || user?.role === "admin";
}

export function isSuperAdmin(user: AuthUser | null): boolean {
  return user?.role === "super_admin";
}
