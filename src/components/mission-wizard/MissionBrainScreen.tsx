import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";

type GapStatus = "understand" | "learning" | "need";

type Gap = {
  key: string;
  label: string;
  weight: number;
  status: GapStatus;
  fixTo?: string;
};

export function MissionBrainScreen({
  missionId,
  onContinue,
  onJumpToPhase,
}: {
  missionId: string;
  onContinue: () => void;
  onJumpToPhase?: (phase: string) => void;
}) {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [animScore, setAnimScore] = useState(0);

  useEffect(() => {
    (async () => {
      const [
        mission, sections, questions, requirements, criteria,
        risks, themes, competitors, dates, team, memory, intel,
      ] = await Promise.all([
        supabase.from("missions").select("name,client_name,state,submission_deadline").eq("id", missionId).single(),
        supabase.from("mission_sections").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_compliance_requirements").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_evaluation_criteria").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_risks").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("win_themes").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("competitor_profiles").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_timeline").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_team_members").select("mission_role").eq("mission_id", missionId),
        supabase.from("iris_memories").select("category,tags").eq("mission_id", missionId).eq("scope", "mission"),
        supabase.from("iris_memories").select("id", { count: "exact", head: true }).eq("mission_id", missionId).contains("tags", ["intel_drop"]),
      ]);

      const m = (mission.data ?? {}) as {
        name?: string | null;
        client_name?: string | null;
        state?: string | null;
        submission_deadline?: string | null;
      };
      const teamRows = (team.data ?? []) as { mission_role: string | null }[];
      const memRows = (memory.data ?? []) as { category: string | null; tags: string[] | null }[];
      const memoryKeys = new Set(memRows.flatMap((r) => r.tags ?? []));

      const status = (cond: boolean, partial?: boolean): GapStatus =>
        cond ? "understand" : partial ? "learning" : "need";

      const built: Gap[] = [
        { key: "snapshot", label: "Mission snapshot — name, client, state, deadline", weight: 6,
          status: status(!!m.name && !!m.client_name && !!m.state && !!m.submission_deadline,
                          !!m.name || !!m.client_name) },
          status: status(!!m.name && !!m.client_name && !!m.state && !!m.submission_deadline,
                          !!m.name || !!m.client_name) },
        { key: "rfp", label: "RFP read and parsed into sections", weight: 12,
          status: status((sections.count ?? 0) > 0) },
        { key: "questions", label: "Questions extracted", weight: 12,
          status: status((questions.count ?? 0) > 0) },
        { key: "requirements", label: "Compliance requirements detected", weight: 10,
          status: status((requirements.count ?? 0) > 0) },
        { key: "evaluation", label: "Evaluation criteria captured", weight: 10,
          status: status((criteria.count ?? 0) > 0) },
        { key: "dates", label: "Key dates on the timeline", weight: 6,
          status: status((dates.count ?? 0) > 0) },
        { key: "risks", label: "Risks identified", weight: 8,
          status: status((risks.count ?? 0) >= 3, (risks.count ?? 0) > 0) },
        { key: "competitors", label: "Competitor field mapped", weight: 6,
          status: status((competitors.count ?? 0) >= 2, (competitors.count ?? 0) > 0) },
        { key: "themes", label: "Win themes drafted", weight: 8,
          status: status((themes.count ?? 0) >= 2, (themes.count ?? 0) > 0), fixTo: "results" },
        { key: "memory_win", label: "Why we win — captured", weight: 4,
          status: status(memoryKeys.has("win")), fixTo: "memory" },
        { key: "memory_lose", label: "Why we could lose — captured", weight: 4,
          status: status(memoryKeys.has("lose")), fixTo: "memory" },
        { key: "memory_avoid", label: "What to avoid — captured", weight: 3,
          status: status(memoryKeys.has("avoid")), fixTo: "memory" },
        { key: "intel", label: "Stakeholder / political intel dropped", weight: 5,
          status: status((intel.count ?? 0) >= 3, (intel.count ?? 0) > 0), fixTo: "intel" },
        { key: "writers", label: "Writers assigned", weight: 3,
          status: status(teamRows.some((t) => t.mission_role === "writer")), fixTo: "team" },
        { key: "client_sme", label: "Client SMEs assigned", weight: 2,
          status: status(teamRows.some((t) => t.mission_role === "client_sme")), fixTo: "team" },
        { key: "athena_sme", label: "Athena SMEs assigned", weight: 1,
          status: status(teamRows.some((t) => t.mission_role === "athena_sme")), fixTo: "team" },
      ];

      setGaps(built);
      setLoading(false);
    })();
  }, [missionId]);

  const { total, score, counts } = useMemo(() => {
    const total = gaps.reduce((s, g) => s + g.weight, 0) || 1;
    const earned = gaps.reduce((s, g) => s + g.weight * (g.status === "understand" ? 1 : g.status === "learning" ? 0.5 : 0), 0);
    const counts = { understand: 0, learning: 0, need: 0 };
    gaps.forEach((g) => { counts[g.status] += g.weight; });
    return { total, score: Math.round((earned / total) * 100), counts };
  }, [gaps]);

  // animate score up
  useEffect(() => {
    if (loading) return;
    let raf = 0;
    const start = performance.now();
    const from = animScore;
    const to = score;
    const dur = 900;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimScore(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, loading]);

  // SVG arc helpers
  const R = 130;
  const STROKE = 22;
  const CX = 160;
  const CY = 160;
  const CIRC = 2 * Math.PI * R;
  const segUnderstand = (counts.understand / total) * CIRC;
  const segLearning = (counts.learning / total) * CIRC;
  const segNeed = (counts.need / total) * CIRC;

  const remaining = gaps.filter((g) => g.status !== "understand");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A1628", color: "#E8EEF7" }}>
      {/* Header */}
      <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-white/5">
        <IrisMark size={36} />
        <div className="flex-1">
          <div className="text-[12px] uppercase tracking-[0.14em]" style={{ color: "#C49A2B" }}>IRIS · Mission Brain</div>
          <div className="text-[15px] text-white/90 mt-1 max-w-[680px] leading-relaxed">
            Here's my current understanding of this mission. Help me fill the gaps.
          </div>
        </div>
        <button
          onClick={onContinue}
          className="text-[13px] px-4 py-2 rounded-md transition hover:opacity-90"
          style={{ background: "#C49A2B", color: "#0D1B3E" }}
        >
          Continue →
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[960px] grid lg:grid-cols-[360px_1fr] gap-8">
          {/* Radial */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <svg width="320" height="320" className="overflow-visible">
                <defs>
                  <radialGradient id="brain-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(196,154,43,0.25)" />
                    <stop offset="100%" stopColor="rgba(196,154,43,0)" />
                  </radialGradient>
                  <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <circle cx={CX} cy={CY} r={R + 30} fill="url(#brain-glow)" />
                {/* Track */}
                <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
                {/* Segments — rotate -90 so they start at top */}
                <g transform={`rotate(-90 ${CX} ${CY})`} filter="url(#soft-glow)">
                  {/* Understand (green) */}
                  <circle
                    cx={CX} cy={CY} r={R} fill="none" stroke="#7BC47F" strokeWidth={STROKE}
                    strokeDasharray={`${segUnderstand} ${CIRC}`} strokeLinecap="butt"
                    style={{ transition: "stroke-dasharray .9s cubic-bezier(.2,.7,.2,1)" }}
                  />
                  {/* Learning (amber) */}
                  <circle
                    cx={CX} cy={CY} r={R} fill="none" stroke="#E8C26B" strokeWidth={STROKE}
                    strokeDasharray={`${segLearning} ${CIRC - segLearning}`}
                    strokeDashoffset={-segUnderstand}
                    strokeLinecap="butt"
                    style={{ transition: "all .9s cubic-bezier(.2,.7,.2,1)" }}
                  />
                  {/* Need (red outline) */}
                  <circle
                    cx={CX} cy={CY} r={R} fill="none" stroke="#E57373" strokeOpacity={0.55} strokeWidth={STROKE}
                    strokeDasharray={`${segNeed} ${CIRC - segNeed}`}
                    strokeDashoffset={-(segUnderstand + segLearning)}
                    strokeLinecap="butt"
                    style={{ transition: "all .9s cubic-bezier(.2,.7,.2,1)" }}
                  />
                </g>
                {/* Center score */}
                <text x={CX} y={CY - 6} textAnchor="middle" fill="#E8EEF7" fontSize="56" fontWeight={600} letterSpacing="-0.02em">
                  {animScore}%
                </text>
                <text x={CX} y={CY + 22} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11" letterSpacing="0.18em">
                  MISSION UNDERSTANDING
                </text>
              </svg>
            </div>

            {/* Legend */}
            <div className="mt-2 w-full space-y-2">
              <LegendRow color="#7BC47F" label="I Understand"  value={Math.round((counts.understand / total) * 100)} />
              <LegendRow color="#E8C26B" label="I Am Learning" value={Math.round((counts.learning   / total) * 100)} />
              <LegendRow color="#E57373" label="I Still Need"  value={Math.round((counts.need       / total) * 100)} outline />
            </div>
          </div>

          {/* Gap list */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4" style={{ color: "#C49A2B" }} />
              <div className="text-[12px] uppercase tracking-[0.14em] text-white/55">
                {loading ? "Reading my notes…" : remaining.length === 0 ? "Nothing left to fill" : `${remaining.length} item${remaining.length === 1 ? "" : "s"} to fill`}
              </div>
            </div>
            <div className="rounded-xl divide-y divide-white/5" style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,0.08)" }}>
              {loading && (
                <div className="px-4 py-6 flex items-center gap-2 text-white/55 text-[13px]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reconciling everything I know…
                </div>
              )}
              {!loading && gaps.map((g) => <GapRow key={g.key} gap={g} onFix={onJumpToPhase} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label, value, outline }: { color: string; label: string; value: number; outline?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,0.06)" }}>
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: outline ? "transparent" : color, border: outline ? `1.5px solid ${color}` : "none", boxShadow: outline ? "none" : `0 0 10px ${color}55` }}
      />
      <span className="text-[12.5px] text-white/85 flex-1">{label}</span>
      <span className="text-[12px] text-white/55 tabular-nums">{value}%</span>
    </div>
  );
}

function GapRow({ gap, onFix }: { gap: Gap; onFix?: (phase: string) => void }) {
  const isDone = gap.status === "understand";
  const dotColor = gap.status === "understand" ? "#7BC47F" : gap.status === "learning" ? "#E8C26B" : "#E57373";
  const StatusIcon = gap.status === "understand" ? CheckCircle2 : gap.status === "learning" ? Loader2 : AlertTriangle;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="relative">
        <span className="h-2 w-2 rounded-full block" style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}88` }} />
      </span>
      <StatusIcon className="h-3.5 w-3.5 shrink-0" style={{ color: dotColor }} />
      <span className={`flex-1 text-[13.5px] ${isDone ? "text-white/55 line-through decoration-white/20" : "text-white/90"}`}>
        {gap.label}
      </span>
      {!isDone && gap.fixTo && onFix && (
        <button
          onClick={() => onFix(gap.fixTo!)}
          className="text-[12px] inline-flex items-center gap-1 px-2 py-1 rounded-md transition hover:bg-white/5"
          style={{ color: "#C49A2B" }}
        >
          Fix this <ArrowRight className="h-3 w-3" />
        </button>
      )}
      {isDone && (
        <span className="text-[11px] uppercase tracking-wider" style={{ color: "#7BC47F" }}>Solid</span>
      )}
    </div>
  );
}
