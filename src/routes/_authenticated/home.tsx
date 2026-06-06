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
import athenaLogo from "@/assets/athena-logo.png";
import atlasLogo from "@/assets/atlas-logo.png.asset.json";
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
      const firstName = raw.split(/\s+/)[0];
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
        .select("id,mission_id,question_number,title,pens_down_date,health")
        .in("mission_id", missionIds);
      return (data ?? []) as Array<{ id: string; mission_id: string; question_number: string; title: string; pens_down_date: string | null; health: string | null }>;
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
          Loading
        </div>
      </div>
    );
  }

  // PHASE 7 / CHANGE 5: writer with 0 active missions — show only welcome message
  if (myRole === "writer" && writerMissions && writerMissions.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <img src={atlasLogo.url} alt="Atlas" className="mx-auto mb-8 h-24 w-24 object-contain" style={{ filter: "drop-shadow(0 0 20px rgba(125,211,252,0.35))" }} />
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
      <header className="relative border-b border-border bg-gradient-to-b from-surface to-background">
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
          <div className="flex items-center gap-4">
            <button
              type="button"
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

        {/* ROLE-DIFFERENTIATED: Active Missions (leaders) or Your Assignments (writers/SMEs) */}
        {isLeader ? (
          <section>
            <div className="mb-5 flex items-end justify-between gap-4">
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
                title="Atlas is ready."
                subtitle={isAdmin ? "Create your first mission in Olympus to get started." : "No active missions yet. An admin will set things up shortly."}
                cta={
                  isAdmin ? (
                    <Link
                      to="/olympus"
                      className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
                    >
                      Go to Olympus
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null
                }
              />



            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {missions.map((m) => {
                  const qs = missionQuestions.filter((q) => q.mission_id === m.id);
                  return (
                    <MissionCard
                      key={m.id}
                      mission={m}
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
          </section>
        ) : (
          <>
            {/* Day-one trust intro — dismissible, sets IRIS-as-colleague framing */}
            <IrisTrustIntro />

            {/* Cockpit V4 — personal IRIS briefing leads the writer view */}
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
    </div>
  );
}

const DAILY_QUOTES: { quote: string; author: string }[] = [
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "Quality means doing it right when no one is looking.", author: "Henry Ford" },
  { quote: "Excellence is never an accident.", author: "Aristotle" },
  { quote: "What gets measured gets managed.", author: "Peter Drucker" },
  { quote: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { quote: "Strategy without tactics is the slowest route to victory.", author: "Sun Tzu" },
  { quote: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { quote: "If you can't explain it simply, you don't understand it well enough.", author: "Albert Einstein" },
  { quote: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "Make every detail perfect, and limit the number of details to perfect.", author: "Jack Dorsey" },
  { quote: "The function of leadership is to produce more leaders, not more followers.", author: "Ralph Nader" },
  { quote: "Vision without execution is hallucination.", author: "Thomas Edison" },
  { quote: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { quote: "Plans are nothing; planning is everything.", author: "Dwight D. Eisenhower" },
  { quote: "Be regular and orderly in your life so that you may be violent and original in your work.", author: "Gustave Flaubert" },
  { quote: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "Focus is about saying no.", author: "Steve Jobs" },
  { quote: "Slow is smooth, smooth is fast.", author: "Navy SEAL adage" },
  { quote: "Amateurs talk strategy. Professionals talk logistics.", author: "Gen. Omar Bradley" },
  { quote: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { quote: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { quote: "Clarity precedes success.", author: "Robin Sharma" },
  { quote: "What you do every day matters more than what you do once in a while.", author: "Gretchen Rubin" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { quote: "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", author: "Antoine de Saint-Exupéry" },
  { quote: "If you want to go fast, go alone. If you want to go far, go together.", author: "African proverb" },
  { quote: "Operational excellence is everyone's responsibility.", author: "W. Edwards Deming" },
  { quote: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Will Durant" },
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



type MissionCardQ = { id: string; question_number: string; title: string; pens_down_date: string | null; health: string | null };

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
      to="/missions/$missionId/brief"
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

