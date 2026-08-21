import { useEffect, useState } from "react";
import { Users, Shield, Clock3, Zap, LayoutGrid, Ticket, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalGroups: number;
  openTickets: number;
  recentUsers: { id: number; fullName: string; email: string; role: string; createdAt: string }[];
  recentGroups: { id: number; name: string }[];
}

function RoleBadge({ role }: { role: string }) {
  const ROLE_CFG: Record<string, { bg: string; text: string }> = {
    super_admin: { bg: "bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800/50", text: "text-purple-700 dark:text-purple-300" },
    admin: { bg: "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/50", text: "text-blue-700 dark:text-blue-300" },
    user: { bg: "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700/50", text: "text-gray-700 dark:text-gray-300" },
  };
  const cfg = ROLE_CFG[role] || ROLE_CFG.user;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text}`}>
      {role.replace("_", " ")}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  bg,
  border,
  delayMs,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  delayMs: number;
}) {
  return (
    <article 
      className="relative rounded-[22px] border border-border/75 bg-card/60 p-5 backdrop-blur-xl shadow-[0_14px_34px_rgba(69,57,112,.06)] animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`grid h-10 w-10 place-items-center rounded-xl border ${bg} ${border} ${color} shadow-sm`}>
          {icon}
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground/90">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </article>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [usersRes, groupsRes, ticketsRes] = await Promise.all([
          fetch(`${BASE}/api/admin/users`, { credentials: "include" }),
          fetch(`${BASE}/api/admin/groups`, { credentials: "include" }),
          fetch(`${BASE}/api/tickets`, { credentials: "include" }),
        ]);
        const users = usersRes.ok ? await usersRes.json() : [];
        const groups = groupsRes.ok ? await groupsRes.json() : [];
        const tickets = ticketsRes.ok ? await ticketsRes.json() : [];

        setStats({
          totalUsers: users.length,
          activeUsers: users.filter((u: any) => u.isActive).length,
          totalGroups: groups.length,
          openTickets: tickets.filter((t: any) => t.status === "open" || t.status === "in_progress").length,
          recentUsers: users.slice(0, 6),
          recentGroups: groups.slice(0, 5),
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-10">
      <header className="relative flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-primary">Super admin</p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Admin dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <Clock3 className="h-3.5 w-3.5" /> Last refreshed: just now
        </div>
      </header>

      <section className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total users"
          value={stats?.totalUsers ?? 0}
          sub="Across all groups"
          icon={<Users className="h-5 w-5" />}
          color="text-primary"
          bg="bg-primary/10"
          border="border-primary/20"
          delayMs={0}
        />
        <StatCard
          label="Active users"
          value={stats?.activeUsers ?? 0}
          sub="Currently active accounts"
          icon={<Zap className="h-5 w-5" />}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-500/10"
          border="border-emerald-500/20"
          delayMs={50}
        />
        <StatCard
          label="User groups"
          value={stats?.totalGroups ?? 0}
          sub="Organizational units"
          icon={<LayoutGrid className="h-5 w-5" />}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-500/10"
          border="border-blue-500/20"
          delayMs={100}
        />
        <StatCard
          label="Open tickets"
          value={stats?.openTickets ?? 0}
          sub="Pending resolutions"
          icon={<Ticket className="h-5 w-5" />}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-500/10"
          border="border-amber-500/20"
          delayMs={150}
        />
      </section>

      <section className="relative grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <article className="rounded-[22px] border border-border/75 bg-card/60 p-5 backdrop-blur-xl shadow-[0_14px_34px_rgba(69,57,112,.06)] animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Recent users</h3>
            <Link href="/admin/users" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Manage all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          
          {stats?.recentUsers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-left">
                    <th className="pb-3 font-semibold text-muted-foreground">User</th>
                    <th className="pb-3 font-semibold text-muted-foreground">Role</th>
                    <th className="pb-3 font-semibold text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.recentUsers.map((u) => (
                    <tr key={u.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-primary/80 to-blue-500/80 grid place-items-center text-[10px] font-bold text-white shadow-sm">
                            {u.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{u.fullName}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <div className="space-y-4">
          <article className="rounded-[22px] border border-border/75 bg-card/60 p-5 backdrop-blur-xl shadow-[0_14px_34px_rgba(69,57,112,.06)] animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: "250ms" }}>
            <h3 className="text-sm font-semibold text-foreground mb-4">System status</h3>
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
              <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.15)] animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">All systems operational</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Services running normally</p>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">OK</span>
            </div>
          </article>

          <article className="rounded-[22px] border border-border/75 bg-card/60 p-5 backdrop-blur-xl shadow-[0_14px_34px_rgba(69,57,112,.06)] animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: "300ms" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">User groups</h3>
              <Link href="/admin/groups" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </div>
            
            {stats?.recentGroups.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">No groups found.</div>
            ) : (
              <div className="space-y-3">
                {stats?.recentGroups.map((g) => (
                  <div key={g.id} className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                      {g.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{g.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
