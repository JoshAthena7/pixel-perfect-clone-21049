import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { FileText, Home, LayoutGrid, Settings, Zap } from "lucide-react";
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
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        One moment…
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)] w-full">
      <AdminSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </div>
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
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Zap className="h-4 w-4 text-[color:var(--athena-gold)]" />
        <span className="text-[11px] font-extrabold uppercase tracking-[0.28em]">Olympus</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <NavItem to="/admin" active={isActive("/admin", true)} icon={<LayoutGrid size={15} strokeWidth={1.5} />}>
          Missions
        </NavItem>
        {missionId && (
          <NavItem
            to="/admin/missions/$missionId"
            params={{ missionId }}
            active={path.startsWith("/admin/missions/" + missionId)}
            icon={<FileText size={15} strokeWidth={1.5} />}
          >
            Mission Detail
          </NavItem>
        )}
        <NavItem to="/admin/settings" active={isActive("/admin/settings")} icon={<Settings size={15} strokeWidth={1.5} />}>
          Settings
        </NavItem>
      </nav>
      <div className="border-t border-border px-2 py-3">
        <NavItem to="/missions" active={false} icon={<Home size={15} strokeWidth={1.5} />}>
          Atlas Home
        </NavItem>
      </div>
    </aside>
  );
}

function NavItem({ to, params, active, icon, children }: {
  to: string; params?: Record<string, string>; active: boolean;
  icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      params={params}
      className={"flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors " + (
        active ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
    </Link>
  );
}
