import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Users, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) {
      throw redirect({ to: "/olympus/missions" });
    }
  },
  component: AdminLayout,
});

const TABS = [
  { to: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/admin/team", label: "Team Roster", icon: Users, exact: false },
];

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-surface/40">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-6 overflow-x-auto">
          {TABS.map((t) => {
            const active = t.exact ? path === t.to : path === t.to || path.startsWith(t.to + "/");
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
