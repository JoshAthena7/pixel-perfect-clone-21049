import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  createFileRoute, Outlet, Link, useRouterState, useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, ChevronDown, Zap,
  LayoutGrid, ClipboardCheck, UserCog, History, Brain,
  UserPlus, Activity,
  ShieldAlert, UserMinus, Megaphone,
  Globe, Inbox, TrendingUp, Gauge, Compass,
} from "lucide-react";

import { useIsAdmin } from "@/hooks/useAccess";
import { useRedirectIfBlocked } from "@/hooks/useRedirectIfBlocked";

// Platform Administration layout — formerly /olympus/*.
// Admin only. Non-admins are redirected to their mission Flight Deck so the
// admin control room is never visible to writers/SMEs/reviewers.

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

type Mission = { id: string; name: string; client: string };

const SELECTED_KEY = "admin:mission";

function AdminLayout() {
  const { isAdmin, isLoading } = useIsAdmin();
  const gate = isLoading ? undefined : isAdmin;
  useRedirectIfBlocked(gate);

  if (isLoading || gate === false) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)] w-full">
      <AdminSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <AdminHeader />
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}


/* ────────── Header with mission switcher ────────── */

function AdminHeader() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_KEY) : null,
  );

  const { data: missions = [] } = useQuery({
    queryKey: ["admin-header-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client")
        .order("created_at", { ascending: false });
      return (data ?? []) as Mission[];
    },
  });

  useEffect(() => {
    if (!selectedId && missions.length > 0) {
      setSelectedId(missions[0].id);
      window.localStorage.setItem(SELECTED_KEY, missions[0].id);
    }
  }, [missions, selectedId]);

  const selected = missions.find((m) => m.id === selectedId) ?? null;

  function pick(id: string) {
    setSelectedId(id);
    window.localStorage.setItem(SELECTED_KEY, id);
    window.dispatchEvent(new CustomEvent("admin:mission-changed", { detail: id }));
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/40 px-5">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-[color:var(--athena-gold)]" />
        <span className="text-[12px] font-extrabold uppercase tracking-[0.32em]">Admin</span>
        <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Platform Administration</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300/90">
          Active Mission Context:
        </span>
        <MissionSwitcher missions={missions} selected={selected} onPick={pick} />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (selected) navigate({ to: "/missions/$missionId/brief", params: { missionId: selected.id } });
            else navigate({ to: "/home" });
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 hover:text-amber-100"
        >
          <ArrowLeft className="h-3 w-3" /> Exit to Mission
        </button>
      </div>
    </header>
  );
}

function MissionSwitcher({ missions, selected, onPick }: {
  missions: Mission[]; selected: Mission | null; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (missions.length === 0) {
    return <div className="text-xs text-muted-foreground">No missions yet</div>;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-w-[280px] max-w-[480px] items-center gap-2 whitespace-nowrap rounded-md border-2 border-amber-500/40 bg-amber-500/[0.04] px-3 py-2 text-sm hover:border-amber-500/70 hover:bg-amber-500/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate font-semibold text-foreground">{selected?.name ?? "Select mission"}</span>
        {selected?.client && (
          <span className="hidden truncate text-[11px] text-muted-foreground lg:inline">· {selected.client}</span>
        )}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-amber-400" />
      </button>
      {open && (
        <div className="modal-surface absolute left-1/2 top-9 z-50 w-72 -translate-x-1/2 p-1 text-sm">
          {missions.map((m) => (
            <button
              key={m.id}
              onClick={() => { onPick(m.id); setOpen(false); }}
              className={`flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-surface-hover ${
                m.id === selected?.id ? "bg-surface-hover" : ""
              }`}
            >
              <span className="text-sm font-medium">{m.name}</span>
              <span className="text-[11px] text-muted-foreground">{m.client}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────── Sidebar ────────── */

function AdminSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const selectedMissionId = useSelectedAdminMission();
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <SectionHeader>Mission</SectionHeader>
        <SidebarItem to="/admin" path={path} icon={<LayoutGrid size={15} strokeWidth={1.5} />} exact>Missions</SidebarItem>
        {selectedMissionId ? (
          <Link
            to="/admin/missions/$missionId/setup"
            params={{ missionId: selectedMissionId }}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              path.startsWith("/admin/missions/") && path.endsWith("/setup")
                ? "bg-surface-hover text-foreground"
                : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            <ClipboardCheck size={15} strokeWidth={1.5} />
            <span className="flex-1 truncate">Setup Record</span>
          </Link>
        ) : (
          <div
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground/50 cursor-not-allowed"
            title="Select a mission above to open its setup record"
          >
            <ClipboardCheck size={15} strokeWidth={1.5} />
            <span className="flex-1 truncate">Setup Record</span>
          </div>
        )}

        <IntelligenceSectionHeader />
        <IrisSidebarItem to="/admin/intel-engine" path={path} icon={<Brain size={15} strokeWidth={1.5} />} pulse>Intel Engine</IrisSidebarItem>
        <SidebarItem to="/admin/comparables" path={path} icon={<Globe size={15} strokeWidth={1.5} />}>State Comparables</SidebarItem>
        <SidebarItem to="/admin/intel-drift" path={path} icon={<TrendingUp size={15} strokeWidth={1.5} />}>Intel Drift</SidebarItem>
        <SidebarItem to="/admin/discovery-history" path={path} icon={<Compass size={15} strokeWidth={1.5} />}>Discovery History</SidebarItem>
        <SidebarItem to="/admin/review-queue" path={path} icon={<Inbox size={15} strokeWidth={1.5} />}>Review Queue</SidebarItem>
        <SidebarItem to="/admin/status-report" path={path} icon={<ClipboardCheck size={15} strokeWidth={1.5} />}>Status Report</SidebarItem>
        <SidebarItem to="/admin/score-me" path={path} icon={<Gauge size={15} strokeWidth={1.5} />}>Score-Me Lab</SidebarItem>

        <SectionHeader withDivider>Platform</SectionHeader>
        <SidebarItem to="/admin/firm-health" path={path} icon={<Activity size={15} strokeWidth={1.5} />}>Firm Health</SidebarItem>
        <SidebarItem to="/admin/admins" path={path} icon={<UserCog size={15} strokeWidth={1.5} />}>Admins</SidebarItem>
        <SidebarItem to="/admin/invites" path={path} icon={<UserPlus size={15} strokeWidth={1.5} />}>Invites</SidebarItem>
        <SidebarItem to="/admin/users" path={path} icon={<UserCog size={15} strokeWidth={1.5} />}>Users</SidebarItem>
        <SidebarItem to="/admin/brief-room" path={path} icon={<Megaphone size={15} strokeWidth={1.5} />}>Send Briefing</SidebarItem>

        <SectionHeader withDivider>Security</SectionHeader>
        <SidebarItem to="/admin/audit" path={path} icon={<History size={15} strokeWidth={1.5} />}>Audit Log</SidebarItem>
        <SidebarItem to="/admin/conflicts" path={path} icon={<ShieldAlert size={15} strokeWidth={1.5} />}>Conflicts</SidebarItem>
        <SidebarItem to="/admin/phi-log" path={path} icon={<ShieldAlert size={15} strokeWidth={1.5} />}>PHI Rejection Log</SidebarItem>
        <SidebarItem to="/admin/right-to-deletion" path={path} icon={<UserMinus size={15} strokeWidth={1.5} />}>Right-to-Deletion</SidebarItem>
        <SidebarItem to="/admin/incident-response" path={path} icon={<ShieldAlert size={15} strokeWidth={1.5} />}>Incident Response Plan</SidebarItem>
      </nav>
    </aside>
  );
}

function SectionHeader({ children, withDivider }: { children: ReactNode; withDivider?: boolean }) {
  return (
    <div
      className={`text-muted-foreground ${withDivider ? "border-t border-border/60 mt-3 pt-3" : ""}`}
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
        textTransform: "uppercase", padding: withDivider ? "12px 16px 4px" : "16px 16px 4px", marginTop: withDivider ? 12 : 8,
      }}
    >
      {children}
    </div>
  );
}

function IntelligenceSectionHeader() {
  return (
    <div
      className="flex items-center gap-2 border-t border-border/60 mt-3"
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
        textTransform: "uppercase", padding: "16px 16px 4px", marginTop: 12,
        color: "var(--iris, #22d3ee)",
      }}
    >
      <span
        className="iris-pulse-dot"
        style={{ width: 6, height: 6, borderRadius: 999, background: "var(--iris, #22d3ee)" }}
      />
      <span>Oracle</span>
      <span className="ml-auto text-[9px] font-normal tracking-[0.15em] text-muted-foreground normal-case">
        Intelligence
      </span>
    </div>
  );
}

function SidebarItem({ to, path, icon, children, exact }: {
  to: string; path: string; icon: ReactNode; children: ReactNode; exact?: boolean;
}) {
  const active = exact ? path === to : path === to || path.startsWith(to + "/");
  return (
    <Link
      to={to as any}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
    </Link>
  );
}

function IrisSidebarItem({ to, path, icon, children, pulse, badge }: {
  to: string; path: string; icon: ReactNode; children: ReactNode; pulse?: boolean; badge?: ReactNode;
}) {
  const active = path === to || path.startsWith(to + "/");
  return (
    <Link
      to={to as any}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors"
      style={{
        color: active ? "var(--iris, #22d3ee)" : "var(--text-muted, hsl(var(--muted-foreground)))",
        background: active ? "color-mix(in oklab, var(--iris, #22d3ee) 10%, transparent)" : "transparent",
      }}
    >
      {pulse && (
        <span
          className="iris-pulse-dot"
          style={{ width: 6, height: 6, borderRadius: 999, background: "var(--iris, #22d3ee)" }}
        />
      )}
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {badge}
    </Link>
  );
}


/** Hook for child routes to read the currently selected admin mission. */
export function useSelectedAdminMission() {
  const [id, setId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_KEY) : null,
  );
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") setId(detail);
    }
    window.addEventListener("admin:mission-changed", onChange);
    return () => window.removeEventListener("admin:mission-changed", onChange);
  }, []);
  return id;
}
