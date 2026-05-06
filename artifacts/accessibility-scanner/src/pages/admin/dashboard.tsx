import { useEffect, useState } from "react";
import { Users, TicketCheck, Activity, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalGroups: number;
  openTickets: number;
  recentUsers: { id: number; fullName: string; email: string; role: string; createdAt: string }[];
}

function RoleBadge({ role }: { role: string }) {
  const variants: Record<string, string> = {
    super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    user: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[role] || variants.user}`}>
      {role.replace("_", " ")}
    </span>
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
          recentUsers: users.slice(0, 5),
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">System overview and quick stats</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalUsers ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats?.activeUsers ?? 0} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="w-4 h-4" /> User Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalGroups ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TicketCheck className="w-4 h-4" /> Open Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.openTickets ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="w-4 h-4" /> Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className="bg-green-500 text-white border-transparent">Operational</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Users</CardTitle>
        </CardHeader>
        <CardContent>
          {stats?.recentUsers.length === 0 ? (
            <p className="text-muted-foreground text-sm">No users yet.</p>
          ) : (
            <div className="space-y-3">
              {stats?.recentUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{u.fullName}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <RoleBadge role={u.role} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
