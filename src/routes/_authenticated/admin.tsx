import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

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
    return null;
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)] w-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.28em]">
            Olympus
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-3">
          <NavLink to="/admin" label="Missions" />
          <NavLink to="/admin/settings" label="Settings" />
        </nav>

        <div className="border-t border-border px-2 py-3">
          <NavLink to="/missions" label="Atlas Home" />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
      activeProps={{ className: "bg-surface-hover text-foreground" }}
    >
      {label}
    </Link>
  );
}
