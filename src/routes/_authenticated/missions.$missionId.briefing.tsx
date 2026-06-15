import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Plane,
  Target,
  Trophy,
  Brain,
  Eye,
  AlertTriangle,
  RefreshCw,
  Megaphone,
  Users,
  Mail,
  ArrowRight,
  Check,
  Plus,
  Sparkles,
  ShieldCheck,
  Heart,
  Zap,
  AlertCircle,
} from "lucide-react";
import { OracleCanvas } from "@/components/briefing-room/OracleCanvas";
import { useMissionAccess } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated/missions/$missionId/briefing")({
  component: BriefingPage,
});

/* ───────────────── Design tokens ───────────────── */
const NAVY = "#081A2B";
const NAVY_2 = "#0d2238";
const GOLD = "#D4AF37";
const GOLD_SOFT = "#e8c75a";
const TEXT = "#ffffff";
const META = "rgba(255,255,255,0.55)";
const META_SOFT = "rgba(255,255,255,0.4)";

const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
  padding: 24,
};

const cardLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: GOLD,
  fontWeight: 700,
};

/* ───────────────── Page ───────────────── */
function BriefingPage() {
  const { missionId } = Route.useParams();

  const { data: mission } = useQuery({
    queryKey: ["briefing-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select(
          "name, client_name, status, health_score, state_code, state, submission_deadline, blast_off_at, iris_disclaimer, why_it_matters, why_win, today_focus, how_we_win, mission_journey, watch_items",
        )
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.7; }
          70% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(0.95); opacity: 0; }
        }
      `}</style>
      <div style={{ background: NAVY, color: TEXT, minHeight: "100vh" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-8 py-8" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <HeroCard missionId={missionId} mission={mission} />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3"><TodaysFocusCard missionId={missionId} mission={mission} /></div>
            <div className="lg:col-span-2"><HowWeWinCard missionId={missionId} mission={mission} /></div>
          </div>

          <MissionJourneyCard mission={mission} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <IrisGuidanceCard mission={mission} />
            <EvaluatorLensCard mission={mission} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <WatchItemsCard missionId={missionId} mission={mission} />
            <WhatChangedCard missionId={missionId} />
            <LeadershipBroadcastCard />
          </div>

          <MissionLeadersCard missionId={missionId} />
        </div>
      </div>
    </>
  );
}

/* ───────────────── 1. Hero ───────────────── */
function HeroCard({ missionId, mission }: { missionId: string; mission: any }) {
  const navigate = useNavigate();
  const subDate = mission?.submission_deadline ? new Date(mission.submission_deadline) : null;
  const daysRemaining = subDate
    ? Math.max(0, Math.ceil((subDate.getTime() - Date.now()) / 86400000))
    : null;

  const health = mission?.health_score;
  const onTrack = health == null || health >= 70;
  const healthLabel = health == null
    ? "MISSION HEALTH: ON TRACK"
    : health >= 70
    ? "MISSION HEALTH: ON TRACK"
    : health >= 40
    ? "MISSION HEALTH: AT RISK"
    : "MISSION HEALTH: CRITICAL";
  const healthColor = health == null || health >= 70 ? "#4ade80" : health >= 40 ? "#f59e0b" : "#ef4444";

  // Next milestone via mission_milestones
  const { data: nextMilestone } = useQuery({
    queryKey: ["briefing-next-milestone", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_milestones")
        .select("title, milestone_date")
        .eq("mission_id", missionId)
        .gte("milestone_date", new Date().toISOString())
        .order("milestone_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
  const msDate = nextMilestone?.milestone_date ? new Date(nextMilestone.milestone_date) : subDate;
  const msDays = msDate ? Math.max(0, Math.ceil((msDate.getTime() - Date.now()) / 86400000)) : null;
  const msName = nextMilestone?.title ?? "Submission";

  return (
    <section style={{ ...glass, padding: 32 }}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
        {/* LEFT 60% */}
        <div className="lg:col-span-3 relative">
          <StateMap stateCode={mission?.state_code} />
          <div className="relative">
            <h1 className="font-bold" style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
              {mission?.name ?? "Mission"}
            </h1>
            <div className="mt-2" style={{ fontSize: 20, color: GOLD, fontWeight: 500 }}>
              {mission?.client_name ?? "—"}
            </div>

            <div
              className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full"
              style={{
                background: `${healthColor}22`,
                border: `1px solid ${healthColor}55`,
                color: healthColor,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
              }}
            >
              {onTrack ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {healthLabel}
            </div>

            <p className="mt-5 italic" style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
              "Preserving Trust. Advancing the Future."
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ fontSize: 13, color: META }}>
              <span className="flex items-center gap-2">
                <Calendar size={15} style={{ color: GOLD }} />
                Submission:{" "}
                <span style={{ color: TEXT, fontWeight: 600 }}>
                  {subDate
                    ? subDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "TBD"}
                </span>
              </span>
              {daysRemaining !== null && (
                <span className="flex items-center gap-2">
                  <Clock size={15} style={{ color: GOLD }} />
                  <span style={{ color: TEXT, fontWeight: 600 }}>{daysRemaining}</span> Days Remaining
                </span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT 40% */}
        <div className="lg:col-span-2 lg:pl-8 lg:border-l" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-2" style={cardLabel}>
            <Sparkles size={12} /> Next Milestone
          </div>
          <h3 className="mt-3 font-bold" style={{ fontSize: 24, lineHeight: 1.2 }}>
            {msName}
          </h3>
          {msDays !== null && (
            <div className="mt-2" style={{ fontSize: 16, color: GOLD, fontWeight: 600 }}>
              {msDays} Days Remaining
            </div>
          )}
          <button
            onClick={() => navigate({ to: "/missions/$missionId/flight-deck", params: { missionId } })}
            className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl py-4 transition-all"
            style={{
              background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_SOFT} 100%)`,
              color: NAVY,
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: "0.08em",
              boxShadow: `0 8px 24px ${GOLD}55`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          >
            <Plane size={18} /> ENTER FLIGHT DECK
          </button>
        </div>
      </div>
    </section>
  );
}

function StateMap({ stateCode }: { stateCode?: string | null }) {
  // Subtle abstract polygon — gives a sense of a state map silhouette.
  return (
    <svg
      width="220"
      height="180"
      viewBox="0 0 220 180"
      style={{ position: "absolute", top: -10, right: -10, opacity: 0.08, pointerEvents: "none" }}
      aria-hidden
    >
      <polygon
        points="80,10 140,20 170,50 175,90 165,130 140,160 100,170 70,150 50,110 55,70 65,35"
        fill={GOLD}
      />
      {stateCode && (
        <text x="110" y="100" textAnchor="middle" fontSize="48" fontWeight="800" fill={NAVY} opacity="0.3">
          {stateCode}
        </text>
      )}
    </svg>
  );
}

/* ───────────────── 2a. Today's Focus ───────────────── */
function TodaysFocusCard({ missionId, mission }: { missionId: string; mission?: any }) {
  const { data: brief } = useQuery({
    queryKey: ["briefing-todays-focus", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_intelligence_briefs")
        .select("content, key_intelligence_summary, created_at")
        .eq("mission_id", missionId)
        .order("brief_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const items = extractFocusItems(brief?.content, brief?.key_intelligence_summary);
  const fallback = (mission?.today_focus ?? "").trim();
  const fallbackItems = fallback
    ? fallback.split(/\n+/).map((s: string) => s.trim()).filter(Boolean)
    : [];
  const finalItems = items.length > 0 ? items : fallbackItems;
  const time = brief?.created_at
    ? new Date(brief.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section style={glass}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-2" style={cardLabel}>
          <Target size={14} /> Today's Focus
        </div>
        {time && (
          <div style={{ fontSize: 11, color: META_SOFT }}>
            Generated by IRIS · {time}
          </div>
        )}
      </div>
      {finalItems.length === 0 ? (
        <EmptyState>IRIS will generate today's focus items. Check back soon, or add a manual focus note in mission settings.</EmptyState>
      ) : (
        <ol className="space-y-4">
          {finalItems.slice(0, 4).map((item: string, i: number) => (
            <li key={i} className="flex gap-4">
              <span
                className="shrink-0 grid place-items-center rounded-lg font-bold"
                style={{
                  width: 32,
                  height: 32,
                  background: `${GOLD}22`,
                  color: GOLD,
                  fontSize: 14,
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.55, color: "rgba(255,255,255,0.92)" }}>
                {item}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function extractFocusItems(content: any, summary?: string | null): string[] {
  if (Array.isArray(content?.focus_items)) return content.focus_items.filter((s: any) => typeof s === "string");
  if (Array.isArray(content?.items)) return content.items.filter((s: any) => typeof s === "string");
  if (typeof content === "string") return [content];
  if (summary) return summary.split(/\n+/).filter((l) => l.trim().length > 0);
  return [];
}

/* ───────────────── 2b. How We Win ───────────────── */
function HowWeWinCard({ missionId, mission }: { missionId: string; mission?: any }) {
  const { data: themes = [] } = useQuery({
    queryKey: ["briefing-win-themes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_win_themes")
        .select("id, title, why_it_matters, icon")
        .eq("mission_id", missionId)
        .eq("status", "active")
        .order("display_order", { ascending: true })
        .limit(4);
      return data ?? [];
    },
  });

  const tints = [
    { bg: "rgba(91,155,213,0.15)", border: "rgba(91,155,213,0.35)", color: "#5b9bd5", icon: ShieldCheck },
    { bg: "rgba(45,212,170,0.15)", border: "rgba(45,212,170,0.35)", color: "#2dd4aa", icon: Sparkles },
    { bg: "rgba(212,175,55,0.18)", border: "rgba(212,175,55,0.4)", color: GOLD, icon: Trophy },
    { bg: "rgba(244,114,114,0.15)", border: "rgba(244,114,114,0.35)", color: "#f47272", icon: Heart },
  ];

  return (
    <section style={glass}>
      <div className="flex items-center gap-2 mb-5" style={cardLabel}>
        <Trophy size={14} /> How We Win
      </div>
      {themes.length === 0 ? (
        (mission?.how_we_win ?? "").trim() ? (
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {mission.how_we_win}
          </div>
        ) : (
          <EmptyState>Add win themes in the Setup Wizard.</EmptyState>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {themes.map((t: any, i: number) => {
            const tint = tints[i % tints.length];
            const Icon = tint.icon;
            return (
              <div
                key={t.id}
                className="p-3"
                style={{
                  background: tint.bg,
                  border: `1px solid ${tint.border}`,
                  borderRadius: 12,
                }}
              >
                <Icon size={16} style={{ color: tint.color }} />
                <div
                  className="mt-2 font-bold uppercase"
                  style={{ fontSize: 11, letterSpacing: "0.06em", color: TEXT, lineHeight: 1.3 }}
                >
                  {t.title}
                </div>
                {t.why_it_matters && (
                  <div
                    className="mt-1.5"
                    style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}
                  >
                    {truncate(t.why_it_matters, 80)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ───────────────── 3. Mission Journey ───────────────── */
function MissionJourneyCard({ mission }: { mission: any }) {
  const stages = ["Kickoff", "Strategy", "Team", "Writing", "Pink Team", "Red Team", "Submission"];
  const currentIndex = computeJourneyIndex(mission);

  const subDate = mission?.submission_deadline ? new Date(mission.submission_deadline) : null;
  const subDays = subDate ? Math.max(0, Math.ceil((subDate.getTime() - Date.now()) / 86400000)) : null;

  return (
    <section style={glass}>
      <div className="flex items-center gap-2 mb-8" style={cardLabel}>
        <Plane size={14} /> Mission Journey
      </div>

      {/* Timeline */}
      <div className="relative">
        <div
          className="absolute left-0 right-0"
          style={{
            top: 20,
            height: 2,
            background: "rgba(255,255,255,0.08)",
          }}
        />
        <div
          className="absolute left-0"
          style={{
            top: 20,
            height: 2,
            width: `${(currentIndex / (stages.length - 1)) * 100}%`,
            background: GOLD,
            transition: "width 600ms ease",
          }}
        />
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${stages.length}, 1fr)` }}>
          {stages.map((stage, i) => {
            const isComplete = i < currentIndex;
            const isCurrent = i === currentIndex;
            return (
              <div key={stage} className="flex flex-col items-center text-center">
                <div className="relative" style={{ width: 40, height: 40 }}>
                  {isCurrent && (
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        border: `2px solid #5b9bd5`,
                        animation: "pulse-ring 2s infinite",
                      }}
                    />
                  )}
                  <div
                    className="grid place-items-center"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: isComplete ? GOLD : isCurrent ? "#5b9bd5" : NAVY_2,
                      border: isComplete
                        ? "none"
                        : isCurrent
                        ? "none"
                        : "1px solid rgba(255,255,255,0.2)",
                      color: isComplete ? NAVY : TEXT,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {isComplete ? (
                      <Check size={18} strokeWidth={3} />
                    ) : isCurrent ? (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: TEXT }} />
                    ) : null}
                  </div>
                </div>
                <div
                  className="mt-3 font-bold"
                  style={{ fontSize: 12, color: isCurrent || isComplete ? TEXT : META_SOFT }}
                >
                  {stage}
                </div>
                <div style={{ fontSize: 10, color: META_SOFT, marginTop: 2, height: 14 }}>
                  {isComplete ? "Complete" : isCurrent ? "Active" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Metadata boxes */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="p-5"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
          }}
        >
          <div style={cardLabel}>Current Phase</div>
          <div className="mt-2 font-bold" style={{ fontSize: 18 }}>
            {stages[currentIndex]}
          </div>
        </div>
        <div
          className="p-5"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
          }}
        >
          <div style={cardLabel}>Next Milestone</div>
          <div className="mt-2 font-bold" style={{ fontSize: 18 }}>
            {currentIndex < stages.length - 1 ? stages[currentIndex + 1] : "Submission"}
          </div>
          {subDate && (
            <div className="mt-1" style={{ fontSize: 13, color: GOLD }}>
              {subDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              {subDays !== null && ` · ${subDays} days remaining`}
            </div>
          )}
        </div>
      </div>
      {(mission?.mission_journey ?? "").trim() && (
        <div
          className="mt-6 p-4"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            fontSize: 13.5,
            color: "rgba(255,255,255,0.8)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {mission.mission_journey}
        </div>
      )}
    </section>
  );
}

function computeJourneyIndex(mission: any): number {
  if (!mission) return 0;
  const status = (mission.status ?? "").toLowerCase();
  const map: Record<string, number> = {
    kickoff: 0,
    strategy: 1,
    team: 2,
    writing: 3,
    pink_team: 4,
    red_team: 5,
    submission: 6,
    submitted: 6,
  };
  if (map[status] !== undefined) return map[status];
  if (mission.blast_off_at && new Date(mission.blast_off_at) < new Date()) return 3;
  return 1;
}

/* ───────────────── 4a. IRIS Guidance ───────────────── */
function IrisGuidanceCard({ mission }: { mission: any }) {
  const text = (mission?.iris_disclaimer ?? "").trim();
  const lines = text ? text.split(/\n+/).filter((l: string) => l.trim()) : [];
  const headline1 = lines[0] ?? `${mission?.state ?? "The state"} is not buying disruption.`;
  const headline2 = lines[1] ?? `${mission?.state ?? "The state"} is buying confidence.`;
  const support = lines.slice(2).join(" ") || (mission?.why_win ?? "");

  return (
    <section
      style={{
        ...glass,
        background:
          "linear-gradient(135deg, rgba(91,155,213,0.08) 0%, rgba(167,139,250,0.06) 100%), rgba(255,255,255,0.05)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* IRIS orb */}
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        style={{ position: "absolute", top: -20, right: -20, opacity: 0.5 }}
        aria-hidden
      >
        <defs>
          <radialGradient id="iris-orb" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#5b9bd5" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#5b9bd5" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="55" fill="url(#iris-orb)" />
        <circle cx="60" cy="60" r="18" fill={GOLD} opacity="0.7" />
        <circle cx="60" cy="60" r="6" fill={NAVY} />
      </svg>

      <div className="flex items-center gap-2 mb-5 relative" style={cardLabel}>
        <Brain size={14} /> IRIS Guidance
      </div>
      <p
        className="italic relative"
        style={{ fontSize: 24, lineHeight: 1.35, fontWeight: 300, color: TEXT }}
      >
        {headline1}
        <br />
        <span style={{ color: GOLD_SOFT }}>{headline2}</span>
      </p>
      {support && (
        <p className="mt-5 relative" style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
          {support}
        </p>
      )}
    </section>
  );
}

/* ───────────────── 4b. Evaluator Lens ───────────────── */
function EvaluatorLensCard({ mission }: { mission: any }) {
  const defaults = [
    { icon: Heart, color: "#f472b6", label: "Continuity of services" },
    { icon: ShieldCheck, color: "#5b9bd5", label: "Provider confidence" },
    { icon: Users, color: "#a78bfa", label: "Family trust" },
    { icon: Zap, color: "#f59e0b", label: "Crisis response readiness" },
    { icon: AlertTriangle, color: "#ef4444", label: "Implementation risk" },
  ];

  // If state_priorities exists, parse short lines from it (kept simple)
  const fromMission = (mission?.state_priorities ?? "")
    .split(/\n+/)
    .map((l: string) => l.trim())
    .filter((l: string) => l && l.length < 60)
    .slice(0, 5);

  const items =
    fromMission.length > 0
      ? fromMission.map((label: string, i: number) => ({ ...defaults[i % defaults.length], label }))
      : defaults;

  const left = items.slice(0, Math.ceil(items.length / 2));
  const right = items.slice(Math.ceil(items.length / 2));

  return (
    <section style={glass}>
      <div className="flex items-center gap-2 mb-2" style={cardLabel}>
        <Eye size={14} /> Evaluator Lens
      </div>
      <div className="mb-5" style={{ fontSize: 12, color: META_SOFT }}>
        What evaluators care about most:
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <ul className="space-y-3">
          {left.map((it: typeof defaults[number], i: number) => (
            <LensItem key={`l-${i}`} {...it} />
          ))}
        </ul>
        <ul className="space-y-3">
          {right.map((it: typeof defaults[number], i: number) => (
            <LensItem key={`r-${i}`} {...it} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function LensItem({ icon: Icon, color, label }: { icon: any; color: string; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className="grid place-items-center shrink-0"
        style={{ width: 28, height: 28, borderRadius: 8, background: `${color}22`, color }}
      >
        <Icon size={14} />
      </span>
      <span style={{ fontSize: 13.5, color: "rgba(255,255,255,0.9)" }}>{label}</span>
    </li>
  );
}

/* ───────────────── 5a. Watch Items ───────────────── */
function WatchItemsCard({ missionId, mission }: { missionId: string; mission?: any }) {
  const { data: items = [] } = useQuery({
    queryKey: ["briefing-watch-items", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_risks")
        .select("id, title, severity")
        .eq("mission_id", missionId)
        .eq("status", "active")
        .order("severity", { ascending: true })
        .limit(4);
      return data ?? [];
    },
  });

  if (items.length === 0) {
    const fallback = (mission?.watch_items ?? "").trim();
    return (
      <section style={glass}>
        <div className="flex items-center gap-2 mb-4" style={cardLabel}>
          <AlertTriangle size={14} /> Watch Items
        </div>
        {fallback ? (
          <ul className="space-y-3">
            {fallback.split(/\n+/).map((line: string, i: number) => line.trim() && (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 mt-1.5" style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
                <span style={{ fontSize: 13.5, color: "rgba(255,255,255,0.9)", lineHeight: 1.5 }}>{line.trim()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No active watch items.</EmptyState>
        )}
      </section>
    );
  }

  return (
    <section style={glass}>
      <div className="flex items-center gap-2 mb-4" style={cardLabel}>
        <AlertTriangle size={14} /> Watch Items
      </div>
      <ul className="space-y-3">
        {items.map((it: any) => (
          <li key={it.id} className="flex items-start gap-3">
            <span
              className="shrink-0 mt-1.5"
              style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }}
            />
            <span style={{ fontSize: 13.5, color: "rgba(255,255,255,0.9)", lineHeight: 1.5 }}>
              {it.title}
            </span>
          </li>
        ))}
      </ul>
      <Link
        to="/missions/$missionId/flight-deck"
        params={{ missionId }}
        className="inline-flex items-center gap-1 mt-5"
        style={{ color: GOLD, fontSize: 12, fontWeight: 700 }}
      >
        View all watch items <ArrowRight size={12} />
      </Link>
    </section>
  );
}

/* ───────────────── 5b. What Changed ───────────────── */
function WhatChangedCard({ missionId }: { missionId: string }) {
  const { data: events = [] } = useQuery({
    queryKey: ["briefing-what-changed", missionId],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("intel_events")
        .select("id, title, event_type, created_at")
        .eq("mission_id", missionId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <section style={glass}>
      <div className="flex items-center gap-2 mb-4" style={cardLabel}>
        <RefreshCw size={14} /> What Changed
      </div>
      {events.length === 0 ? (
        <EmptyState>No changes in the last 24 hours.</EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {events.map((ev: any) => {
              const resolved = String(ev.event_type ?? "").includes("resolv");
              return (
                <li key={ev.id} className="flex items-start gap-2">
                  <span
                    className="shrink-0 mt-0.5 font-bold"
                    style={{
                      color: resolved ? "rgba(255,255,255,0.4)" : "#4ade80",
                      fontSize: 14,
                      width: 14,
                      textAlign: "center",
                    }}
                  >
                    {resolved ? "✓" : <Plus size={12} strokeWidth={3} />}
                  </span>
                  <span
                    style={{
                      fontSize: 13.5,
                      color: resolved ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.9)",
                      lineHeight: 1.5,
                    }}
                  >
                    {ev.title}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link
            to="/missions/$missionId/oracle"
            params={{ missionId }}
            className="inline-flex items-center gap-1 mt-5"
            style={{ color: GOLD, fontSize: 12, fontWeight: 700 }}
          >
            View all updates <ArrowRight size={12} />
          </Link>
        </>
      )}
    </section>
  );
}

/* ───────────────── 5c. Leadership Broadcast ───────────────── */
function LeadershipBroadcastCard() {
  // No persisted column for this yet — show a polished placeholder
  return (
    <section style={glass}>
      <div className="flex items-center gap-2 mb-4" style={cardLabel}>
        <Megaphone size={14} /> Leadership Broadcast
      </div>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 48, color: GOLD, lineHeight: 1, marginBottom: -8 }}>
        “
      </div>
      <p className="italic" style={{ fontSize: 17, lineHeight: 1.5, color: "rgba(255,255,255,0.92)" }}>
        Win this one. The families in this state deserve continuity, and our team is the
        right team to deliver it.
      </p>
      <div className="mt-4 text-right" style={{ color: GOLD, fontSize: 13, fontWeight: 600 }}>
        — Leadership
      </div>
    </section>
  );
}

/* ───────────────── 6. Mission Leaders ───────────────── */
function MissionLeadersCard({ missionId }: { missionId: string }) {
  const { data: members = [] } = useQuery({
    queryKey: ["briefing-leaders", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_team_members")
        .select(
          "id, mission_role, atlas_team_members:member_id(first_name, last_name, job_title, email, avatar_url)",
        )
        .eq("mission_id", missionId)
        .limit(12);
      return data ?? [];
    },
  });

  return (
    <section style={glass}>
      <div className="flex items-center gap-2 mb-5" style={cardLabel}>
        <Users size={14} /> Mission Leaders
      </div>
      {members.length === 0 ? (
        <EmptyState>Add team members in the Setup Wizard.</EmptyState>
      ) : (
        <div className="flex flex-wrap gap-6">
          {members.map((m: any) => {
            const p = m.atlas_team_members ?? {};
            const name =
              [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Team Member";
            const initials =
              (p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "") || name.slice(0, 2).toUpperCase();
            return (
              <div key={m.id} className="flex flex-col items-center text-center" style={{ width: 140 }}>
                <div
                  className="grid place-items-center font-bold"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: p.avatar_url
                      ? `center/cover url(${p.avatar_url})`
                      : `linear-gradient(135deg, ${GOLD}, ${GOLD_SOFT})`,
                    color: NAVY,
                    fontSize: 18,
                    border: "2px solid rgba(255,255,255,0.15)",
                  }}
                >
                  {!p.avatar_url && initials.toUpperCase()}
                </div>
                <div className="mt-3 font-bold" style={{ fontSize: 13.5 }}>
                  {name}
                </div>
                <div style={{ fontSize: 11.5, color: GOLD, marginTop: 2 }}>
                  {m.mission_role ?? p.job_title ?? "Contributor"}
                </div>
                {p.email && (
                  <a
                    href={`mailto:${p.email}`}
                    className="mt-2 grid place-items-center"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.06)",
                      color: META,
                    }}
                  >
                    <Mail size={12} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ───────────────── Shared bits ───────────────── */
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13.5,
        color: META_SOFT,
        fontStyle: "italic",
        padding: "12px 0",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}
