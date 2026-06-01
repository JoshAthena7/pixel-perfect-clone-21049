import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useRouterState, useParams } from "@tanstack/react-router";
import {
  Building2, Target, Crown, Eye, Activity, GitMerge, BarChart2, Clock, Radio,
  LayoutDashboard, PenTool, Archive, Sparkles, Settings2,
  ChevronLeft, LogOut, User,
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

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const inMission = path.startsWith("/missions/") && !!params.missionId;
  const isStudio = inMission && path.includes("/questions/") && path.split("/").length > 5;
  const isAtrium = path === "/home";

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <KeyboardShortcuts />
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        {inMission ? <MissionNav missionId={params.missionId!} /> : <GlobalNav currentPath={path} />}
      </aside>
      <main className={`flex-1 min-w-0 flex flex-col ${isAtrium ? "atrium-grid" : ""}`}>
        {!isStudio && (
          <header className="flex h-[52px] shrink-0 items-center justify-end gap-3 border-b border-border bg-surface/40 px-4">
            <IrisStatusIndicator />
            <NotificationBell />
            <UserAvatarMenu />
          </header>
        )}
        {inMission && !isStudio && <Breadcrumbs />}
        {/* DESIGN-2: page transition wrapper keyed on route */}
        <div key={path} className="route-fade flex-1 min-w-0">{children}</div>
      </main>
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

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <Section label="The Atrium">
          <NavItem to="/home" icon={<Building2 size={16} strokeWidth={1.5} />} active={currentPath === "/home"}>The Atrium</NavItem>
        </Section>

        <Section label="Missions">
          {missions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">You'll be assigned to a mission when work begins. Check back soon.</div>
          )}
          {missions.map((m) => {
            const score = scoreMap.get(m.id) ?? 0;
            const days = m.submission_date
              ? Math.ceil((new Date(m.submission_date).getTime() - Date.now()) / 86400000)
              : null;
            return (
              <NavItem
                key={m.id}
                to="/missions/$missionId/overview"
                params={{ missionId: m.id }}
                active={currentPath.startsWith(`/missions/${m.id}`)}
              >
                <Target size={14} strokeWidth={1.5} className="mr-1.5 text-muted-foreground shrink-0" />
                <span className={`dot dot-${m.health.toLowerCase()} mr-2`} />
                <span className="truncate flex-1">{m.name}</span>
                {days !== null && (
                  <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">{days}d</span>
                )}
                {score > 0 && (
                  <span
                    className={`ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                      score >= 50 ? "bg-destructive/20 text-destructive" :
                      score >= 20 ? "bg-amber-500/20 text-amber-400" :
                      "bg-primary/15 text-primary"
                    }`}
                    title={`Leadership Attention Score: ${score}`}
                  >
                    {score}
                  </span>
                )}
              </NavItem>
            );
          })}
        </Section>


        <Section label="The Bridge">
          <NavItem to="/command/question-health" icon={<Activity size={14} strokeWidth={1.5} />} active={currentPath === "/command/question-health"}>Question Health</NavItem>
          <NavItem to="/command/alignment" icon={<GitMerge size={14} strokeWidth={1.5} />} active={currentPath === "/command/alignment"}>Alignment Conflicts</NavItem>
          <NavItem to="/command/scores" icon={<BarChart2 size={14} strokeWidth={1.5} />} active={currentPath === "/command/scores"}>Score Dashboard</NavItem>
          <NavItem to="/command/pens-down" icon={<Clock size={14} strokeWidth={1.5} />} active={currentPath === "/command/pens-down"}>Pens Down Watch</NavItem>
          <NavItem to="/command/broadcasts" icon={<Radio size={14} strokeWidth={1.5} />} active={currentPath === "/command/broadcasts"}>Broadcasts</NavItem>
        </Section>

        {isPrivileged && (
          <Section label="Admin">
            <NavItem to="/olympus" icon={<Crown size={16} strokeWidth={1.5} className="text-[color:var(--athena-gold)]" />} active={currentPath.startsWith("/olympus")}>Olympus</NavItem>
          </Section>
        )}
      </nav>

      <SignOut />
    </div>
  );
}

function MissionNav({ missionId }: { missionId: string }) {
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

  const days = mission?.submission_date
    ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <Link to="/home" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3 w-3" /> All Missions
        </Link>
        {mission && (
          <>
            <div className="flex items-center gap-2">
              <span className={`dot dot-${mission.health.toLowerCase()}`} />
              <span className="text-sm font-semibold truncate">{mission.name}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {mission.client}{days !== null && <> · {days}d</>}
            </div>
          </>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <NavItem to="/missions/$missionId/overview" params={{ missionId }} active={path === `/missions/${missionId}` || path.endsWith("/overview")} icon={<LayoutDashboard size={16} strokeWidth={1.5} />}>Mission Home</NavItem>
        <NavItem to="/missions/$missionId/questions" params={{ missionId }} active={path.startsWith(`/missions/${missionId}/questions`)} icon={<PenTool size={16} strokeWidth={1.5} />}>The Studio</NavItem>
        <NavItem to="/missions/$missionId/library" params={{ missionId }} active={path.endsWith("/library")} icon={<Archive size={16} strokeWidth={1.5} />}>The Vault</NavItem>
        <NavItem to="/missions/$missionId/briefing" params={{ missionId }} active={path.endsWith("/briefing")} icon={<Sparkles size={16} strokeWidth={1.5} />}>The Oracle</NavItem>
        <NavItem to="/missions/$missionId/settings" params={{ missionId }} active={path.endsWith("/settings")} icon={<Settings2 size={16} strokeWidth={1.5} />}>Settings</NavItem>
      </nav>

      <SignOut />
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
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
