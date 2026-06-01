import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, TrendingDown, TrendingUp, Minus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/command/scores")({
  component: ScoresPage,
});

type Mission = { id: string; name: string };
type Question = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  evaluation_weight: number | null;
  target_score: number | null;
  current_score: number | null;
  health: string | null;
  status: string | null;
};

function scoreColor(score: number | null, target: number | null): string {
  if (score == null) return "text-muted-foreground";
  const t = target ?? 4.5;
  if (score >= t) return "text-emerald-400";
  if (score >= t - 0.5) return "text-yellow-400";
  return "text-red-400";
}

function gapIcon(score: number | null, target: number | null) {
  if (score == null) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  const t = target ?? 4.5;
  if (score >= t) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
}

function ScoresPage() {
  const [missionId, setMissionId] = useState<string | "all">("all");

  const { data: missions = [] } = useQuery({
    queryKey: ["scores-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name")
        .eq("status", "Active")
        .order("name");
      return (data ?? []) as Mission[];
    },
  });

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["scores-questions", missionId],
    queryFn: async () => {
      let q = supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,evaluation_weight,target_score,current_score,health,status")
        .order("evaluation_weight", { ascending: false, nullsFirst: false });
      if (missionId !== "all") q = q.eq("mission_id", missionId);
      const { data } = await q;
      return (data ?? []) as Question[];
    },
  });

  const summary = useMemo(() => {
    const scored = questions.filter((q) => q.current_score != null);
    const totalWeight = questions.reduce((s, q) => s + (q.evaluation_weight ?? 0), 0);
    const weightedScore = scored.reduce(
      (s, q) => s + (q.current_score ?? 0) * (q.evaluation_weight ?? 0),
      0,
    );
    const weightedTotal = scored.reduce((s, q) => s + (q.evaluation_weight ?? 0), 0);
    const avg = weightedTotal > 0 ? weightedScore / weightedTotal : null;
    const belowTarget = scored.filter((q) => (q.current_score ?? 0) < (q.target_score ?? 4.5)).length;
    return {
      total: questions.length,
      scored: scored.length,
      avg,
      totalWeight,
      belowTarget,
    };
  }, [questions]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Trophy className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Score Watch</h1>
          <p className="text-sm text-muted-foreground">
            Current vs. target scores across every evaluated question, weighted by importance.
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMissionId("all")}
          className={`rounded-full px-3 py-1 text-xs ${
            missionId === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
          }`}
        >
          All Missions
        </button>
        {missions.map((m) => (
          <button
            key={m.id}
            onClick={() => setMissionId(m.id)}
            className={`rounded-full px-3 py-1 text-xs ${
              missionId === m.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Weighted Avg" value={summary.avg != null ? summary.avg.toFixed(2) : "—"} />
        <StatCard label="Questions Scored" value={`${summary.scored} / ${summary.total}`} />
        <StatCard label="Below Target" value={String(summary.belowTarget)} tone={summary.belowTarget > 0 ? "warn" : "ok"} />
        <StatCard label="Total Weight" value={summary.totalWeight.toFixed(1)} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Question</th>
              <th className="px-4 py-3 text-right">Weight</th>
              <th className="px-4 py-3 text-right">Current</th>
              <th className="px-4 py-3 text-right">Target</th>
              <th className="px-4 py-3 text-right">Gap</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && questions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No questions to display.
                </td>
              </tr>
            )}
            {questions.map((q) => {
              const gap = q.current_score != null ? q.current_score - (q.target_score ?? 4.5) : null;
              return (
                <tr key={q.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to="/missions/$missionId/questions/$questionId"
                      params={{ missionId: q.mission_id, questionId: q.id }}
                      className="hover:underline text-foreground"
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">{q.question_number}</span>
                      {q.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {q.evaluation_weight != null ? q.evaluation_weight.toFixed(1) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${scoreColor(q.current_score, q.target_score)}`}>
                    {q.current_score != null ? q.current_score.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {q.target_score != null ? q.target_score.toFixed(1) : "4.5"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1">
                      {gapIcon(q.current_score, q.target_score)}
                      <span className={scoreColor(q.current_score, q.target_score)}>
                        {gap != null ? (gap >= 0 ? "+" : "") + gap.toFixed(1) : "—"}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {(q.status ?? "—").replace(/_/g, " ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "ok" }) {
  const toneClass =
    tone === "warn" ? "text-yellow-400" : tone === "ok" ? "text-emerald-400" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
