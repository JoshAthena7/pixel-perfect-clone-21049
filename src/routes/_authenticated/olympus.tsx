import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  createFileRoute, Outlet, Link, useRouterState, useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, ArrowLeft, ChevronDown, Zap,
  LayoutGrid, Users, FileText, ClipboardCheck, Trophy,
  FolderOpen, Settings as SettingsIcon, UserCog, History,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/olympus")({
  component: OlympusLayout,
});

type Mission = { id: string; name: string; client: string };

const SELECTED_KEY = "olympus:mission";

function OlympusLayout() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["olympus-access"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ok: false as const, isAdmin: false, isLead: false };
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("user_id", user.id);
      const roles = (data ?? []).map((r: any) => r.role);
      const isAdmin = roles.includes("admin");
      const isLead = roles.includes("lead");
      const ok = isAdmin || isLead || roles.length === 0; // first-time escape hatch
      return { ok, isAdmin: isAdmin || roles.length === 0, isLead };
    },
  });

  if (meLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading Olympus…</div>;
  }

  if (!me?.ok) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16 text-center">
        <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Olympus</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Olympus is restricted to mission admins and engagement leads.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)] w-full">
      <OlympusSidebar isAdmin={me.isAdmin} />
      <div className="flex-1 min-w-0 flex flex-col">
        <OlympusHeader />
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

/* ────────── Header with mission switcher ────────── */

function OlympusHeader() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_KEY) : null,
  );

  const { data: missions = [] } = useQuery({
    queryKey: ["olympus-header-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client")
        .order("created_at", { ascending: false });
      return (data ?? []) as Mission[];
    },
  });

  // Auto-pick the first mission if none selected yet
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
    window.dispatchEvent(new CustomEvent("olympus:mission-changed", { detail: id }));
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/40 px-5">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-[color:var(--athena-gold)]" />
        <span className="text-[12px] font-extrabold uppercase tracking-[0.32em]">Olympus</span>
        <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Atlas Administration</span>
      </div>


      <MissionSwitcher missions={missions} selected={selected} onPick={pick} />

      <button
        onClick={() => {
          if (selected) navigate({ to: "/missions/$missionId/overview", params: { missionId: selected.id } });
          else navigate({ to: "/home" });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover"
      >
        <ArrowLeft className="h-3 w-3" /> Back to Mission
      </button>
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
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-surface-hover"
      >
        <span className="font-medium">{selected?.name ?? "Select mission"}</span>
        {selected?.client && <span className="text-[11px] text-muted-foreground">· {selected.client}</span>}
        <ChevronDown className="h-3 w-3 opacity-60" />
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

function OlympusSidebar({ isAdmin }: { isAdmin: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Admin</div>
        <div className="mt-1 text-sm font-semibold">Workspace</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <SidebarItem to="/olympus" path={path} icon={<LayoutGrid size={15} strokeWidth={1.5} />} exact>Missions</SidebarItem>
        <SidebarItem to="/olympus/team" path={path} icon={<Users size={15} strokeWidth={1.5} />}>Team</SidebarItem>
        <SidebarItem to="/olympus/questions" path={path} icon={<FileText size={15} strokeWidth={1.5} />}>Questions</SidebarItem>
        <SidebarItem to="/olympus/gates" path={path} icon={<ClipboardCheck size={15} strokeWidth={1.5} />}>Gates</SidebarItem>
        <SidebarItem to="/olympus/win-themes" path={path} icon={<Trophy size={15} strokeWidth={1.5} />}>Win Themes</SidebarItem>
        <SidebarItem to="/olympus/vault" path={path} icon={<FolderOpen size={15} strokeWidth={1.5} />}>Vault · Documents</SidebarItem>
        <SidebarItem to="/olympus/settings" path={path} icon={<SettingsIcon size={15} strokeWidth={1.5} />}>Settings</SidebarItem>

        {isAdmin && (
          <>
            <div className="my-3 border-t border-border" />
            <SidebarItem to="/olympus/users" path={path} icon={<UserCog size={15} strokeWidth={1.5} />}>Users</SidebarItem>
            <SidebarItem to="/olympus/audit" path={path} icon={<History size={15} strokeWidth={1.5} />}>Audit Log</SidebarItem>
          </>
        )}
      </nav>
    </aside>
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

/** Hook for child routes to read the currently selected mission. */
export function useSelectedOlympusMission() {
  const [id, setId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_KEY) : null,
  );
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") setId(detail);
    }
    window.addEventListener("olympus:mission-changed", onChange);
    return () => window.removeEventListener("olympus:mission-changed", onChange);
  }, []);
  return id;
}
