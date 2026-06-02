import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useRouterState, useParams } from "@tanstack/react-router";
import {
  Building2, Target, Mountain, LayoutDashboard, Sparkles, BookOpen, Wrench, Users, History,
  Settings2, ChevronRight, ChevronLeft, LogOut, User, ArrowRight, PenTool,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { toast } from "sonner";

type Mission = { id: string; name: string; client: string; health: "Green" | "Yellow" | "Red"; submission_date: string | null };

import { Breadcrumbs } from "@/components/v2/Breadcrumbs";
import { NotificationBell } from "@/components/v2/NotificationBell";
import { KeyboardShortcuts } from "@/components/v2/KeyboardShortcuts";
import { IrisStatusIndicator } from "@/components/v2/effects";
import { UpdateRealityMount } from "@/components/v2/UpdateRealityModal";

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const inMission = path.startsWith("/missions/") && !!params.missionId;
  const isStudio = inMission && (path.includes("/questions") || path.endsWith("/studio"));
  const isQuestionWorkspace = inMission && path.includes("/questions/") && path.split("/").length > 5;
  const isAtrium = path === "/home";

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <KeyboardShortcuts />
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        {inMission
          ? (isStudio
              ? <StudioRail missionId={params.missionId!} />
              : <MissionRail missionId={params.missionId!} />)
          : <GlobalNav currentPath={path} />}
      </aside>
      <main className={`flex-1 min-w-0 flex flex-col ${isAtrium ? "atrium-grid" : ""}`}>
        {!isQuestionWorkspace && (
          <header className="flex h-[52px] shrink-0 items-center justify-end gap-3 border-b border-border bg-surface/40 px-4">
            <IrisStatusIndicator />
            <NotificationBell />
            <UserAvatarMenu />
          </header>
        )}
        {inMission && !isStudio && <Breadcrumbs />}
        <div key={path} className="route-fade flex-1 min-w-0">{children}</div>
      </main>
      {inMission && params.missionId && <UpdateRealityMount missionId={params.missionId} />}
    </div>
  );
}


function UserAvatarMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery({
    queryKey: ["shell-me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
      const name = data?.display_name?.trim() || data?.email?.split("@")[0] || user.email?.split("@")[0] || "?";
      return { name, email: data?.email ?? user.email ?? "" };
    },
  });

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const initials = (profile?.name ?? "?")
    .split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary hover:bg-primary/25 transition-colors"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <div className="modal-surface absolute right-0 top-10 z-50 w-56 p-1 text-sm">
          <div className="border-b border-border px-3 py-2.5">
            <div className="truncate text-sm font-medium">{profile?.name}</div>
            <div className="truncate text-xs text-muted-foreground">{profile?.email}</div>
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4" /> Profile
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}



function GlobalNav({ currentPath }: { currentPath: string }) {
  const { data: missions = [] } = useQuery({
    queryKey: ["sidebar-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,health,submission_date")
        .eq("status", "Active")
        .order("created_at", { ascending: false });
      return (data ?? []) as Mission[];
    },
  });

  const { data: isPrivileged = false } = useQuery({
    queryKey: ["sidebar-is-privileged"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase.from("mission_members").select("role").eq("user_id", user.id);
      const roles = (data ?? []).map((r: any) => r.role);
      // Show Olympus to admins/leads OR to any signed-in user with zero mission memberships
      // (first-time admin needs the door in to create the first mission).
      return roles.includes("admin") || roles.includes("lead") || roles.length === 0;
    },
  });

  const attentionFn = useServerFn(irisLeadershipAttention);
  const { data: attention } = useQuery({
    queryKey: ["leadership-attention"],
    queryFn: () => attentionFn(),
    refetchInterval: 60_000,
  });
  const scoreMap = new Map((attention?.missions ?? []).map((m) => [m.mission_id, m.attention_score]));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <img src="/athena-mark-white.png" alt="Athena" className="h-8 w-8 object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-foreground/95">Athena</div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[color:var(--athena-gold)]">Command</div>
          </div>
          <AttentionBadge variant="compact" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <Section label="The Atrium">
          <NavItem to="/home" icon={<Building2 size={16} strokeWidth={1.5} />} active={currentPath === "/home"}>The Atrium</NavItem>
        </Section>

        <Section label="Missions" zone="missions" expandable>
          {missions.length === 0 ? (
            <div className="nav-empty-inset">You'll be assigned to a mission when work begins. Check back soon.</div>
          ) : (
            missions.map((m) => {
              const score = scoreMap.get(m.id) ?? 0;
              const days = m.submission_date
                ? Math.ceil((new Date(m.submission_date).getTime() - Date.now()) / 86400000)
                : null;
              const isActive = currentPath.startsWith(`/missions/${m.id}`);
              return (
                <Link
                  key={m.id}
                  to="/missions/$missionId/overview"
                  params={{ missionId: m.id }}
                  className={`nav-mission-item ${isActive ? "is-active" : ""}`}
                >
                  <Target size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
                  <span className={`dot dot-${m.health.toLowerCase()}`} />
                  <span className="truncate flex-1">{m.name}</span>
                  {days !== null && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{days}d</span>
                  )}
                  {score > 0 && (
                    <span
                      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                        score >= 50 ? "bg-destructive/20 text-destructive" :
                        score >= 20 ? "bg-amber-500/20 text-amber-400" :
                        "bg-primary/15 text-primary"
                      }`}
                      title={`Leadership Attention Score: ${score}`}
                    >
                      {score}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </Section>

        {isPrivileged && (
          <Section label="Admin" zone="admin">
            <NavItem to="/olympus" icon={<Mountain size={16} strokeWidth={1.5} className="text-[color:var(--athena-gold)]" />} active={currentPath.startsWith("/olympus")}>Olympus</NavItem>
          </Section>
        )}
      </nav>

      <SignOut />
    </div>
  );
}

function MissionRail({ missionId }: { missionId: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: mission } = useQuery({
    queryKey: ["mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,health,submission_date")
        .eq("id", missionId)
        .maybeSingle();
      return data as Mission | null;
    },
  });

  const sections = [
    { to: "/missions/$missionId/overview", label: "Overview", icon: <LayoutDashboard size={16} strokeWidth={1.5} />, match: ["/overview"] },
    { to: "/missions/$missionId/intelligence", label: "Intelligence", icon: <Sparkles size={16} strokeWidth={1.5} className="text-[color:var(--iris,#22d3ee)]" />, match: ["/intelligence", "/library", "/briefing", "/brief", "/iris"] },
    { to: "/missions/$missionId/operations", label: "Operations", icon: <Wrench size={16} strokeWidth={1.5} />, match: ["/operations"] },
    { to: "/missions/$missionId/team", label: "Team", icon: <Users size={16} strokeWidth={1.5} />, match: ["/team"] },
    { to: "/missions/$missionId/activity", label: "Activity", icon: <History size={16} strokeWidth={1.5} />, match: ["/activity"] },
  ] as const;

  const tail = path.replace(`/missions/${missionId}`, "");
  const isActive = (matches: readonly string[]) => {
    if (tail === "" && matches.includes("/overview")) return true;
    return matches.some((m) => tail === m || tail.startsWith(`${m}/`));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <Link to="/home" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3 w-3" /> All Missions
        </Link>
        {mission && (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[color:var(--athena-gold)]">⚡</span>
              <span className="text-sm font-semibold truncate">{mission.name}</span>
            </div>
            {mission.client && (
              <div className="mt-0.5 ml-5 text-[11px] text-muted-foreground truncate">{mission.client}</div>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {sections.map((s) => (
          <NavItem
            key={s.to}
            to={s.to}
            params={{ missionId }}
            icon={s.icon}
            active={isActive(s.match)}
          >
            {s.label}
          </NavItem>
        ))}

        <div className="my-3 border-t border-border" />

        <Link
          to="/missions/$missionId/questions"
          params={{ missionId }}
          className="flex items-center justify-between gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <span className="inline-flex items-center gap-2">
            <PenTool size={16} strokeWidth={1.75} /> Studio
          </span>
          <ArrowRight size={16} strokeWidth={1.75} />
        </Link>
      </nav>

      <div className="border-t border-border p-3 flex items-center justify-between">
        <Link
          to="/missions/$missionId/settings"
          params={{ missionId }}
          aria-label="Mission settings"
          title="Mission settings"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground ${
            path.endsWith("/settings") ? "bg-surface-hover text-foreground" : ""
          }`}
        >
          <Settings2 size={16} strokeWidth={1.5} />
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}

function StudioRail({ missionId }: { missionId: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: mission } = useQuery({
    queryKey: ["mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client")
        .eq("id", missionId)
        .maybeSingle();
      return data as Mission | null;
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        {mission && (
          <div className="flex items-center gap-2">
            <span className="text-[color:var(--athena-gold)]">⚡</span>
            <span className="text-sm font-semibold truncate">{mission.name}</span>
          </div>
        )}
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Studio</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <NavItem
          to="/missions/$missionId/questions"
          params={{ missionId }}
          icon={<PenTool size={16} strokeWidth={1.5} />}
          active={path.endsWith("/questions") || path.includes("/questions/")}
        >
          My Questions
        </NavItem>

        <div className="my-3 border-t border-border" />

        <Link
          to="/missions/$missionId/overview"
          params={{ missionId }}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.5} /> Mission
        </Link>
      </nav>

      <div className="border-t border-border p-3 flex items-center justify-between">
        <Link
          to="/missions/$missionId/settings"
          params={{ missionId }}
          aria-label="Mission settings"
          title="Mission settings"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground ${
            path.endsWith("/settings") ? "bg-surface-hover text-foreground" : ""
          }`}
        >
          <Settings2 size={16} strokeWidth={1.5} />
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}

function SignOutButton() {
  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
  }
  return (
    <button
      onClick={signOut}
      aria-label="Sign out"
      title="Sign out"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}

function Section({
  label, children, zone, expandable, leadingIcon,
}: {
  label: string; children: ReactNode;
  zone?: "missions" | "bridge" | "admin";
  expandable?: boolean;
  leadingIcon?: ReactNode;
}) {
  const zoneCls =
    zone === "missions" ? "nav-zone-missions" :
    zone === "bridge" ? "nav-zone-bridge" :
    zone === "admin" ? "nav-zone-admin" : "";
  return (
    <div className={zoneCls}>
      <div className="nav-section-label">
        {leadingIcon}
        <span className="flex-1">{label}</span>
        {expandable && <ChevronRight size={10} strokeWidth={1.5} className="text-muted-foreground/60" />}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({ to, params, icon, active, children }: { to: string; params?: Record<string, string>; icon?: ReactNode; active?: boolean; children: ReactNode }) {
  return (
    <Link
      to={to as any}
      params={params as any}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {icon}
      <span className="flex-1 truncate flex items-center">{children}</span>
    </Link>
  );
}


function SignOut() {
  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
  }
  return (
    <div className="border-t border-border p-3">
      <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
