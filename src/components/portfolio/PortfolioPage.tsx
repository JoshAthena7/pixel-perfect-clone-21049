/**
 * Portfolio — executive home. Read-only summary across all active
 * missions: counts, IRIS brief, mission health cards.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { format, differenceInDays, formatDistanceToNow } from "date-fns";
import { MessageSquare, AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIris } from "@/components/iris/IrisContext";
import { Skeleton } from "@/components/ui/skeleton";
import { getPortfolioBrief } from "@/lib/v2-home.functions";

const GOLD = "#C9A55C";

type Props = {
  onOpenIris: () => void;
};

type Mission = {
  id: string;
  name: string;
  client_name: string | null;
  program_type: string | null;
  submission_deadline: string | null;
};

export function PortfolioPage({ onOpenIris }: Props) {
  const iris = useIris();
  useEffect(() => {
    iris.setSection(null, "Portfolio");
  }, [iris]);

  // Stats + mission list
  const { data, isLoading } = useQuery({
    queryKey: ["portfolio-overview"],
    queryFn: async () => {
      const { data: missions } = await supabase
        .from("missions")
        .select("id, name, client_name, program_type, submission_deadline")
        .eq("status", "active");
      const list = (missions ?? []) as Mission[];
      const ids = list.map((m) => m.id);
      const [atRisk, decisions, allQs] = await Promise.all([
        ids.length
          ? supabase
              .from("mission_questions")
              .select("id, mission_id, health_status")
              .in("mission_id", ids)
          : Promise.resolve({ data: [] as Array<{ id: string; mission_id: string; health_status: string }> }),
        ids.length
          ? supabase
              .from("mission_decisions")
              .select("id, mission_id")
              .in("mission_id", ids)
              .eq("status", "Pending")
          : Promise.resolve({ data: [] as Array<{ id: string; mission_id: string }> }),
        ids.length
          ? supabase
              .from("mission_questions")
              .select("mission_id, status")
              .in("mission_id", ids)
          : Promise.resolve({ data: [] as Array<{ mission_id: string; status: string }> }),
      ]);
      return {
        missions: list,
        questions: (atRisk.data ?? []) as Array<{ id: string; mission_id: string; health_status: string }>,
        decisions: (decisions.data ?? []) as Array<{ id: string; mission_id: string }>,
        allQuestions: (allQs.data ?? []) as Array<{ mission_id: string; status: string }>,
      };
    },
  });

  const stats = useMemo(() => {
    if (!data) {
      return { active: 0, atRisk: 0, decisions: 0, soonestDays: null as number | null };
    }
    const active = data.missions.length;
    const atRisk = data.questions.filter((q) => q.health_status === "at_risk").length;
    const dec = data.decisions.length;
    const deadlines = data.missions
      .map((m) => m.submission_deadline)
      .filter(Boolean) as string[];
    const soonest = deadlines.length
      ? Math.min(...deadlines.map((d) => differenceInDays(new Date(d), new Date())))
      : null;
    return { active, atRisk, decisions: dec, soonestDays: soonest };
  }, [data]);

  // IRIS exec brief (4h client cache)
  const briefFn = useServerFn(getPortfolioBrief);
  const { data: brief, refetch: refetchBrief, isFetching: briefLoading } = useQuery({
    queryKey: ["portfolio-iris-brief"],
    queryFn: () => briefFn({ data: {} }),
    staleTime: 4 * 60 * 60_000,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-[22px] font-medium">Portfolio</h1>
          <p className="text-white/50 text-[13px] mt-0.5">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <button
          type="button"
          onClick={onOpenIris}
          className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium"
          style={{
            background: "rgba(127,119,221,0.12)",
            border: "1px solid rgba(127,119,221,0.3)",
            color: "rgba(200,195,255,0.9)",
            padding: "6px 14px",
          }}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Ask IRIS
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Missions" value={isLoading ? "—" : String(stats.active)} />
        <StatCard
          label="Questions at Risk"
          value={isLoading ? "—" : String(stats.atRisk)}
          tone={stats.atRisk > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="Decisions Needed"
          value={isLoading ? "—" : String(stats.decisions)}
          tone={stats.decisions > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="Soonest Deadline"
          value={
            isLoading
              ? "—"
              : stats.soonestDays === null
                ? "—"
                : stats.soonestDays < 0
                  ? `${Math.abs(stats.soonestDays)}d past`
                  : `${stats.soonestDays} days`
          }
        />
      </div>

      {/* IRIS brief */}
      <div
        className="rounded-[10px] p-5"
        style={{
          background: "rgba(127,119,221,0.07)",
          border: "0.5px solid rgba(127,119,221,0.2)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: "#A78BFA" }} />
            <span className="text-[12px] font-medium" style={{ color: "rgba(200,195,255,0.9)" }}>
              IRIS — What needs your attention
            </span>
          </div>
          <button
            type="button"
            onClick={() => refetchBrief()}
            className="text-[11px] text-white/40 hover:text-white/60"
          >
            {briefLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {briefLoading && !brief ? (
          <Skeleton className="h-16" />
        ) : (
          <p className="text-white italic text-[13px] leading-relaxed">
            {brief?.brief ?? "Brief will appear here."}
          </p>
        )}
        {brief?.generatedAt && (
          <p className="text-[11px] text-white/40 mt-2">
            Brief generated {formatDistanceToNow(new Date(brief.generatedAt), { addSuffix: true })}
          </p>
        )}
      </div>

      {/* Mission cards */}
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : data?.missions.length === 0 ? (
        <div className="text-center text-white/50 py-12">No active missions.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.missions.map((m) => (
            <MissionHealthCard
              key={m.id}
              mission={m}
              questions={data.allQuestions.filter((q) => q.mission_id === m.id)}
              atRiskCount={data.questions.filter((q) => q.mission_id === m.id && q.health_status === "at_risk").length}
              decisionCount={data.decisions.filter((d) => d.mission_id === m.id).length}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  const danger = tone === "danger";
  return (
    <div
      className="rounded-[10px] p-4"
      style={{
        background: danger ? "rgba(224,74,74,0.08)" : "rgba(255,255,255,0.03)",
        border: `0.5px solid ${danger ? "rgba(224,74,74,0.25)" : "rgba(255,255,255,0.07)"}`,
      }}
    >
      <div className="text-white text-[28px] font-medium leading-tight">{value}</div>
      <div className="text-white/50 text-[12px] mt-0.5">{label}</div>
    </div>
  );
}

function MissionHealthCard({
  mission,
  questions,
  atRiskCount,
  decisionCount,
}: {
  mission: Mission;
  questions: Array<{ status: string }>;
  atRiskCount: number;
  decisionCount: number;
}) {
  const days = mission.submission_deadline
    ? differenceInDays(new Date(mission.submission_deadline), new Date())
    : null;
  const dayColor =
    days === null
      ? "text-white"
      : days < 14
        ? "text-red-400"
        : days < 30
          ? "text-amber-400"
          : "text-white";
  const total = questions.length;
  const complete = questions.filter((q) => q.status === "complete").length;
  const pct = total ? Math.round((complete / total) * 100) : 0;

  return (
    <Link
      to="/olympus/missions/$missionId"
      params={{ missionId: mission.id }}
      className="block rounded-[10px] p-4 hover:bg-white/5 transition-colors"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-white text-[14px] font-medium truncate">{mission.name}</h3>
          <p className="text-white/50 text-[12px] truncate">
            {[mission.client_name, mission.program_type].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {days !== null && (
          <div className={`text-[20px] font-medium tabular-nums ${dayColor}`}>
            {days < 0 ? `${Math.abs(days)}d` : `${days}d`}
          </div>
        )}
      </div>
      <div className="mt-3 h-[5px] rounded-full bg-white/8 overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: pct < 50 ? "#f0b440" : "#7dcf7d" }}
        />
      </div>
      <p className="text-white/45 text-[11px] mt-1.5">
        {pct}% complete · {atRiskCount} at risk · {total - complete} open
      </p>
      {decisionCount > 0 && (
        <div
          className="mt-2 rounded px-2 py-1 text-[11px] text-amber-300 flex items-center gap-1.5"
          style={{ background: "rgba(239,159,39,0.08)" }}
        >
          <AlertTriangle className="h-3 w-3" />
          {decisionCount} decision{decisionCount === 1 ? "" : "s"} need your input
          <ExternalLink className="h-3 w-3 ml-auto" />
        </div>
      )}
      {atRiskCount > 0 && (
        <div
          className="mt-1 rounded px-2 py-1 text-[11px] text-red-300 flex items-center gap-1.5"
          style={{ background: "rgba(224,74,74,0.08)" }}
        >
          <AlertTriangle className="h-3 w-3" />
          {atRiskCount} question{atRiskCount === 1 ? "" : "s"} at risk
        </div>
      )}
    </Link>
  );
}
