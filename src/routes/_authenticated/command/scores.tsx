import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { Trophy, Plus, X, ArrowUpDown } from "lucide-react";
import { AttentionBadge } from "@/components/v2/AttentionBadge";

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
  status: string | null;
};

const TARGET = 4.5;
const GATES = ["Pink Team", "Red Team", "Gold Team", "Final"] as const;

type SortKey = "score" | "weight" | "number";

function ScoresPage() {
  const qc = useQueryClient();
  const [missionId, setMissionId] = useState<string | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(true);
  const [showBatch, setShowBatch] = useState(false);

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
        .select("id,mission_id,question_number,title,evaluation_weight,target_score,current_score,status");
      if (missionId !== "all") q = q.eq("mission_id", missionId);
      const { data } = await q;
      return (data ?? []) as Question[];
    },
  });

  const summary = useMemo(() => {
    const scored = questions.filter((q) => q.current_score != null);
    const wsum = scored.reduce((s, q) => s + (q.evaluation_weight ?? 1), 0);
    const avg =
      wsum > 0
        ? scored.reduce((s, q) => s + (q.current_score ?? 0) * (q.evaluation_weight ?? 1), 0) / wsum
        : null;
    const atStd = scored.filter((q) => (q.current_score ?? 0) >= 4.5).length;
    const below = scored.filter((q) => (q.current_score ?? 0) >= 3.0 && (q.current_score ?? 0) < 4.5).length;
    const needs = scored.filter((q) => (q.current_score ?? 0) < 3.0).length;
    const total = scored.length || 1;
    return { avg, atStd, below, needs, total, scoredCount: scored.length, unscored: questions.length - scored.length };
  }, [questions]);

  const sorted = useMemo(() => {
    const arr = [...questions];
    arr.sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortKey === "score") {
        const av = a.current_score ?? Number.POSITIVE_INFINITY;
        const bv = b.current_score ?? Number.POSITIVE_INFINITY;
        return (av - bv) * dir;
      }
      if (sortKey === "weight") return ((a.evaluation_weight ?? 0) - (b.evaluation_weight ?? 0)) * dir;
      return a.question_number.localeCompare(b.question_number, undefined, { numeric: true }) * dir;
    });
    return arr;
  }, [questions, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Score Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Weighted mission performance against the {TARGET.toFixed(1)} target.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AttentionBadge missionId={missionId} variant="compact" />
          <button
            onClick={() => setShowBatch(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Log Batch Scores
          </button>
        </div>
      </div>

      {/* Mission tabs */}
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

      {/* Average vs target */}
      <div className="mb-6 rounded-lg border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Mission Weighted Average</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-4xl font-semibold ${
                  summary.avg == null
                    ? "text-muted-foreground"
                    : summary.avg >= TARGET
                    ? "text-emerald-400"
                    : summary.avg >= 3
                    ? "text-blue-400"
                    : "text-red-400"
                }`}
              >
                {summary.avg != null ? summary.avg.toFixed(2) : "—"}
              </span>
              <span className="text-sm text-muted-foreground">/ {TARGET.toFixed(1)} target</span>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {summary.scoredCount} scored · {summary.unscored} pending
          </div>
        </div>

        {/* Stacked bar */}
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${(summary.atStd / summary.total) * 100}%` }}
            title={`At Standard: ${summary.atStd}`}
          />
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${(summary.below / summary.total) * 100}%` }}
            title={`Below Standard: ${summary.below}`}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${(summary.needs / summary.total) * 100}%` }}
            title={`Needs Intervention: ${summary.needs}`}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          <Legend color="bg-emerald-500" label="At Standard (≥4.5)" count={summary.atStd} />
          <Legend color="bg-blue-500" label="Below Standard (3.0–4.4)" count={summary.below} />
          <Legend color="bg-red-500" label="Needs Intervention (<3.0)" count={summary.needs} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">
                <SortBtn label="Question #" active={sortKey === "number"} asc={sortAsc} onClick={() => toggleSort("number")} />
              </th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3 text-right">
                <SortBtn label="Weight" active={sortKey === "weight"} asc={sortAsc} onClick={() => toggleSort("weight")} />
              </th>
              <th className="px-4 py-3 text-right">
                <SortBtn label="Score" active={sortKey === "score"} asc={sortAsc} onClick={() => toggleSort("score")} />
              </th>
              <th className="px-4 py-3 text-right">Target</th>
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
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No questions to display.
                </td>
              </tr>
            )}
            {sorted.map((q) => {
              const s = q.current_score;
              const tone =
                s == null
                  ? "text-muted-foreground"
                  : s >= 4.5
                  ? "text-emerald-400"
                  : s >= 3
                  ? "text-blue-400"
                  : "text-red-400";
              return (
                <tr key={q.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{q.question_number}</td>
                  <td className="px-4 py-3">
                    <Link
                      to="/missions/$missionId/sections/$questionId"
                      params={{ missionId: q.mission_id, questionId: q.id }}
                      className="hover:underline text-foreground"
                    >
                      {q.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {q.evaluation_weight != null ? q.evaluation_weight.toFixed(1) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${tone}`}>
                    {s != null ? s.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {(q.target_score ?? TARGET).toFixed(1)}
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

      {showBatch && (
        <BatchScoresModal
          questions={sorted}
          onClose={() => setShowBatch(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["scores-questions"] });
            setShowBatch(false);
          }}
        />
      )}
    </div>
  );
}

function Legend({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-foreground">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{count}</span>
    </span>
  );
}

function SortBtn({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
      {label}
      <ArrowUpDown className={`h-3 w-3 ${active ? "" : "opacity-40"} ${active && !asc ? "rotate-180" : ""} transition-transform`} />
    </button>
  );
}

function BatchScoresModal({
  questions,
  onClose,
  onSaved,
}: {
  questions: Question[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reviewer, setReviewer] = useState("");
  const [gate, setGate] = useState<string>(GATES[0]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  type ScoreInsert = {
    question_id: string;
    score: number;
    score_type: string;
    review_gate: string;
    review_notes: string | null;
    reviewer_id: string | null;
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const rows: ScoreInsert[] = Object.entries(scores)
        .map(([qid, val]): ScoreInsert | null => {
          const n = parseFloat(val);
          if (Number.isNaN(n) || n < 0 || n > 5) return null;
          return {
            question_id: qid,
            score: n,
            score_type: "review",
            review_gate: gate,
            review_notes: reviewer ? `Reviewer: ${reviewer.slice(0, 200)}` : null,
            reviewer_id: u.user?.id ?? null,
          };
        })
        .filter((r): r is ScoreInsert => r !== null);

      if (rows.length === 0) return;
      await supabase.from("question_scores").insert(rows);

      const ids = rows.map((r) => r.question_id);
      const { data: qrows } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title")
        .in("id", ids);
      const qmap = new Map((qrows ?? []).map((q) => [q.id, q]));

      for (const row of rows) {
        await supabase
          .from("question_records")
          .update({ current_score: row.score })
          .eq("id", row.question_id);
        const q = qmap.get(row.question_id);
        if (q?.mission_id) {
          await createSignal({
            mission_id: q.mission_id,
            source_module: "scores",
            signal_type: "score_logged",
            signal_title: `${gate} score ${row.score.toFixed(1)} — Q${q.question_number}`,
            signal_summary: q.title,
            severity: row.score < 3.0 ? "warning" : "info",
            related_question_id: row.question_id,
          });
        }
      }
    },
    onSuccess: onSaved,
    onSettled: () => setSaving(false),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-4 py-10">
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Log Batch Scores</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Reviewer Name</div>
            <input
              value={reviewer}
              maxLength={200}
              onChange={(e) => setReviewer(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Your name"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Review Gate</div>
            <select
              value={gate}
              onChange={(e) => setGate(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {GATES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="px-3 py-2">Section</th>
                <th className="px-3 py-2 text-right">Score (0–5)</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs text-muted-foreground">{q.question_number}</div>
                    <div className="text-foreground line-clamp-1">{q.title}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      max={5}
                      value={scores[q.id] ?? ""}
                      onChange={(e) => setScores((s) => ({ ...s, [q.id]: e.target.value }))}
                      className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-sm"
                      placeholder={q.current_score != null ? q.current_score.toFixed(1) : "—"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={() => {
              setSaving(true);
              save.mutate();
            }}
            disabled={saving || Object.values(scores).every((v) => !v)}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Scores"}
          </button>
        </div>
      </div>
    </div>
  );
}
