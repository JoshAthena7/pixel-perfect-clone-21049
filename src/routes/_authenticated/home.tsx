import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { generateLobbyBrief } from "@/lib/iris-lobby-brief.functions";
import { irisAskGlobal } from "@/lib/iris-ask.functions";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { relativeTime } from "@/lib/signals";
import { MissionGridSkeleton, QuestionListSkeleton } from "@/components/v2/Skeletons";
import { ArrowRight, Megaphone, CalendarClock, DoorOpen, ClipboardList, Search, Globe, Sparkles, Mountain, ChevronDown, ChevronRight, RefreshCw, Rocket } from "lucide-react";
import { HORIZON_FILTERS, inferCategory, matchesHorizonFilter, type IntelItem } from "@/lib/intelligence-feed";
import { LiveBadge, ScanningBeam, IrisWaveform, TypewriterText } from "@/components/v2/effects";
import { Constellation, AnimatedNumber } from "@/components/v2/polish";
import { MissionProgressRing } from "@/components/MissionProgressRing";
import athenaLogo from "@/assets/athena-logo.png";
import atlasLogo from "@/assets/atlas-wordmark-optical.png";
import athenaMark from "@/assets/athena-mark-v3.png.asset.json";
// LegacyRecord temporarily removed
import { DailyPulse } from "@/components/v4/DailyPulse";
import { IrisTrustIntro } from "@/components/v4/IrisTrustIntro";
import { RecentChangesCard } from "@/components/v4/RecentChangesCard";
import { ExpertiseTagsCard } from "@/components/v4/ExpertiseTagsCard";
import { useIsAdmin } from "@/hooks/useAccess";
import type { ReactNode } from "react";
import {
  PortfolioStatusStrip,
  AttentionPanel,
  DueThisWeek,
  MorningBriefing,
  MissionFilterBar,
  sortAndFilterMissions,
  type MissionSort,
  type BriefItem,
} from "@/components/v2/AtriumCommandCenter";
import { IrisPersonalAlert } from "@/components/v2/IrisPersonalAlert";
import { GuidedTour, type TourStep } from "@/components/v2/GuidedTour";
import { getLoginRouting } from "@/lib/routing.functions";
import { DEFAULT_SORT_BY_ROLE, type RoutingRole } from "@/lib/routing-role";




const IRIS_SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==";

function primeIrisVoiceBeforeOnboarding() {
  const win = window as Window & { __irisVoiceAudio?: HTMLAudioElement; __irisVoicePrimed?: boolean };
  if (win.__irisVoicePrimed) return;
  const audio = win.__irisVoiceAudio ?? new Audio(IRIS_SILENT_WAV);
  audio.preload = "auto";
  audio.loop = true;
  win.__irisVoiceAudio = audio;
  void audio.play().then(
    () => {
      win.__irisVoicePrimed = true;
    },
    () => undefined,
  );
}



export const Route = createFileRoute("/_authenticated/home")({
  component: AthenaHQ,
});


function EmptyState({ icon, title, subtitle, cta }: { icon: ReactNode; title: string; subtitle?: string; cta?: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-dashed border-border bg-surface/40 py-12 text-center">
      <div
        className="mx-auto"
        style={{ maxWidth: 320, padding: "0 24px" }}
      >
        <div
          className="mx-auto mb-4 flex h-10 w-10 items-center justify-center text-muted-foreground"
          style={{ opacity: 0.4 }}
        >
          {icon}
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 8, lineHeight: 1.4 }}>
          {title}
        </p>
        {subtitle && (
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{subtitle}</p>
        )}
        {cta && <div className="mt-5">{cta}</div>}
      </div>
    </div>
  );
}

type Mission = {
  id: string;
  name: string;
  client: string;
  state: string | null;
  health: "Green" | "Yellow" | "Red";
  status: string | null;
  submission_date: string | null;
  question_count: number | null;
};


const HEALTH_BORDER: Record<string, string> = {
  Green: "border-l-emerald-500",
  Yellow: "border-l-amber-400",
  Red: "border-l-destructive",
};
const HEALTH_GLOW: Record<string, string> = {
  Green: "hover:shadow-[0_8px_24px_rgba(34,197,94,0.15)]",
  Yellow: "hover:shadow-[0_8px_24px_rgba(245,158,11,0.15)]",
  Red: "hover:shadow-[0_8px_24px_rgba(239,68,68,0.15)]",
};
const HEALTH_PILL: Record<string, string> = {
  Green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Red: "bg-destructive/15 text-destructive border-destructive/30",
};

function AthenaHQ() {
  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from("profiles").select("display_name,email").eq("id", user!.id).maybeSingle();
      const raw = data?.display_name?.trim() || data?.email?.split("@")[0] || user?.email?.split("@")[0] || "operator";
      // L-3: capitalize first letter of greeting name.
      const head = raw.split(/\s+/)[0];
      const firstName = head.charAt(0).toUpperCase() + head.slice(1);
      return { name: firstName };
    },
  });

  const { data: myRole, isLoading: roleLoading } = useQuery({
    queryKey: ["my-mission-roles"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from("mission_members").select("role").eq("user_id", user!.id);
      const roles = (data ?? []).map((r: any) => r.role);
      if (roles.includes("admin")) return "admin";
      if (roles.includes("lead")) return "lead";
      if (roles.length > 0) return roles[0];
      return null;
    },
  });
  const isLeader = myRole === "admin" || myRole === "lead";
  const { isAdmin } = useIsAdmin();


  // CHANGE 5: Writers with exactly one active mission skip the Lobby.
  const navigate = useNavigate();
  const { data: writerMissions } = useQuery({
    queryKey: ["writer-active-missions", myRole],
    enabled: myRole === "writer",
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as string[];
      const { data } = await supabase
        .from("mission_members")
        .select("mission_id, missions!inner(status)")
        .eq("user_id", user.id)
        .eq("role", "writer")
        .eq("missions.status", "Active");
      return Array.from(new Set((data ?? []).map((r: any) => r.mission_id))) as string[];
    },
  });
  useEffect(() => {
    if (myRole === "writer" && writerMissions && writerMissions.length === 1) {
      navigate({
        to: "/missions/$missionId/sections",
        params: { missionId: writerMissions[0] },
        replace: true,
      });
    }
  }, [myRole, writerMissions, navigate]);



  const { data: missions = [], isLoading: missionsLoading } = useQuery({
    queryKey: ["hq-missions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as Mission[];
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,health,status,submission_date,question_count,mission_members!inner(user_id)")
        .eq("status", "Active")
        .eq("mission_members.user_id", user.id)
        .order("submission_date", { ascending: true, nullsFirst: false });
      return (data ?? []) as Mission[];
    },
  });


  // ARCH-1: Writer/SME assignments across all missions
  const { data: myAssignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["hq-my-assignments", myRole],
    enabled: myRole !== null,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,status,health,current_score,pens_down_date,assigned_writer_id,assigned_sme_id")
        .or(`assigned_writer_id.eq.${user.id},assigned_sme_id.eq.${user.id}`)
        .order("pens_down_date", { ascending: true, nullsFirst: false })
        .limit(50);
      return (data ?? []) as Array<{
        id: string; mission_id: string; question_number: string; title: string;
        status: string | null; health: string | null; current_score: number | null;
        pens_down_date: string | null; assigned_writer_id: string | null; assigned_sme_id: string | null;
      }>;
    },
  });


  const missionIds = missions.map((m) => m.id);

  // PHASE 7: per-mission questions (for next deadline + computed health)
  const { data: missionQuestions = [] } = useQuery({
    queryKey: ["hq-mission-questions", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,pens_down_date,health,status")
        .in("mission_id", missionIds);
      return (data ?? []) as Array<{ id: string; mission_id: string; question_number: string; title: string; pens_down_date: string | null; health: string | null; status: string | null }>;
    },
  });

  // PHASE 7: latest signal/collab per mission
  const { data: lastSignalByMission = {} } = useQuery({
    queryKey: ["hq-last-signal", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const [collabRes, signalRes, realityRes] = await Promise.all([
        supabase.from("question_collaboration").select("mission_id,created_at").in("mission_id", missionIds).order("created_at", { ascending: false }).limit(500),
        supabase.from("signals").select("mission_id,created_at").in("mission_id", missionIds).order("created_at", { ascending: false }).limit(500),
        supabase.from("reality_updates").select("mission_id,created_at").in("mission_id", missionIds).order("created_at", { ascending: false }).limit(500),
      ]);
      const map: Record<string, string> = {};
      for (const row of [...(collabRes.data ?? []), ...(signalRes.data ?? []), ...(realityRes.data ?? [])] as any[]) {
        if (!map[row.mission_id] || new Date(row.created_at) > new Date(map[row.mission_id])) {
          map[row.mission_id] = row.created_at;
        }
      }
      return map;
    },
  });

  // PHASE 7: unresolved "I Need Something" per mission (leaders only)
  const { data: needsByMission = {} } = useQuery({
    queryKey: ["hq-needs", missionIds.join(","), isLeader],
    enabled: isLeader && missionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("reality_updates")
        .select("mission_id")
        .in("mission_id", missionIds)
        .eq("signal_type", "need")
        .eq("resolved", false);
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        counts[row.mission_id] = (counts[row.mission_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const attentionFn = useServerFn(irisLeadershipAttention);
  const { data: attention } = useQuery({
    queryKey: ["leadership-attention"],
    queryFn: () => attentionFn(),
    refetchInterval: 60_000,
    retry: false,
    throwOnError: false,
  });
  const attMap = new Map((attention?.missions ?? []).map((m) => [m.mission_id, m.attention_score]));
  const totalAttention = (attention?.missions ?? []).reduce((s, m) => s + m.attention_score, 0);

  // mission-id → display name (for pills)
  const missionMap = new Map(missions.map((m) => [m.id, m.name]));

  // HORIZON FEED — firm-wide industry intelligence
  const { data: horizonItems = [] } = useQuery({
    queryKey: ["horizon-feed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_intelligence")
        .select("id,source,type,category,title,summary,url,published_at,created_at,matched_mission_ids")
        .eq("feed_type", "industry")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as (IntelItem & { matched_mission_ids?: string[] | null })[];
    },
    refetchInterval: 60_000,
  });

  const { data: leadershipMessages = [] } = useQuery({
    queryKey: ["hq-leadership-messages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("id,text,from_name,created_at")
        .is("mission_id", null)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });


  // PHASE 7: leader shortcut — most recently viewed mission
  const lastViewedMissionId = typeof window !== "undefined" ? sessionStorage.getItem("athena:last-mission") : null;
  const leaderShortcutMissionId = lastViewedMissionId && missions.find((m) => m.id === lastViewedMissionId)
    ? lastViewedMissionId
    : missions[0]?.id;

  // Atrium command-center: filter/sort state
  // Phase 3: role-aware sort default (set once on first mount).
  const getRouting = useServerFn(getLoginRouting);
  const { data: routing } = useQuery({
    queryKey: ["login-routing"],
    queryFn: () => getRouting(),
    staleTime: 5 * 60_000,
  });
  const role: RoutingRole = (routing?.role ?? "none") as RoutingRole;
  const [missionSort, setMissionSort] = useState<MissionSort>("submission");
  const [sortInitialized, setSortInitialized] = useState(false);
  useEffect(() => {
    if (sortInitialized || !routing) return;
    setMissionSort(DEFAULT_SORT_BY_ROLE[role] as MissionSort);
    setSortInitialized(true);
  }, [routing, role, sortInitialized]);
  const [missionHealthFilter, setMissionHealthFilter] = useState<"all" | "red" | "yellow" | "green">("all");
  const [missionSearch, setMissionSearch] = useState("");
  const [tourOpen, setTourOpen] = useState(false);

  // Auto-open the tour on first visit (once per user-agent).
  useEffect(() => {
    try {
      if (!localStorage.getItem("atlas:tour:home:v1")) {
        const t = setTimeout(() => setTourOpen(true), 800);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);




  const filteredMissions = useMemo(
    () =>
      sortAndFilterMissions(
        missions as any,
        missionQuestions as any,
        lastSignalByMission as Record<string, string | null>,
        { sort: missionSort, health: missionHealthFilter, search: missionSearch },
      ),
    [missions, missionQuestions, lastSignalByMission, missionSort, missionHealthFilter, missionSearch],
  );

  // Morning briefing from recent signals
  const briefItems: BriefItem[] = useMemo(() => {
    const items: BriefItem[] = [];
    const seen = new Set<string>();
    const entries = Object.entries(lastSignalByMission as Record<string, string | null>)
      .filter(([, t]) => !!t)
      .sort(([, a], [, b]) => new Date(b!).getTime() - new Date(a!).getTime());
    for (const [mid, t] of entries) {
      if (seen.has(mid)) continue;
      const m = missions.find((x) => x.id === mid);
      if (!m) continue;
      const ageH = (Date.now() - new Date(t!).getTime()) / 3600000;
      if (ageH > 24) continue;
      items.push({
        id: mid,
        missionName: m.name,
        text: `Activity update ${ageH < 1 ? "in the last hour" : `${Math.floor(ageH)}h ago`}`,
      });
      seen.add(mid);
      if (items.length >= 4) break;
    }
    return items;
  }, [lastSignalByMission, missions]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const statusLabel = totalAttention === 0
    ? "All systems operational"
    : `${totalAttention} ${totalAttention === 1 ? "item needs" : "items need"} attention`;

  // Hold the render until we know the user's role (and, for writers, whether
  // they have a single mission to redirect to). Without this gate the full HQ
  // page paints for ~1s before flipping to the welcome page or redirecting,
  // which reads as a "giant flash" on first landing.
  const writerRouteUnresolved = myRole === "writer" && !writerMissions;
  if (roleLoading || writerRouteUnresolved) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-xs uppercase tracking-[0.32em] text-muted-foreground animate-pulse">
          One moment…
        </div>
      </div>
    );
  }

  // PHASE 7 / CHANGE 5: writer with 0 active missions — show only welcome message
  if (myRole === "writer" && writerMissions && writerMissions.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center gap-4 mb-8">
            <img src={athenaMark.url} alt="" aria-hidden draggable={false} className="h-20 w-20 object-contain select-none -my-2" />
            <span className="atlas-gold-dot" aria-hidden />
            <img src={atlasLogo} alt="Atlas" draggable={false} className="h-7 w-auto object-contain select-none" style={{ filter: "brightness(1.1) drop-shadow(0 0 6px rgba(201,168,76,0.25))" }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome to Atlas.</h1>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            You haven't been assigned to a mission yet.<br />
            Your Engagement Lead will add you once your mission is activated.
          </p>
        </div>
      </div>
    );
  }

  // While we're about to redirect a single-mission writer, render nothing
  if (myRole === "writer" && writerMissions && writerMissions.length === 1) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-background">
      <Constellation opacity={0.06} />
      {/* Athena HQ executive header — Atrium as command center */}
      <header className="relative border-b border-border bg-gradient-to-b from-surface to-background" data-tour="athena-hq">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-6 px-8 py-8">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
              ATHENA HQ
            </div>
            <h1 className="h1-display mt-2">
              {greeting}, {profile?.name ?? "…"}.
            </h1>
            <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
              Intelligence · Alignment · Execution
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:border-[color:var(--athena-gold,#f59e0b)]/40 hover:text-foreground transition-colors"
            >
              Take the tour
            </button>
            <button
              type="button"
              data-tour="iris-launch"
              onClick={() => {
                primeIrisVoiceBeforeOnboarding();
                navigate({ to: "/home", search: { "iris-demo": "1" } as never });
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Launch IRIS Demo
            </button>
            <div className="text-right">
              <div className="h2-label">Firm Status</div>
              <div className={`mt-1.5 flex items-center justify-end gap-2 text-sm font-medium ${totalAttention === 0 ? "text-[color:var(--green)]" : totalAttention >= 50 ? "text-destructive" : "text-amber-400"}`}>
                {totalAttention === 0 && <span className="pulse-dot" />}
                {statusLabel}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">Last updated: just now</div>
            </div>
          </div>
        </div>
      </header>


      <div className="relative mx-auto max-w-[1400px] px-8 py-10 space-y-12">
        {/* Daily date + inspirational quote */}
        <DailyQuoteBanner today={today} />

        {/* Leadership Messages — pinned to top */}
        <LeadershipMessages messages={leadershipMessages as any[]} />

        {/* "What changed since you last looked" — powered by the Mission Intelligence Graph */}
        {missions[0]?.id && <RecentChangesCard missionId={missions[0].id} />}

        {/* Self-tag expertise prompt (workaround until Talentdesk auto-tags) */}
        <ExpertiseTagsCard />








        {isLeader && myAssignments.length > 0 && (
          <section>
            <div className="mb-5">
              <h2 className="h2-label">Your assignments</h2>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                {myAssignments.length} {myAssignments.length === 1 ? "question" : "questions"} assigned to you
              </p>
            </div>
            <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
              {myAssignments.map((q) => {
                const days = q.pens_down_date
                  ? Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86400000)
                  : null;
                const tone = days === null ? "text-muted-foreground"
                  : days < 0 ? "text-destructive"
                  : days <= 3 ? "text-destructive"
                  : days <= 7 ? "text-amber-400"
                  : "text-foreground";
                const dotCls = q.health === "green" ? "dot dot-green"
                  : q.health === "red" ? "dot dot-red"
                  : "dot dot-yellow";
                return (
                  <li key={q.id} className="px-5 py-3">
                    <Link
                      to="/missions/$missionId/sections/$questionId"
                      params={{ missionId: q.mission_id, questionId: q.id }}
                      className="flex items-center gap-3 hover:text-primary"
                    >
                      <span className={dotCls} />
                      <MissionPill name={missionMap.get(q.mission_id) ?? "—"} />
                      <span className="mono-q text-[11px] font-semibold shrink-0">{q.question_number}</span>
                      <span className="flex-1 min-w-0 truncate text-sm text-foreground">{q.title}</span>
                      {q.current_score !== null && (
                        <span className="shrink-0 text-[11px] mono-score text-muted-foreground">{Number(q.current_score).toFixed(1)}</span>
                      )}
                      <span className={`shrink-0 text-xs font-semibold mono-days ${tone}`}>
                        {days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Atrium command-center intelligence layer (leaders only) */}
        {isLeader && missions.length > 0 && (
          <div className="space-y-3">
            <IrisPersonalAlert />
            <PortfolioStatusStrip
              missions={missions as any}
              missionQuestions={missionQuestions as any}
              activeFilter={missionHealthFilter}
              onFilterChange={setMissionHealthFilter}
            />
            <AttentionPanel
              missions={missions as any}
              missionQuestions={missionQuestions as any}
              forceExpanded={role === "pm"}
              criticalOnly={role === "executive_sponsor"}
            />

            <DueThisWeek
              missions={missions as any}
              missionQuestions={missionQuestions as any}
            />
            <MorningBriefing items={briefItems} />
          </div>
        )}

        {/* ROLE-DIFFERENTIATED: Active Missions (leaders) or Your Assignments (writers/SMEs) */}
        {isLeader ? (
          <section data-tour="missions">

            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="h2-label">Active Missions</h2>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                  <AnimatedNumber value={missions.length} /> in flight
                </p>
              </div>
            </div>

            {missionsLoading ? (
              <MissionGridSkeleton count={3} />
            ) : missions.length === 0 ? (
              <EmptyState
                icon={<Rocket className="h-10 w-10" strokeWidth={1.5} />}
                title="Welcome to Athena HQ."
                subtitle={isAdmin ? "No active missions yet. When a mission is activated, it will appear here with IRIS monitoring its health in real time." : "No active missions yet. An admin will set things up shortly."}
                cta={
                  isAdmin ? (
                    <Link
                      to="/olympus"
                      className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
                    >
                      Activate Your First Mission
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null
                }
              />
            ) : (
              <>
                <div className="mb-4">
                  <MissionFilterBar
                    total={filteredMissions.length}
                    search={missionSearch}
                    onSearchChange={setMissionSearch}
                    sort={missionSort}
                    onSortChange={setMissionSort}
                    healthFilter={missionHealthFilter}
                    onHealthChange={setMissionHealthFilter}
                  />
                </div>
                {filteredMissions.length === 0 ? (
                  <div className="rounded-[12px] border border-dashed border-border bg-surface/40 px-6 py-10 text-center text-sm text-muted-foreground">
                    No missions match the current filters.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredMissions.map((m) => {
                      const qs = missionQuestions.filter((q) => q.mission_id === m.id);
                      return (
                        <MissionCard
                          key={m.id}
                          mission={m as Mission}
                          attention={attMap.get(m.id) ?? 0}
                          questions={qs}
                          lastSignalAt={lastSignalByMission[m.id] ?? null}
                          needsCount={needsByMission[m.id] ?? 0}
                          showNeedsBadge={isLeader}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <>
            {/* Day-one trust intro — dismissible, sets IRIS-as-colleague framing */}
            <IrisTrustIntro />

            {/* Flight Deck V4 — personal IRIS briefing leads the writer view */}
            <IrisMorningBrief />

            {/* Health Monitoring Phase 1: Daily Pulse */}
            <DailyPulse />



            <section>
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <h2 className="h2-label">Your mission today</h2>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                    {myAssignments.length === 0
                      ? "You're clear — help a teammate."
                      : `${myAssignments.length} ${myAssignments.length === 1 ? "question needs" : "questions need"} you`}
                  </p>
                </div>
              </div>

              {assignmentsLoading ? (
                <QuestionListSkeleton count={5} />
              ) : myAssignments.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="h-10 w-10" strokeWidth={1.5} />}
                  title="No questions assigned yet."
                  subtitle="Your Engagement Lead will assign your questions once the RFP is uploaded and parsed."
                />
              ) : (
                <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
                  {myAssignments.map((q) => {
                    const days = q.pens_down_date
                      ? Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86400000)
                      : null;
                    const tone = days === null ? "text-muted-foreground"
                      : days < 0 ? "text-destructive"
                      : days <= 3 ? "text-destructive"
                      : days <= 7 ? "text-amber-400"
                      : "text-foreground";
                    const dotCls = q.health === "green" ? "dot dot-green"
                      : q.health === "red" ? "dot dot-red"
                      : "dot dot-yellow";
                    return (
                      <li key={q.id} className="px-5 py-3">
                        <Link
                          to="/missions/$missionId/sections/$questionId"
                          params={{ missionId: q.mission_id, questionId: q.id }}
                          className="flex items-center gap-3 hover:text-primary"
                        >
                          <span className={dotCls} />
                          <MissionPill name={missionMap.get(q.mission_id) ?? "—"} />
                          <span className="mono-q text-[11px] font-semibold shrink-0">{q.question_number}</span>
                          <span className="flex-1 min-w-0 truncate text-sm text-foreground">{q.title}</span>
                          {q.current_score !== null && (
                            <span className="shrink-0 text-[11px] mono-score text-muted-foreground">{Number(q.current_score).toFixed(1)}</span>
                          )}
                          <span className={`shrink-0 text-xs font-semibold mono-days ${tone}`}>
                            {days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* LegacyRecord temporarily removed */}
          </>
        )}


        {/* PHASE 7 / CHANGE 4: Firm Intel — collapsed by default */}
        <FirmIntel
          horizonItems={horizonItems}
          missions={missions}
        />
      </div>

      <GuidedTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        storageKey="atlas:tour:home:v1"
        steps={HOME_TOUR_STEPS(missions[0]?.id)}
      />
    </div>
  );
}

function HOME_TOUR_STEPS(firstMissionId: string | undefined): TourStep[] {
  return [
    {
      title: "Welcome to ATLAS.",
      body: (
        <>
          A 60-second tour of the surfaces you'll live in: <b>Athena HQ</b>, the
          <b> Atrium</b> destinations, and the <b>Mission interior</b> where IRIS
          quietly does its work.
        </>
      ),
    },
    {
      selector: '[data-tour="athena-hq"]',
      placement: "bottom",
      title: "Athena HQ — your command center",
      body: (
        <>
          This is home base. Greeting, firm status, leadership messages, and your
          active missions all live here. Everything else is one click away.
        </>
      ),
    },
    {
      selector: '[data-tour="atrium-nav"]',
      placement: "bottom",
      title: "Atrium destinations",
      body: (
        <>
          The five Atrium-level surfaces: <b>Home</b>, <b>Journey Map</b>,
          <b> Status Report</b>, <b>Profile</b>, and <b>Data & Privacy</b>. These
          are the only top-level places you navigate to.
        </>
      ),
    },
    {
      selector: '[data-tour="flight deck"]',
      placement: "left",
      title: "Flight Deck — your daily work",
      body: (
        <>
          Flight Deck is your cross-mission to-do surface — what's due, what's blocked,
          what needs a decision today.
        </>
      ),
    },
    {
      selector: '[data-tour="missions"]',
      placement: "top",
      title: "Mission interior",
      body: (
        <>
          Open any mission to enter its interior: <b>Mission Brief</b>,
          <b> Environmental Assessment</b>, <b>What the State Wants</b>,
          <b> Emerging Risks</b>, and <b>Recommended Strategy</b>. These five
          IRIS outputs are everything you ever see.
        </>
      ),
    },
    {
      selector: '[data-tour="iris-launch"]',
      placement: "bottom",
      title: "IRIS is a layer, not a stop",
      body: (
        <>
          Notice there's no "IRIS" tab in the nav. IRIS surfaces <i>inline</i> —
          inside the Mission Brief, on every section panel, and in Atrium
          Attention. The power view lives at
          {firstMissionId ? <code className="ml-1 text-foreground"> /missions/{firstMissionId.slice(0, 8)}…/iris-command</code> : <code className="ml-1 text-foreground"> /missions/:id/iris-command</code>}.
          Launch the demo any time from this button.
        </>
      ),
    },
  ];
}


const DAILY_QUOTES: { quote: string; author: string }[] = [
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "Plans are useless, but planning is indispensable.", author: "Dwight D. Eisenhower" },
  { quote: "The will to win is nothing without the will to prepare.", author: "Juma Ikangaa" },
  { quote: "Victory loves preparation.", author: "Roman Proverb" },
  { quote: "Know the enemy, know yourself; your victory will never be endangered.", author: "Sun Tzu" },
  { quote: "Luck is what happens when preparation meets opportunity.", author: "Seneca" },
  { quote: "An ounce of performance is worth pounds of promises.", author: "Mae West" },
  { quote: "Strategy without tactics is the slowest route to victory. Tactics without strategy is the noise before defeat.", author: "Sun Tzu" },
  { quote: "Give me six hours to chop down a tree and I will spend the first four sharpening the axe.", author: "Abraham Lincoln" },
  { quote: "The more I practice, the luckier I get.", author: "Gary Player" },
  { quote: "Victorious warriors win first and then go to war, while defeated warriors go to war first and then seek to win.", author: "Sun Tzu" },
  { quote: "Opportunities multiply as they are seized.", author: "Sun Tzu" },
  { quote: "Every battle is won before it is fought.", author: "Sun Tzu" },
  { quote: "Supreme excellence consists in breaking the enemy's resistance without fighting.", author: "Sun Tzu" },
  { quote: "The general who wins the battle makes many calculations before the battle is fought.", author: "Sun Tzu" },
  { quote: "All men can see these tactics whereby I conquer, but what none can see is the strategy out of which victory is evolved.", author: "Sun Tzu" },
  { quote: "He who knows when to fight and when not to fight will be victorious.", author: "Sun Tzu" },
  { quote: "Let your plans be dark and impenetrable as night, and when you move, fall like a thunderbolt.", author: "Sun Tzu" },
  { quote: "Appear weak when you are strong, and strong when you are weak.", author: "Sun Tzu" },
  { quote: "The greatest victory is that which requires no battle.", author: "Sun Tzu" },
  { quote: "Ponder and deliberate before you make a move.", author: "Sun Tzu" },
  { quote: "The whole secret lies in confusing the enemy so that he cannot fathom our real intent.", author: "Sun Tzu" },
  { quote: "Attack is the secret of defense; defense is the planning of an attack.", author: "Sun Tzu" },
  { quote: "To know your enemy, you must become your enemy.", author: "Sun Tzu" },
  { quote: "Never interrupt your enemy when he is making a mistake.", author: "Napoleon Bonaparte" },
  { quote: "In war, the moral is to the physical as three is to one.", author: "Napoleon Bonaparte" },
  { quote: "Impossible is a word found only in the dictionary of fools.", author: "Napoleon Bonaparte" },
  { quote: "The secret of war lies in the communications.", author: "Napoleon Bonaparte" },
  { quote: "If you're going through hell, keep going.", author: "Winston Churchill" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "However beautiful the strategy, you should occasionally look at the results.", author: "Winston Churchill" },
  { quote: "Continuous effort — not strength or intelligence — is the key to unlocking our potential.", author: "Winston Churchill" },
  { quote: "The pessimist sees difficulty in every opportunity. The optimist sees opportunity in every difficulty.", author: "Winston Churchill" },
  { quote: "Success consists of going from failure to failure without loss of enthusiasm.", author: "Winston Churchill" },
  { quote: "The price of greatness is responsibility.", author: "Winston Churchill" },
  { quote: "We shall fight on the beaches. We shall never surrender.", author: "Winston Churchill" },
  { quote: "Perfection is not attainable, but if we chase perfection we can catch excellence.", author: "Vince Lombardi" },
  { quote: "Winning is a habit. Unfortunately, so is losing.", author: "Vince Lombardi" },
  { quote: "The will to win, the desire to succeed, the urge to reach your full potential — these are the keys to personal excellence.", author: "Vince Lombardi" },
  { quote: "Individual commitment to a group effort — that is what makes a team work.", author: "Vince Lombardi" },
  { quote: "The quality of a person's life is in direct proportion to their commitment to excellence.", author: "Vince Lombardi" },
  { quote: "Show me a good loser, and I'll show you a loser.", author: "Vince Lombardi" },
  { quote: "Winning isn't everything — but making the effort to win is.", author: "Vince Lombardi" },
  { quote: "Once you learn to quit, it becomes a habit.", author: "Vince Lombardi" },
  { quote: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
  { quote: "The whole is greater than the sum of its parts.", author: "Aristotle" },
  { quote: "The more you know, the more you realize you don't know.", author: "Aristotle" },
  { quote: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { quote: "Well done is better than well said.", author: "Benjamin Franklin" },
  { quote: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { quote: "By failing to prepare, you are preparing to fail.", author: "Benjamin Franklin" },
  { quote: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { quote: "The secret of success is constancy of purpose.", author: "Benjamin Disraeli" },
  { quote: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { quote: "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", author: "Antoine de Saint-Exupéry" },
  { quote: "Simple can be harder than complex.", author: "Steve Jobs" },
  { quote: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "Great things in business are never done by one person. They're done by a team.", author: "Steve Jobs" },
  { quote: "Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do great work.", author: "Steve Jobs" },
  { quote: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { quote: "There is no substitute for hard work.", author: "Thomas Edison" },
  { quote: "Opportunity is missed by most people because it is dressed in overalls and looks like work.", author: "Thomas Edison" },
  { quote: "Genius is one percent inspiration and ninety-nine percent perspiration.", author: "Thomas Edison" },
  { quote: "The best way to predict the future is to invent it.", author: "Alan Kay" },
  { quote: "The measure of intelligence is the ability to change.", author: "Albert Einstein" },
  { quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { quote: "Imagination is more important than knowledge.", author: "Albert Einstein" },
  { quote: "Out of complexity, find simplicity.", author: "Albert Einstein" },
  { quote: "A person who never made a mistake never tried anything new.", author: "Albert Einstein" },
  { quote: "The true sign of intelligence is not knowledge but imagination.", author: "Albert Einstein" },
  { quote: "In God we trust; all others bring data.", author: "W. Edwards Deming" },
  { quote: "Knowledge is power.", author: "Francis Bacon" },
  { quote: "The greatest enemy of knowledge is not ignorance — it is the illusion of knowledge.", author: "Daniel J. Boorstin" },
  { quote: "Leadership and learning are indispensable to each other.", author: "John F. Kennedy" },
  { quote: "Ask not what your country can do for you — ask what you can do for your country.", author: "John F. Kennedy" },
  { quote: "The time to repair the roof is when the sun is shining.", author: "John F. Kennedy" },
  { quote: "Efforts and courage are not enough without purpose and direction.", author: "John F. Kennedy" },
  { quote: "Change is not merely necessary to life — it is life.", author: "Alvin Toffler" },
  { quote: "Management is doing things right; leadership is doing the right things.", author: "Peter Drucker" },
  { quote: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { quote: "What gets measured, gets managed.", author: "Peter Drucker" },
  { quote: "Efficiency is doing things right. Effectiveness is doing the right things.", author: "Peter Drucker" },
  { quote: "The purpose of a business is to create a customer.", author: "Peter Drucker" },
  { quote: "Strategy is about making choices, trade-offs; it's about deliberately choosing to be different.", author: "Michael Porter" },
  { quote: "The essence of strategy is choosing what not to do.", author: "Michael Porter" },
  { quote: "Competitive advantage is at the heart of a firm's performance.", author: "Michael Porter" },
  { quote: "Talent wins games, but teamwork and intelligence win championships.", author: "Michael Jordan" },
  { quote: "I've missed more than 9,000 shots. I've lost almost 300 games. I've failed over and over. That is why I succeed.", author: "Michael Jordan" },
  { quote: "You have to expect things of yourself before you can do them.", author: "Michael Jordan" },
  { quote: "Some people want it to happen, some wish it would happen, others make it happen.", author: "Michael Jordan" },
  { quote: "If you're going to go to war, have the best intelligence you can get.", author: "Colin Powell" },
  { quote: "There are no secrets to success. It is the result of preparation, hard work, and learning from failure.", author: "Colin Powell" },
  { quote: "If you are going to achieve excellence in big things, you develop the habit in little matters.", author: "Colin Powell" },
  { quote: "A dream doesn't become reality through magic; it takes sweat, determination, and hard work.", author: "Colin Powell" },
  { quote: "The day soldiers stop bringing you their problems is the day you have stopped leading them.", author: "Colin Powell" },
  { quote: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { quote: "The bamboo that bends is stronger than the oak that resists.", author: "Japanese Proverb" },
  { quote: "Vision without action is a daydream. Action without vision is a nightmare.", author: "Japanese Proverb" },
  { quote: "If you want to go fast, go alone. If you want to go far, go together.", author: "African Proverb" },
  { quote: "A smooth sea never made a skilled sailor.", author: "Franklin D. Roosevelt" },
  { quote: "The only thing we have to fear is fear itself.", author: "Franklin D. Roosevelt" },
  { quote: "When you reach the end of your rope, tie a knot in it and hang on.", author: "Franklin D. Roosevelt" },
  { quote: "America was not built on fear. America was built on courage, on imagination and an unbeatable determination to do the job at hand.", author: "Harry S. Truman" },
  { quote: "It is amazing what you can accomplish if you do not care who gets the credit.", author: "Harry S. Truman" },
  { quote: "The buck stops here.", author: "Harry S. Truman" },
  { quote: "We must be the change we wish to see in the world.", author: "Mahatma Gandhi" },
  { quote: "Strength does not come from physical capacity. It comes from an indomitable will.", author: "Mahatma Gandhi" },
  { quote: "First they ignore you, then they laugh at you, then they fight you, then you win.", author: "Mahatma Gandhi" },
  { quote: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { quote: "Without ambition one starts nothing. Without work one finishes nothing.", author: "Ralph Waldo Emerson" },
  { quote: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson" },
  { quote: "Do not go where the path may lead; go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson" },
  { quote: "The only person you are destined to become is the person you decide to be.", author: "Ralph Waldo Emerson" },
  { quote: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { quote: "A leader is best when people barely know he exists.", author: "Lao Tzu" },
  { quote: "Mastering others is strength. Mastering yourself is true power.", author: "Lao Tzu" },
  { quote: "Nature does not hurry, yet everything is accomplished.", author: "Lao Tzu" },
  { quote: "He who knows much speaks with silence.", author: "Lao Tzu" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { quote: "All our dreams can come true, if we have the courage to pursue them.", author: "Walt Disney" },
  { quote: "It's kind of fun to do the impossible.", author: "Walt Disney" },
  { quote: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { quote: "Skate to where the puck is going, not where it has been.", author: "Wayne Gretzky" },
  { quote: "Champions keep playing until they get it right.", author: "Billie Jean King" },
  { quote: "Be the change you wish to see in the world.", author: "Mahatma Gandhi" },
  { quote: "The obstacle is the path.", author: "Zen Proverb" },
  { quote: "Before enlightenment, chop wood, carry water. After enlightenment, chop wood, carry water.", author: "Zen Proverb" },
  { quote: "One who conquers himself is greater than another who conquers a thousand men in battle.", author: "Buddha" },
  { quote: "Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment.", author: "Buddha" },
  { quote: "Peace comes from within. Do not seek it without.", author: "Buddha" },
  { quote: "Three things cannot be long hidden: the sun, the moon, and the truth.", author: "Buddha" },
  { quote: "The secret of joy in work is contained in one word — excellence.", author: "Pearl S. Buck" },
  { quote: "The person without a purpose is like a ship without a rudder.", author: "Thomas Carlyle" },
  { quote: "Make your life a mission, not an intermission.", author: "Arnold Glasgow" },
  { quote: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
  { quote: "That which does not kill us makes us stronger.", author: "Friedrich Nietzsche" },
  { quote: "Without music, life would be a mistake.", author: "Friedrich Nietzsche" },
  { quote: "The higher we soar, the smaller we appear to those who cannot fly.", author: "Friedrich Nietzsche" },
  { quote: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C.S. Lewis" },
  { quote: "Integrity is doing the right thing, even when no one is watching.", author: "C.S. Lewis" },
  { quote: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
  { quote: "Courage is not the absence of fear, but rather the judgment that something else is more important than fear.", author: "Ambrose Redmoon" },
  { quote: "It is not the mountain we conquer, but ourselves.", author: "Edmund Hillary" },
  { quote: "The summit is what drives us, but the climb itself is what matters.", author: "Conrad Anker" },
  { quote: "Difficulties are meant to rouse, not discourage.", author: "William Ellery Channing" },
  { quote: "When everything seems to be going against you, remember that the airplane takes off against the wind, not with it.", author: "Henry Ford" },
  { quote: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
  { quote: "Coming together is a beginning, staying together is progress, working together is success.", author: "Henry Ford" },
  { quote: "Quality means doing it right when no one is looking.", author: "Henry Ford" },
  { quote: "If I had asked people what they wanted, they would have said faster horses.", author: "Henry Ford" },
  { quote: "Excellence is doing ordinary things extraordinarily well.", author: "John W. Gardner" },
  { quote: "The task of leadership is not to put greatness into people, but to elicit it.", author: "John Buchan" },
  { quote: "None of us is as smart as all of us.", author: "Ken Blanchard" },
  { quote: "The key to successful leadership today is influence, not authority.", author: "Ken Blanchard" },
  { quote: "The speed of trust is the most powerful force multiplier I know of.", author: "Stephen M.R. Covey" },
  { quote: "Trust is the glue of life. It's the most essential ingredient in effective communication.", author: "Stephen Covey" },
  { quote: "Without integrity, no real success is possible.", author: "Napoleon Hill" },
  { quote: "Whatever the mind can conceive and believe, it can achieve.", author: "Napoleon Hill" },
  { quote: "A goal is a dream with a deadline.", author: "Napoleon Hill" },
  { quote: "The starting point of all achievement is desire.", author: "Napoleon Hill" },
  { quote: "You are the master of your destiny. You can influence, direct and control your own environment.", author: "Napoleon Hill" },
  { quote: "The time is always right to do what is right.", author: "Martin Luther King Jr." },
  { quote: "A genuine leader is not a searcher for consensus but a molder of consensus.", author: "Martin Luther King Jr." },
  { quote: "If you can't fly, then run. If you can't run, then walk. If you can't walk, then crawl. But whatever you do, you have to keep moving forward.", author: "Martin Luther King Jr." },
  { quote: "The function of education is to teach one to think intensively and to think critically.", author: "Martin Luther King Jr." },
  { quote: "Life's most persistent and urgent question is, 'What are you doing for others?'", author: "Martin Luther King Jr." },
  { quote: "It is not enough to be busy; so too are the ants. The question is, what are we busy about?", author: "Henry David Thoreau" },
  { quote: "Go confidently in the direction of your dreams. Live the life you have imagined.", author: "Henry David Thoreau" },
  { quote: "Success is not the key to happiness. Happiness is the key to success.", author: "Albert Schweitzer" },
  { quote: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { quote: "Eighty percent of success is showing up.", author: "Woody Allen" },
  { quote: "The road to success and the road to failure are almost exactly the same.", author: "Colin R. Davis" },
  { quote: "There are no shortcuts to any place worth going.", author: "Beverly Sills" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
  { quote: "A winner is a dreamer who never gives up.", author: "Nelson Mandela" },
  { quote: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela" },
  { quote: "Do not judge me by my successes, judge me by how many times I fell down and got back up again.", author: "Nelson Mandela" },
  { quote: "The measure of any society is how well it takes care of its most vulnerable.", author: "Nelson Mandela" },
  { quote: "Courage is not the absence of fear, but the triumph over it.", author: "Nelson Mandela" },
  { quote: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { quote: "Absorb what is useful, discard what is not, add what is uniquely your own.", author: "Bruce Lee" },
  { quote: "Be like water making its way through cracks.", author: "Bruce Lee" },
  { quote: "Knowing is not enough; we must apply. Willing is not enough; we must do.", author: "Bruce Lee" },
  { quote: "If you spend too much time thinking about a thing, you'll never get it done.", author: "Bruce Lee" },
  { quote: "The way of the superior man is three-fold: virtuous, he is free from anxieties; wise, he is free from perplexities; bold, he is free from fear.", author: "Confucius" },
  { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { quote: "Real knowledge is to know the extent of one's ignorance.", author: "Confucius" },
  { quote: "When you know a thing, hold that you know it; and when you do not know a thing, allow that you do not know it.", author: "Confucius" },
  { quote: "The will to win, the desire to succeed, the urge to reach your full potential — these are the keys that will unlock the door to excellence.", author: "Confucius" },
  { quote: "Leadership is the capacity to translate vision into reality.", author: "Warren Bennis" },
  { quote: "Becoming a leader is synonymous with becoming yourself.", author: "Warren Bennis" },
  { quote: "The most dangerous leadership myth is that leaders are born.", author: "Warren Bennis" },
  { quote: "Good leaders make people feel that they're at the very heart of things, not at the periphery.", author: "Warren Bennis" },
  { quote: "The most effective leaders are, in fact, the most human.", author: "Warren Bennis" },
  { quote: "Speak softly and carry a big stick.", author: "Theodore Roosevelt" },
  { quote: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { quote: "Far better is it to dare mighty things, to win glorious triumphs, even though checkered by failure.", author: "Theodore Roosevelt" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { quote: "The best executive is the one who has sense enough to pick good men to do what he wants done.", author: "Theodore Roosevelt" },
  { quote: "The credit belongs to the man who is actually in the arena.", author: "Theodore Roosevelt" },
  { quote: "If your actions inspire others to dream more, learn more, do more and become more, you are a leader.", author: "John Quincy Adams" },
  { quote: "In order to win, you must expect to win.", author: "Richard Bach" },
  { quote: "The difference between stumbling blocks and stepping stones is how you use them.", author: "Unknown" },
  { quote: "Good enough never is.", author: "Debbi Fields" },
  { quote: "The greatest oak was once a little nut who held its ground.", author: "Unknown" },
  { quote: "Clarity of purpose is the beginning of all achievement.", author: "Unknown" },
  { quote: "Character is how you treat those who can do nothing for you.", author: "Unknown" },
  { quote: "Strategy is not a solo sport, even if you're the CEO.", author: "Max McKeown" },
  { quote: "Complexity is the enemy of execution.", author: "Tony Robbins" },
  { quote: "It is not the strongest of the species that survive, nor the most intelligent, but the one most responsive to change.", author: "Charles Darwin" },
  { quote: "Credibility is the foundation of leadership.", author: "James Kouzes" },
  { quote: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson" },
  { quote: "Tough times never last, but tough people do.", author: "Robert H. Schuller" },
  { quote: "Don't find the fault, find the remedy.", author: "Henry Ford" },
  { quote: "The secret of change is to focus all of your energy not on fighting the old, but on building the new.", author: "Socrates" },
  { quote: "An unexamined life is not worth living.", author: "Socrates" },
  { quote: "Wisdom begins in wonder.", author: "Socrates" },
  { quote: "Strong minds discuss ideas, average minds discuss events, weak minds discuss people.", author: "Socrates" },
  { quote: "By all means, marry. If you get a good wife, you'll become happy; if you get a bad one, you'll become a philosopher.", author: "Socrates" },
];

function getDailyQuote() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

function DailyQuoteBanner({ today }: { today: string }) {
  const q = useMemo(getDailyQuote, []);
  return (
    <section className="rounded-[12px] border border-border bg-gradient-to-br from-surface to-background px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-4 w-4 text-primary" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Today</div>
            <div className="mt-0.5 text-base font-semibold tracking-tight">{today}</div>
          </div>
        </div>
        <blockquote className="max-w-2xl text-right">
          <p className="text-sm italic leading-relaxed text-foreground/90">"{q.quote}"</p>
          <footer className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">— {q.author}</footer>
        </blockquote>
      </div>
    </section>
  );
}

function LeadershipMessages({ messages }: { messages: any[] }) {
  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Leadership Messages</h3>
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Firm-wide</span>
      </div>
      <ul className="divide-y divide-border">
        {messages.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-muted-foreground">No broadcasts yet. Leadership messages will appear here.</li>
        )}
        {messages.map((m: any) => (
          <li key={m.id} className="px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-foreground">{m.from_name}</span>
              <span className="text-[10px] text-muted-foreground">{relativeTime(m.created_at)}</span>
            </div>
            <p className="mt-1 text-sm text-foreground/90 leading-relaxed">{m.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FirmIntel({
  horizonItems,
  missions,
}: {
  horizonItems: (IntelItem & { matched_mission_ids?: string[] | null })[];
  missions: Mission[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[12px] border border-border bg-surface/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-surface-hover transition-colors rounded-[12px]"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Firm Intel
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Horizon Feed
        </span>
      </button>
      {open && (
        <div className="border-t border-border p-5">
          <HorizonFeed items={horizonItems} missions={missions} />
        </div>
      )}
    </section>
  );
}



type MissionCardQ = { id: string; question_number: string; title: string; pens_down_date: string | null; health: string | null; status: string | null };

function MissionCardActions({ missionId }: { missionId: string }) {
  const nav = useNavigate();
  const go = (e: React.MouseEvent, fn: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  const btn =
    "flex-1 rounded-md border border-border bg-background/60 px-2 py-1.5 text-[11px] font-medium text-foreground/80 hover:bg-foreground/10 hover:text-foreground transition";
  return (
    <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
      <button
        type="button"
        className={btn}
        onClick={(e) => go(e, () => nav({ to: "/missions/$missionId", params: { missionId } }))}
      >
        Flight Deck
      </button>
      <button
        type="button"
        className={btn}
        onClick={(e) => go(e, () => nav({ to: "/missions/$missionId/sections", params: { missionId } }))}
      >
        Sections
      </button>
      <button
        type="button"
        className={btn}
        onClick={(e) => go(e, () => nav({ to: "/missions/$missionId/brief", params: { missionId } }))}
      >
        Mission Brief
      </button>
    </div>
  );
}

function MissionCard({
  mission,
  attention,
  questions,
  lastSignalAt,
  needsCount,
  showNeedsBadge,
}: {
  mission: Mission;
  attention: number;
  questions: MissionCardQ[];
  lastSignalAt: string | null;
  needsCount: number;
  showNeedsBadge: boolean;
}) {
  const days = mission.submission_date
    ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
    : null;
  const countdownTone = days === null ? "text-muted-foreground"
    : days <= 7 ? "text-destructive"
    : days <= 21 ? "text-amber-400"
    : "text-foreground";

  // Computed mission health from question health
  const qHealths = questions.map((q) => (q.health ?? "").toLowerCase());
  const computedHealth = qHealths.includes("red") ? "Red"
    : qHealths.includes("yellow") ? "Yellow"
    : qHealths.length > 0 && qHealths.every((h) => h === "green") ? "Green"
    : mission.health;

  // Nearest pens-down across questions
  const nextQ = questions
    .filter((q) => q.pens_down_date)
    .sort((a, b) => new Date(a.pens_down_date!).getTime() - new Date(b.pens_down_date!).getTime())[0];
  const nextDate = nextQ?.pens_down_date ? new Date(nextQ.pens_down_date) : null;
  const nextDays = nextDate ? Math.ceil((nextDate.getTime() - Date.now()) / 86400000) : null;
  const nextDateLabel = nextDate ? nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const nextIsUrgent = nextDays !== null && nextDays <= 7;

  // IRIS one-liner
  const redCount = qHealths.filter((h) => h === "red").length;
  const yellowCount = qHealths.filter((h) => h === "yellow").length;
  const oneLiner = questions.length === 0
    ? "Activate this mission to begin IRIS intelligence."
    : computedHealth === "Red"
    ? `${redCount} ${redCount === 1 ? "question" : "questions"} at risk — leadership attention needed.`
    : computedHealth === "Yellow"
    ? `${yellowCount} ${yellowCount === 1 ? "question" : "questions"} need attention.`
    : "All questions on track.";

  // Last signal
  const signalAgeMs = lastSignalAt ? Date.now() - new Date(lastSignalAt).getTime() : null;
  const noSignalToday = signalAgeMs === null || signalAgeMs > 24 * 60 * 60 * 1000;

  // Health border + glow
  const borderColor = computedHealth === "Green" ? "var(--green, #22c55e)"
    : computedHealth === "Red" ? "var(--red, #ef4444)"
    : "var(--yellow, #f59e0b)";
  const glow = computedHealth === "Green" ? "0 0 12px rgba(34,197,94,0.25)"
    : computedHealth === "Red" ? "0 0 12px rgba(239,68,68,0.25)"
    : "0 0 12px rgba(245,158,11,0.25)";

  return (
    <Link
      to="/missions/$missionId"
      params={{ missionId: mission.id }}
      data-health={computedHealth}
      onClick={() => { try { sessionStorage.setItem("athena:last-mission", mission.id); } catch {} }}
      className={`mission-card-v7 group relative block rounded-[12px] border border-border bg-surface p-5 transition-all duration-200 ease-out hover:-translate-y-[3px] hover:border-foreground/30 ${(mission.status ?? "").toLowerCase() === "active" ? "mission-card-active" : ""}`}
      style={{
        minHeight: 140,
        borderLeftWidth: 4,
        borderLeftColor: borderColor,
        boxShadow: glow,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `${glow}, 0 8px 24px rgba(0,0,0,0.3)`; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = glow; }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[1.1rem] font-bold text-foreground">{mission.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{mission.client}{mission.state ? ` · ${mission.state}` : ""}</p>
          {/* IRIS one-liner */}
          <p className="mt-2 text-[12px] italic text-muted-foreground/90 line-clamp-2">{oneLiner}</p>
          {/* Next deadline */}
          {nextQ && nextDateLabel && (
            <p className="mt-1.5 text-[11px] text-muted-foreground truncate">
              Next: <span className={nextIsUrgent && computedHealth !== "Green" ? "text-destructive font-medium" : "text-foreground/90"}>{nextDateLabel}</span>
              {" · "}
              <span className="mono-q font-semibold">{nextQ.question_number}</span>{" "}{nextQ.title}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <MissionProgressRing
            size="sm"
            completed={questions.filter((q) => {
              const s = (q.status ?? "").toLowerCase();
              return s === "approved" || s === "submitted";
            }).length}
            total={mission.question_count ?? questions.length}
          />
          {showNeedsBadge && needsCount > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              {needsCount} {needsCount === 1 ? "need" : "needs"}
            </span>
          )}
          {attention > 0 && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold mono ${
              attention >= 50 ? "border-destructive/40 bg-destructive/10 text-destructive" :
              attention >= 20 ? "border-amber-500/40 bg-amber-500/10 text-amber-400" :
              "border-primary/30 bg-primary/5 text-primary"
            }`}>
              ATT {attention}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs font-medium text-foreground/90">{computedHealth}</span>
        {days !== null && (
          <span className={`ml-auto text-xl font-semibold mono-days leading-none ${countdownTone}`}>
            {days < 0 ? `${Math.abs(days)}d` : `${days}d`}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-muted-foreground mono">
          {mission.question_count ?? questions.length} questions
        </span>
        {noSignalToday ? (
          <span className="text-[10px] text-amber-400">⚠ No signal today</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">Last signal: {relativeTime(lastSignalAt!)}</span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
          Enter Mission Room
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <MissionCardActions missionId={mission.id} />
    </Link>
  );
}


function MissionPill({ name }: { name: string }) {
  return (
    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground/80 truncate max-w-[160px]">
      {name}
    </span>
  );
}

// ─── IRIS MORNING BRIEF (firm-wide) ────────────────────────────────────────

function IrisMorningBrief() {
  const qc = useQueryClient();
  const generate = useServerFn(generateLobbyBrief);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["iris-morning-brief"],
    queryFn: () => generate({ data: { force: false } }),
    staleTime: 30 * 60 * 1000,
  });

  const refresh = async () => {
    const fresh = await generate({ data: { force: true } });
    qc.setQueryData(["iris-morning-brief"], fresh);
  };

  const stamp = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "—";

  return (
    <section className="iris-panel rounded-[12px] border border-[color:var(--iris,#22d3ee)]/30 border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04] px-5 py-4">
      <div className="flex items-start gap-4">
        <span className="iris-label inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)] shrink-0 mt-1">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#22d3ee)]/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--iris,#22d3ee)]" />
          </span>
          IRIS · Morning Brief
        </span>
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground italic">IRIS is preparing your firm-wide brief…</p>
          ) : (
            <p className="text-[15px] leading-relaxed text-foreground/90">{data?.brief}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>Updated {stamp}</span>
            <button
              onClick={refresh}
              disabled={isFetching}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── ASK IRIS BAR ──────────────────────────────────────────────────────────


function AskIrisBar() {
  const [value, setValue] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [focused, setFocused] = useState(false);
  const askFn = useServerFn(irisAskGlobal);
  const active = focused || value.length > 0;
  const onAsk = async () => {
    const prompt = value.trim();
    if (!prompt || asking) return;
    setAsking(true);
    setAnswer("");
    try {
      const r = await askFn({ data: { prompt } });
      setAnswer(r.answer);
    } catch (e: any) {
      setAnswer(`_Error: ${e?.message ?? "unknown"}_`);
    } finally {
      setAsking(false);
    }
  };
  return (
    <section
      className={`iris-panel rounded-[12px] border bg-surface px-4 py-3 transition-colors ${
        active ? "border-primary/50" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <Sparkles className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hidden sm:inline">
          Ask IRIS
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
          placeholder="Ask IRIS about any mission, signal, or policy…"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {(active || asking) && <IrisWaveform />}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAsk}
          disabled={asking || !value.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {asking ? "…" : "Ask"}
        </button>
      </div>
      {(asking || answer) && (
        <div className="mt-3 rounded-md border border-[color:var(--iris,#22d3ee)]/20 bg-background/40 px-4 py-3 text-sm text-foreground whitespace-pre-wrap">
          {asking ? "IRIS is thinking…" : answer}
        </div>
      )}
    </section>
  );
}

// ─── HORIZON FEED ──────────────────────────────────────────────────────────

function HorizonFeed({ items, missions }: { items: (IntelItem & { matched_mission_ids?: string[] | null })[]; missions: Mission[] }) {
  const [filter, setFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const missionNameMap = useMemo(() => new Map(missions.map((m) => [m.id, m.name])), [missions]);

  const enriched = useMemo(
    () => items.map((it) => ({ ...it, _cat: inferCategory(it) })),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((it) => {
      if (!matchesHorizonFilter(it._cat, filter, it)) return false;
      if (!q) return true;
      const hay = `${it.title ?? ""} ${it.summary ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [enriched, filter, search]);

  return (
    <section className="iris-panel rounded-[12px] border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-primary" />
          <h3 className="iris-label">Horizon Feed</h3>
          <LiveBadge />
          <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            What is happening in our industry
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search intelligence…"
            className="w-64 rounded-[8px] border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-background/30 px-5 py-2.5">
        {HORIZON_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`pill-classified ${filter === f ? "is-active" : ""}`}
          >
            {f}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-border max-h-[640px] overflow-y-auto">
        {filtered.length === 0 ? (
          items.length === 0 ? (
            <li><ScanningBeam /></li>
          ) : (
            <li className="px-5 py-12 text-center text-sm text-muted-foreground">
              No items match this filter.
            </li>
          )
        ) : (
          filtered.map((it, idx) => (
            <li
              key={it.id}
              className="px-5 py-4 feed-item"
              style={{ animationDelay: `${Math.min(idx, 12) * 80}ms` }}
            >
              <a
                href={it.url ?? "#"}
                target={it.url ? "_blank" : undefined}
                rel="noreferrer"
                className="block group"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {it._cat && (
                    <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
                      {it._cat}
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{it.source}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground mono">
                    {relativeTime(it.published_at ?? it.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground group-hover:text-primary">
                  <TypewriterText text={it.title ?? ""} speed={15} />
                </p>
                {it.summary && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{it.summary}</p>
                )}
                {it.matched_mission_ids && it.matched_mission_ids.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--iris,#22d3ee)]">● Relevant to</span>
                    {it.matched_mission_ids.slice(0, 4).map((mid) => (
                      <span
                        key={mid}
                        className="rounded-full border border-[color:var(--iris,#22d3ee)]/30 bg-[color:var(--iris,#22d3ee)]/[0.06] px-2 py-0.5 text-[10px] font-medium text-[color:var(--iris,#22d3ee)]"
                      >
                        {missionNameMap.get(mid) ?? "Mission"}
                      </span>
                    ))}
                    {it.matched_mission_ids.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{it.matched_mission_ids.length - 4} more</span>
                    )}
                  </div>
                )}
              </a>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

