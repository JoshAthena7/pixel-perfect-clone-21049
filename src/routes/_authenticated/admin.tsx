import { useState } from "react";
import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
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

type Tab = { id: string; label: string; to: string; match: (p: string) => boolean; highlight?: boolean };

const MAIN_TABS: Tab[] = [
  { id: "mission-command", label: "ORACLE Command", to: "/olympus", match: (p) => p === "/olympus" || p === "/olympus/", highlight: true },
  { id: "missions", label: "Missions", to: "/admin", match: (p) => p === "/admin" || p === "/admin/" || p.startsWith("/admin/missions") },
  { id: "staff", label: "Staff", to: "/admin/team", match: (p) => p.startsWith("/admin/team") },
  { id: "messaging", label: "Messaging", to: "/admin/messaging", match: (p) => p.startsWith("/admin/messaging") },
  { id: "state-intel", label: "State Intel", to: "/admin/state-intel", match: (p) => p.startsWith("/admin/state-intel") },
];

const PLATFORM_TOOLS: Tab[] = [
  { id: "iris-control", label: "IRIS Control", to: "/admin/iris-control", match: (p) => p.startsWith("/admin/iris-control") },
  { id: "iris-studio", label: "IRIS Studio", to: "/admin/iris-studio", match: (p) => p.startsWith("/admin/iris-studio") },
  { id: "iris-writer-view", label: "IRIS Writer View", to: "/admin/iris-writer-view", match: (p) => p.startsWith("/admin/iris-writer-view") },
  { id: "iris-refresh", label: "IRIS Refresh", to: "/admin/iris-refresh", match: (p) => p.startsWith("/admin/iris-refresh") },
  { id: "settings", label: "Settings", to: "/admin/settings", match: (p) => p.startsWith("/admin/settings") },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const toolsActive = PLATFORM_TOOLS.some((t) => t.match(pathname));
  const [toolsOpen, setToolsOpen] = useState<boolean>(toolsActive);

  const renderTab = (t: Tab, indented = false) => {
    const active = t.match(pathname);
    if (t.highlight) {
      return (
        <Link
          key={t.id}
          to={t.to as any}
          className="px-3 py-1.5 rounded-md mr-2 transition-colors"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: active ? "#070f1c" : "#c9a84c",
            background: active ? "#c9a84c" : "rgba(201,168,76,0.12)",
            border: "1px solid #c9a84c",
          }}
        >
          {t.label}
        </Link>
      );
    }
    return (
      <Link
        key={t.id}
        to={t.to as any}
        className="px-3 py-1.5 rounded-md transition-colors hover:bg-white/[0.05]"
        style={{
          fontSize: indented ? 11 : 12,
          marginLeft: indented ? 8 : 0,
          color: active ? "#c9a84c" : "rgba(255,255,255,0.55)",
          fontWeight: active ? 600 : 400,
          borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
        }}
      >
        {t.label}
      </Link>
    );
  };

  return (
    <div>
      <div
        className="sticky top-12 z-30 flex items-center gap-1 px-6 h-10"
        style={{ background: "#070f1c", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="mr-3" style={{ color: "white", fontSize: 12, fontWeight: 500 }}>Admin</span>
        <span className="mr-3" style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>·</span>
        {MAIN_TABS.map((t) => renderTab(t))}

        {/* Platform Tools collapsible group, inline after the main tabs */}
        <div className="flex items-center gap-1 relative ml-2">
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/[0.05] transition-colors"
            style={{
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: toolsActive ? "#c9a84c" : "rgba(255,255,255,0.4)",
              fontWeight: 600,
            }}
            aria-expanded={toolsOpen}
          >
            {toolsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Platform Tools
          </button>
          {toolsOpen && (
            <div
              className="absolute right-0 top-full mt-1 flex flex-col gap-0.5 py-1.5 px-1.5 rounded-md z-40"
              style={{
                background: "#0c1626",
                border: "1px solid rgba(255,255,255,0.08)",
                minWidth: 180,
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              }}
            >
              {PLATFORM_TOOLS.map((t) => renderTab(t, true))}
            </div>
          )}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
