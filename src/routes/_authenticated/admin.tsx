import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
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
      throw redirect({ to: "/my-work" });
    }
  },
  component: AdminLayout,
});

const TABS = [
  { id: "missions", label: "Missions", to: "/admin" as const, match: (p: string) => p === "/admin" || p === "/admin/" || p.startsWith("/admin/missions") },
  { id: "staff", label: "Staff", to: "/admin/team" as const, match: (p: string) => p.startsWith("/admin/team") },
  { id: "messaging", label: "Messaging", to: "/admin/messaging" as const, match: (p: string) => p.startsWith("/admin/messaging") },
  
  { id: "iris-control", label: "IRIS Control", to: "/admin/iris-control" as const, match: (p: string) => p.startsWith("/admin/iris-control") },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div>
      <div
        className="sticky top-12 z-30 flex items-center gap-1 px-6 h-10"
        style={{ background: "#070f1c", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span
          className="mr-3"
          style={{ color: "white", fontSize: 12, fontWeight: 500 }}
        >
          Admin
        </span>
        <span className="mr-3" style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>·</span>
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.id}
              to={t.to}
              className="px-3 py-1.5 rounded-md transition-colors hover:bg-white/[0.05]"
              style={{
                fontSize: 12,
                color: active ? "#c9a84c" : "rgba(255,255,255,0.55)",
                fontWeight: active ? 600 : 400,
                borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
