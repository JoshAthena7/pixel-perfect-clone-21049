import { type ReactNode } from "react";
import { Link, useRouterState, useParams } from "@tanstack/react-router";
import {
  Home, ListChecks, AlertTriangle, BarChart3, Clock, Megaphone, LogOut,
  ChevronLeft, LayoutDashboard, FolderOpen, BookOpen, Sparkles, Settings,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { toast } from "sonner";

type Mission = { id: string; name: string; client: string; health: "Green" | "Yellow" | "Red"; submission_date: string | null };

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const inMission = path.startsWith("/missions/") && params.missionId;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        {inMission ? <MissionNav missionId={params.missionId!} /> : <GlobalNav currentPath={path} />}
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
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
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-sm font-bold text-primary">Ā</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Athena</div>
            <div className="text-sm font-semibold tracking-wide">Command V2</div>
          </div>
          <AttentionBadge variant="compact" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <Section label="The Atrium">
          <NavItem to="/home" icon={<Home className="h-4 w-4" />} active={currentPath === "/home"}>The Atrium</NavItem>
        </Section>

        <Section label="Missions">
          {missions.map((m) => {
            const score = scoreMap.get(m.id) ?? 0;
            return (
              <NavItem
                key={m.id}
                to="/missions/$missionId/overview"
                params={{ missionId: m.id }}
                active={currentPath.startsWith(`/missions/${m.id}`)}
              >
                <span className={`dot dot-${m.health.toLowerCase()} mr-2`} />
                <span className="truncate flex-1">{m.name}</span>
                {score > 0 && (
                  <span
                    className={`ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
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
          <NavItem to="/command/question-health" icon={<ListChecks className="h-4 w-4" />} active={currentPath === "/command/question-health"}>Question Health</NavItem>
          <NavItem to="/command/alignment" icon={<AlertTriangle className="h-4 w-4" />} active={currentPath === "/command/alignment"}>Alignment Conflicts</NavItem>
          <NavItem to="/command/scores" icon={<BarChart3 className="h-4 w-4" />} active={currentPath === "/command/scores"}>Score Dashboard</NavItem>
          <NavItem to="/command/pens-down" icon={<Clock className="h-4 w-4" />} active={currentPath === "/command/pens-down"}>Pens Down Watch</NavItem>
          <NavItem to="/command/broadcasts" icon={<Megaphone className="h-4 w-4" />} active={currentPath === "/command/broadcasts"}>Broadcasts</NavItem>
        </Section>
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
        <NavItem to="/missions/$missionId/overview" params={{ missionId }} active={path.endsWith("/overview")} icon={<LayoutDashboard className="h-4 w-4" />}>Overview</NavItem>
        <NavItem to="/missions/$missionId" params={{ missionId }} active={path === `/missions/${missionId}` || path.startsWith(`/missions/${missionId}/questions`)} icon={<ListChecks className="h-4 w-4" />}>Mission Studio</NavItem>
        <NavItem to="/missions/$missionId/library" params={{ missionId }} active={path.endsWith("/library")} icon={<FolderOpen className="h-4 w-4" />}>Library</NavItem>
        <NavItem to="/missions/$missionId/briefing" params={{ missionId }} active={path.endsWith("/briefing")} icon={<BookOpen className="h-4 w-4" />}>Briefing Book</NavItem>
        <NavItem to="/missions/$missionId/brief" params={{ missionId }} active={path.endsWith("/brief")} icon={<Sparkles className="h-4 w-4" />}>IRIS Mission Brief</NavItem>
        <NavItem to="/missions/$missionId/settings" params={{ missionId }} active={path.endsWith("/settings")} icon={<Settings className="h-4 w-4" />}>Settings</NavItem>
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
