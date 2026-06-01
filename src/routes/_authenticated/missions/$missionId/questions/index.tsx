import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { irisMissionPulse } from "@/lib/iris.functions";
import { AlertTriangle, Activity, GitMerge } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/questions/")({
  component: QuestionCommand,
});

type Q = {
  id: string;
  question_number: string;
  section_number: string | null;
  title: string;
  health: "green" | "yellow" | "red";
  status: string;
  pens_down_date: string | null;
  current_score: number | null;
  target_score: number | null;
  page_limit: number | null;
  evaluation_weight: number | null;
};

const STATUSES = ["all", "not_started", "in_progress", "in_review", "complete"] as const;
const HEALTHS = ["all", "green", "yellow", "red"] as const;

function QuestionCommand() {
  const { missionId } = Route.useParams();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("all");
  const [healthFilter, setHealthFilter] = useState<(typeof HEALTHS)[number]>("all");

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["mission-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,section_number,title,health,status,pens_down_date,current_score,target_score,page_limit,evaluation_weight")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Q[];
    },
  });

  const pulseFn = useServerFn(irisMissionPulse);
  const { data: pulse } = useQuery({
    queryKey: ["mission-pulse", missionId],
    queryFn: () => pulseFn({ data: { missionId } }),
    refetchInterval: 60_000,
  });
  const { data: openConflicts = 0 } = useQuery({
    queryKey: ["mission-conflicts-count", missionId],
    queryFn: async () => {
      const { count } = await supabase
        .from("alignment_conflicts")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId)
        .is("resolved_at", null);
      return count ?? 0;
    },
  });

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: questions.length };
    const byHealth: Record<string, number> = { all: questions.length };
    for (const q of questions) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      byHealth[q.health] = (byHealth[q.health] ?? 0) + 1;
    }
    return { byStatus, byHealth };
  }, [questions]);

  const filtered = questions.filter(
    (q) =>
      (statusFilter === "all" || q.status === statusFilter) &&
      (healthFilter === "all" || q.health === healthFilter),
  );

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Mission Studio</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Every procurement is a collection of questions. Answer them better than anyone else.
          </p>
        </div>
        <Link
          to="/missions/$missionId"
          params={{ missionId }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Mission Home
        </Link>
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <FilterRow label="Health">
          {HEALTHS.map((h) => (
            <Pill
              key={h}
              active={healthFilter === h}
              onClick={() => setHealthFilter(h)}
              dot={h !== "all" ? h : undefined}
              count={counts.byHealth[h] ?? 0}
            >
              {h}
            </Pill>
          ))}
        </FilterRow>
        <div className="h-5 w-px bg-border" />
        <FilterRow label="Status">
          {STATUSES.map((s) => (
            <Pill
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              count={counts.byStatus[s] ?? 0}
            >
              {s.replace(/_/g, " ")}
            </Pill>
          ))}
        </FilterRow>
      </div>

      {/* IRIS signal banner */}
      {(pulse || openConflicts > 0) && (
        <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <SignalStat
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Critical"
            value={pulse?.counts.critical ?? 0}
            tone={pulse?.counts.critical ? "red" : "muted"}
          />
          <SignalStat
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Warnings"
            value={pulse?.counts.warning ?? 0}
            tone={pulse?.counts.warning ? "yellow" : "muted"}
          />
          <SignalStat
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Open Signals"
            value={pulse?.counts.total ?? 0}
            tone="primary"
          />
          <SignalStat
            icon={<GitMerge className="h-3.5 w-3.5" />}
            label="Open Conflicts"
            value={openConflicts}
            tone={openConflicts > 0 ? "yellow" : "muted"}
          />
        </div>
      )}


      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading questions…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-foreground/90">
              {questions.length === 0 ? "No questions yet." : "No questions match these filters."}
            </p>
            {questions.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Upload the RFP to auto-create question records, or add questions manually.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left w-8" />
                <th className="px-4 py-3 text-left">Question</th>
                <th className="px-4 py-3 text-left">Section</th>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Weight</th>
                <th className="px-4 py-3 text-right">Pages</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Pens Down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((q) => (
                <tr key={q.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3"><span className={`dot dot-${q.health}`} /></td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    <Link to="/missions/$missionId/questions/$questionId" params={{ missionId, questionId: q.id }} className="hover:text-primary">
                      {q.question_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{q.section_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link to="/missions/$missionId/questions/$questionId" params={{ missionId, questionId: q.id }} className="hover:text-primary">
                      {q.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs capitalize">{q.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">{q.evaluation_weight ? `${q.evaluation_weight}%` : "—"}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">{q.page_limit ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {q.current_score != null
                      ? <span className="text-primary font-semibold">{q.current_score}<span className="text-muted-foreground font-normal"> / {q.target_score ?? 5}</span></span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                    {q.pens_down_date ? new Date(q.pens_down_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  active, onClick, dot, count, children,
}: { active: boolean; onClick: () => void; dot?: string; count: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] capitalize transition ${
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border bg-surface text-muted-foreground hover:text-foreground hover:border-primary/30"
      }`}
    >
      {dot && <span className={`dot dot-${dot}`} />}
      {children}
      <span className="opacity-60">{count}</span>
    </button>
  );
}

function SignalStat({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "red" | "yellow" | "primary" | "muted" }) {
  const cls =
    tone === "red" ? "border-red/40 bg-red/5 text-red"
    : tone === "yellow" ? "border-yellow/40 bg-yellow/5 text-yellow"
    : tone === "primary" ? "border-primary/40 bg-primary/5 text-primary"
    : "border-border bg-surface text-muted-foreground";
  return (
    <div className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 ${cls}`}>
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.14em] opacity-80">{label}</div>
        <div className="text-base font-semibold tabular-nums text-foreground">{value}</div>
      </div>
    </div>
  );
}
