import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  createFileRoute, Outlet, Link, useRouterState, useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, ChevronDown, Zap,
  LayoutGrid, Users, FileText, ClipboardCheck, Trophy,
  FolderOpen, Settings as SettingsIcon, UserCog, History, Brain,
  Search, Inbox, Library, BookOpen, Bell, LifeBuoy, UserPlus, Activity,
  ShieldAlert, UserMinus, ExternalLink, AlertTriangle, Megaphone,
} from "lucide-react";

import { useServerFn } from "@tanstack/react-start";
import { listReviewQueue } from "@/lib/atlas-onboarding.functions";
import { useIsAdmin } from "@/hooks/useAccess";
import { NotAvailable } from "@/components/access/NotAvailable";
import { TestIrisVoiceButton } from "@/components/iris/TestIrisVoiceButton";

export const Route = createFileRoute("/_authenticated/olympus")({
  component: OlympusLayout,
});

type Mission = { id: string; name: string; client: string };

const SELECTED_KEY = "olympus:mission";

function OlympusLayout() {
  // Per the Permissions spec: Olympus is admin-only. Non-admins see "not available"
  // — no greyed-out content, no error page, no role hints.
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!isAdmin) {
    return <NotAvailable kind="olympus" />;
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)] w-full">
      <OlympusSidebar isAdmin={isAdmin} />
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

      <div className="flex items-center gap-2">
        <TestIrisVoiceButton />
        <button
          onClick={() => {
            if (selected) navigate({ to: "/missions/$missionId/overview", params: { missionId: selected.id } });
            else navigate({ to: "/home" });
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Mission
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
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <SectionHeader>Mission</SectionHeader>
        <SidebarItem to="/olympus" path={path} icon={<LayoutGrid size={15} strokeWidth={1.5} />} exact>Missions</SidebarItem>
        <SidebarItem to="/olympus/team" path={path} icon={<Users size={15} strokeWidth={1.5} />}>Team</SidebarItem>
        <SidebarItem to="/olympus/questions" path={path} icon={<FileText size={15} strokeWidth={1.5} />}>Questions</SidebarItem>
        <SidebarItem to="/olympus/gates" path={path} icon={<ClipboardCheck size={15} strokeWidth={1.5} />}>Gates</SidebarItem>
        <SidebarItem to="/olympus/win-themes" path={path} icon={<Trophy size={15} strokeWidth={1.5} />}>Win Themes</SidebarItem>
        <SidebarItem to="/olympus/sensitivities" path={path} icon={<AlertTriangle size={15} strokeWidth={1.5} />}>Sensitivities</SidebarItem>
        <SidebarItem to="/olympus/vault" path={path} icon={<FolderOpen size={15} strokeWidth={1.5} />}>Vault</SidebarItem>
        <SidebarItem to="/olympus/settings" path={path} icon={<SettingsIcon size={15} strokeWidth={1.5} />}>Settings</SidebarItem>

        <IntelligenceSectionHeader />
        <IrisSidebarItem to="/olympus/intel-engine" path={path} icon={<Brain size={15} strokeWidth={1.5} />} pulse>Intel Engine</IrisSidebarItem>

        {isAdmin && (
          <>
            <SectionHeader>Platform</SectionHeader>
            <SidebarItem to="/command/health" path={path} icon={<Activity size={15} strokeWidth={1.5} />}>Firm Health</SidebarItem>
            <SidebarItem to="/olympus/admins" path={path} icon={<UserCog size={15} strokeWidth={1.5} />}>Admins</SidebarItem>
            <SidebarItem to="/olympus/invites" path={path} icon={<UserPlus size={15} strokeWidth={1.5} />}>Invites</SidebarItem>

            <SidebarItem to="/olympus/users" path={path} icon={<UserCog size={15} strokeWidth={1.5} />}>Users</SidebarItem>
            <SidebarItem to="/olympus/support" path={path} icon={<LifeBuoy size={15} strokeWidth={1.5} />}>Support Config</SidebarItem>
            <SidebarItem to="/olympus/talent" path={path} icon={<UserPlus size={15} strokeWidth={1.5} />}>Talent Desk</SidebarItem>
            <SidebarItem to="/olympus/notifications" path={path} icon={<Bell size={15} strokeWidth={1.5} />}>Notifications</SidebarItem>
            <SidebarItem to="/olympus/brief-room" path={path} icon={<Megaphone size={15} strokeWidth={1.5} />}>Brief Room</SidebarItem>

            {/* H3: Security section — audit + PHI + IRP link */}
            <SectionHeader>Security</SectionHeader>
            <SidebarItem to="/olympus/audit" path={path} icon={<History size={15} strokeWidth={1.5} />}>Audit Log</SidebarItem>
            <SidebarItem to="/olympus/conflicts" path={path} icon={<ShieldAlert size={15} strokeWidth={1.5} />}>Conflicts</SidebarItem>
            <SidebarItem to="/olympus/phi-log" path={path} icon={<ShieldAlert size={15} strokeWidth={1.5} />}>PHI Rejection Log</SidebarItem>
            <SidebarItem to="/olympus/writer-deletion" path={path} icon={<UserMinus size={15} strokeWidth={1.5} />}>Right-to-Deletion</SidebarItem>
            <a
              href="https://athenacommandcenter.com/security/incident-response"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <ExternalLink size={15} strokeWidth={1.5} />
              <span>Incident Response Plan</span>
            </a>
          </>
        )}

      </nav>
    </aside>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-muted-foreground"
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
        textTransform: "uppercase", padding: "16px 16px 4px", marginTop: 8,
      }}
    >
      {children}
    </div>
  );
}

function IntelligenceSectionHeader() {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
        textTransform: "uppercase", padding: "16px 16px 4px", marginTop: 8,
        color: "var(--iris, #22d3ee)",
      }}
    >
      <span
        className="iris-pulse-dot"
        style={{ width: 6, height: 6, borderRadius: 999, background: "var(--iris, #22d3ee)" }}
      />
      Intelligence
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

function ReviewQueueItem({ path }: { path: string }) {
  const listFn = useServerFn(listReviewQueue);
  const { data } = useQuery({
    queryKey: ["olympus-review-queue-count"],
    queryFn: () => listFn({ data: {} as any }),
    refetchInterval: 30_000,
  });
  const count = data?.sources?.length ?? 0;
  return (
    <IrisSidebarItem
      to="/olympus/review-queue"
      path={path}
      icon={<Inbox size={15} strokeWidth={1.5} />}
      badge={count > 0 ? (
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(245,158,11,0.18)", color: "#f59e0b" }}
        >
          {count}
        </span>
      ) : null}
    >
      Review Queue
    </IrisSidebarItem>
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
