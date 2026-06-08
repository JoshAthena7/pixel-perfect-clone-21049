import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { FileText, Home, LayoutGrid, Settings } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAccess";
import { useRedirectIfBlocked } from "@/hooks/useRedirectIfBlocked";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { isAdmin, isLoading } = useIsAdmin();
  const gate = isLoading ? undefined : isAdmin;
  useRedirectIfBlocked(gate);

  if (isLoading || gate === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        One moment…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AdminSidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function AdminSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (p: string, exact = false) =>
    exact ? path === p : path.startsWith(p);
  const missionDetailMatch = path.match(/^\/admin\/missions\/([^/]+)/);
  const missionId = missionDetailMatch?.[1];

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.28em]">
          Olympus
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        <NavItem to="/admin" active={isActive("/admin", true)} icon={<LayoutGrid className="h-4 w-4" />}>
          Missions
        </NavItem>
        {missionId && (
          <NavItem
            to="/admin/missions/$missionId"
            params={{ missionId }}
            active={isActive("/admin/missions/")}
            icon={<FileText className="h-4 w-4" />}
          >
            Mission Detail
          </NavItem>
        )}
        <NavItem to="/admin/settings" active={isActive("/admin/settings")} icon={<Settings className="h-4 w-4" />}>
          Settings
        </NavItem>
      </nav>

      <div className="border-t border-border px-2 py-3">
        <NavItem to="/missions" active={false} icon={<Home className="h-4 w-4" />}>
          Atlas Home
        </NavItem>
      </div>
    </aside>
  );
}

function NavItem({
  to,
  params,
  active,
  icon,
  children,
}: {
  to: string;
  params?: Record<string, string>;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      params={params as never}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-surface-hover text-foreground"
          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
