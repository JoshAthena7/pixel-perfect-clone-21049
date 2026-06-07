import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, ChevronDown, ChevronRight, Users, LayoutGrid, Plus } from "lucide-react";
import { getMissionHealth, listLeadMissions, type QuestionHealth } from "@/lib/health.functions";
import { recordMockScore } from "@/lib/mock-scores.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MissionProgressRing } from "@/components/MissionProgressRing";

export const Route = createFileRoute("/_authenticated/command/health")({
  component: HealthDashboardPage,
});

const STATUS_BG: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  yellow: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  red: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  critical: "bg-rose-600/25 text-rose-200 border-rose-500/50",
};
const STATUS_DOT: Record<string, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
  critical: "bg-rose-500",
};

export function HealthDashboardPage() {
  const listFn = useServerFn(listLeadMissions);
  const getFn = useServerFn(getMissionHealth);

  const { data: missions = [] } = useQuery({
    queryKey: ["lead-missions"],
    queryFn: () => listFn(),
  });

  const [missionId, setMissionId] = useState<string | null>(null);
  const effectiveMissionId = missionId ?? missions[0]?.id ?? null;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["mission-health", effectiveMissionId],
    enabled: !!effectiveMissionId,
    queryFn: () => getFn({ data: { missionId: effectiveMissionId! } }),
    refetchInterval: 60_000,
  });

  const { data: progress } = useQuery({
    queryKey: ["mission-progress", effectiveMissionId],
    enabled: !!effectiveMissionId,
    queryFn: async () => {
      const [total, completed] = await Promise.all([
        supabase.from("question_records").select("id", { count: "exact", head: true }).eq("mission_id", effectiveMissionId!),
        supabase.from("question_records").select("id", { count: "exact", head: true }).eq("mission_id", effectiveMissionId!).in("status", ["approved", "submitted"]),
      ]);
      return { total: total.count ?? 0, completed: completed.count ?? 0 };
    },
  });

  const [view, setView] = useState<"section" | "writer" | "activity">("section");
  const [scoreOpen, setScoreOpen] = useState(false);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">Firm Health · Across Missions</div>
          <h1 className="mt-2 text-3xl font-light tracking-tight">Mission Health Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status across all active missions — composite of mock scores, gate proximity, pulse confidence, and behavioral activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {progress && progress.total > 0 && (
            <MissionProgressRing size="md" completed={progress.completed} total={progress.total} />
          )}
          <select
            value={effectiveMissionId ?? ""}
            onChange={(e) => setMissionId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {missions.length === 0 && <option value="">No missions you lead</option>}
            {missions.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button
            onClick={() => setScoreOpen(true)}
            disabled={!effectiveMissionId}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Enter mock score
          </button>
        </div>
      </header>

      {data?.flagCount ? (
        <div className="rounded-[12px] border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {data.flagCount} open IRIS {data.flagCount === 1 ? "flag" : "flags"} on this mission.
        </div>
      ) : null}

      <div className="flex gap-2 border-b border-border">
        <TabBtn icon={<LayoutGrid className="h-3.5 w-3.5" />} active={view === "section"} onClick={() => setView("section")}>By section</TabBtn>
        <TabBtn icon={<Users className="h-3.5 w-3.5" />} active={view === "writer"} onClick={() => setView("writer")}>By writer</TabBtn>
        <TabBtn icon={<Activity className="h-3.5 w-3.5" />} active={view === "activity"} onClick={() => setView("activity")}>Activity map</TabBtn>
      </div>

      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">One moment…</div>
      ) : view === "section" ? (
        <SectionView sections={data.sections} />
      ) : view === "writer" ? (
        <WriterView writers={data.writers} />
      ) : (
        <ActivityMap data={data.activityMap} />
      )}

      {scoreOpen && effectiveMissionId && (
        <MockScoreModal
          missionId={effectiveMissionId}
          questions={data?.sections.flatMap((s) => s.questions) ?? []}
          onClose={() => { setScoreOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition ${
        active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {children}
    </button>
  );
}

function StatusPill({ status, score }: { status: string; score: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BG[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status.toUpperCase()} · {score}
    </span>
  );
}

function SectionView({ sections }: { sections: any[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (sections.length === 0) return <div className="text-sm text-muted-foreground">No questions on this mission yet.</div>;
  return (
    <ul className="space-y-3">
      {sections.map((s) => {
        const isOpen = open.has(s.section);
        return (
          <li key={s.section} className="rounded-[12px] border border-border bg-surface">
            <button
              onClick={() => {
                const n = new Set(open);
                n.has(s.section) ? n.delete(s.section) : n.add(s.section);
                setOpen(n);
              }}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm font-medium">{s.section}</span>
                <span className="text-xs text-muted-foreground">{s.questions.length} {s.questions.length === 1 ? "question" : "questions"}</span>
              </div>
              <StatusPill status={s.status} score={s.composite} />
            </button>
            {isOpen && (
              <ul className="divide-y divide-border border-t border-border">
                {s.questions.map((q: QuestionHealth) => (
                  <li key={q.questionId} className="grid grid-cols-12 gap-3 px-5 py-3 text-xs">
                    <span className="col-span-1 font-mono text-muted-foreground">{q.questionNumber ?? "—"}</span>
                    <span className="col-span-5 truncate text-foreground/90">{q.title}</span>
                    <span className="col-span-2 text-muted-foreground">
                      {q.latestMockScore != null ? `${q.latestMockStage}: ${q.latestMockScore}` : "no mock"}
                    </span>
                    <span className="col-span-2 text-muted-foreground">
                      {q.daysSinceActivity == null ? "no signal" : `${q.daysSinceActivity}d quiet`}
                      {q.blocked && <span className="ml-2 text-amber-300">· blocked</span>}
                    </span>
                    <span className="col-span-2 text-right"><StatusPill status={q.status} score={q.composite} /></span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WriterView({ writers }: { writers: any[] }) {
  if (writers.length === 0) return <div className="text-sm text-muted-foreground">No assigned writers yet.</div>;
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-background/40 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Writer</th>
            <th className="px-4 py-2 text-right">Sections</th>
            <th className="px-4 py-2 text-right">Last seen</th>
            <th className="px-4 py-2 text-right">Flags</th>
            <th className="px-4 py-2 text-right">Health</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {writers.map((w) => (
            <tr key={w.writerId}>
              <td className="px-4 py-3">{w.displayName}</td>
              <td className="px-4 py-3 text-right tabular-nums">{w.questionCount}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{w.lastSeenAt ? new Date(w.lastSeenAt).toLocaleDateString() : "—"}</td>
              <td className="px-4 py-3 text-right">{w.flags > 0 ? <span className="text-rose-300">{w.flags}</span> : <span className="text-muted-foreground">0</span>}</td>
              <td className="px-4 py-3 text-right"><StatusPill status={w.status} score={w.composite} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityMap({ data }: { data: { sectionLabels: string[]; days: string[]; counts: number[][] } }) {
  const max = Math.max(1, ...data.counts.flat());
  if (data.sectionLabels.length === 0) return <div className="text-sm text-muted-foreground">No activity to map.</div>;
  return (
    <div className="overflow-x-auto rounded-[12px] border border-border bg-surface p-4">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="pr-3 text-left text-muted-foreground"></th>
            {data.days.map((d) => (
              <th key={d} className="px-1 text-center text-[9px] text-muted-foreground">{d.slice(5)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.sectionLabels.map((label, i) => (
            <tr key={label}>
              <td className="pr-3 text-foreground/80 whitespace-nowrap">{label}</td>
              {data.days.map((d, j) => {
                const c = data.counts[i][j];
                const op = c === 0 ? 0.05 : Math.max(0.2, Math.min(1, c / max));
                return (
                  <td key={d} className="px-0.5 py-0.5">
                    <div
                      title={`${c} signals · ${d}`}
                      className="h-5 w-5 rounded-sm"
                      style={{ background: `oklch(0.7 0.18 200 / ${op})` }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MockScoreModal({ missionId, questions, onClose }: { missionId: string; questions: QuestionHealth[]; onClose: () => void }) {
  const recordFn = useServerFn(recordMockScore);
  const qc = useQueryClient();
  const [questionId, setQuestionId] = useState(questions[0]?.questionId ?? "");
  const [stage, setStage] = useState<"red_team" | "gold_team" | "pink_team">("red_team");
  const [score, setScore] = useState(75);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");
      await recordFn({
        data: { missionId, questionId: questionId || null, stage, score, evaluatorNote: note || null },
      });
    },
    onSuccess: () => {
      toast.success("Mock score recorded.");
      qc.invalidateQueries({ queryKey: ["mission-health"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't save score"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[12px] border border-border bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium">Record Mock Score</h2>
        <p className="mt-1 text-xs text-muted-foreground">Red Team or Gold Team review score. This recalibrates IRIS health.</p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Section</label>
            <select value={questionId} onChange={(e) => setQuestionId(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm">
              <option value="">— Section/mission level —</option>
              {questions.map((q) => (
                <option key={q.questionId} value={q.questionId}>
                  {q.questionNumber ?? "Q"} · {q.title.slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Stage</label>
            <div className="mt-1 flex gap-2">
              {(["red_team", "gold_team", "pink_team"] as const).map((s) => (
                <button key={s} onClick={() => setStage(s)} className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${stage === s ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Score · {score}</label>
            <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="mt-1 w-full accent-sky-400" />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Evaluator note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Record score"}
          </button>
        </div>
      </div>
    </div>
  );
}
