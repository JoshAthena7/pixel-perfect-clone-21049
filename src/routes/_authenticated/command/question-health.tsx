import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { AlertTriangle, ListChecks, MessageCircleQuestion, GitMerge, ArrowRight, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/command/question-health")({
  component: QuestionHealthPage,
});

type Mission = { id: string; name: string; client: string };
type Question = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  health: "green" | "yellow" | "red" | null;
  health_drivers: Record<string, unknown> | null;
};
type Collab = {
  id: string;
  question_id: string;
  mission_id: string;
  body: string;
  author_name: string;
  created_at: string;
};
type Conflict = {
  id: string;
  mission_id: string;
  severity: string | null;
  conflict_type: string;
  description: string;
  question_a_id: string;
  question_b_id: string;
};

function driverText(drivers: Record<string, unknown> | null): string[] {
  if (!drivers || typeof drivers !== "object") return [];
  return Object.entries(drivers)
    .filter(([, v]) => v && v !== "ok" && v !== "green" && v !== false)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
}

function QuestionHealthPage() {
  const [missionId, setMissionId] = useState<string | "all">("all");

  const { data: missions = [] } = useQuery({
    queryKey: ["qh-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client")
        .eq("status", "Active")
        .order("name");
      return (data ?? []) as Mission[];
    },
  });

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["qh-questions", missionId],
    queryFn: async () => {
      let q = supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,health,health_drivers");
      if (missionId !== "all") q = q.eq("mission_id", missionId);
      const { data } = await q.order("question_number");
      return (data ?? []) as Question[];
    },
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["qh-decisions", missionId],
    queryFn: async () => {
      let q = supabase
        .from("question_collaboration")
        .select("id,question_id,mission_id,body,author_name,created_at")
        .eq("entry_type", "decision_needed")
        .eq("resolved", false);
      if (missionId !== "all") q = q.eq("mission_id", missionId);
      const { data } = await q.order("created_at", { ascending: false });
      return (data ?? []) as Collab[];
    },
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: ["qh-conflicts", missionId],
    queryFn: async () => {
      let q = supabase
        .from("alignment_conflicts")
        .select("id,mission_id,severity,conflict_type,description,question_a_id,question_b_id")
        .is("resolved_at", null);
      if (missionId !== "all") q = q.eq("mission_id", missionId);
      const { data } = await q.order("detected_at", { ascending: false });
      return (data ?? []) as Conflict[];
    },
  });

  const { data: signals = [] } = useQuery({
    queryKey: ["qh-signals", missionId],
    queryFn: async () => {
      let q = supabase
        .from("signals")
        .select("id,mission_id,signal_type,signal_title,signal_summary,severity,created_at,related_question_id")
        .eq("status", "open")
        .in("severity", ["critical", "warning"]);
      if (missionId !== "all") q = q.eq("mission_id", missionId);
      const { data } = await q.order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });


  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0 };
    for (const q of questions) {
      if (q.health === "green") c.green++;
      else if (q.health === "red") c.red++;
      else c.yellow++;
    }
    return c;
  }, [questions]);

  const intervention = useMemo(() => {
    return questions
      .filter((q) => q.health === "red" || (q.health === "yellow" && driverText(q.health_drivers).length > 0))
      .map((q) => ({ q, issues: driverText(q.health_drivers) }));
  }, [questions]);

  const qById = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" /> Question Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Where leadership attention is needed right now.</p>
        </div>
        <AttentionBadge missionId={missionId} />
      </div>


      <div className="flex gap-1 border-b border-border overflow-x-auto">
        <MissionTab active={missionId === "all"} onClick={() => setMissionId("all")}>All Missions</MissionTab>
        {missions.map((m) => (
          <MissionTab key={m.id} active={missionId === m.id} onClick={() => setMissionId(m.id)}>
            {m.name}
          </MissionTab>
        ))}
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Pill color="green" label="Green" count={counts.green} />
        <Pill color="yellow" label="Yellow" count={counts.yellow} />
        <Pill color="red" label="Red" count={counts.red} />
      </section>

      <Section icon={<AlertTriangle className="h-4 w-4 text-red-500" />} title="Requires Leadership Intervention" count={intervention.length}>
        {isLoading ? (
          <Empty>One moment…</Empty>
        ) : intervention.length === 0 ? (
          <Empty>All clear — no questions need intervention.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {intervention.map(({ q, issues }) => (
              <li key={q.id} className="flex items-start gap-4 p-4">
                <span className={`dot dot-${q.health ?? "yellow"} mt-1.5`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    <span className="text-muted-foreground mr-2">{q.question_number}</span>
                    {q.title}
                  </div>
                  {issues.length > 0 && (
                    <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      {issues.map((i, idx) => <li key={idx}>• {i}</li>)}
                    </ul>
                  )}
                </div>
                <OpenLink missionId={q.mission_id} questionId={q.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={<MessageCircleQuestion className="h-4 w-4 text-amber-500" />} title="Awaiting Decisions" count={decisions.length}>
        {decisions.length === 0 ? (
          <Empty>No outstanding decisions.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {decisions.map((d) => {
              const q = qById[d.question_id];
              return (
                <li key={d.id} className="flex items-start gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground mb-1">
                      {d.author_name} · {q ? `${q.question_number} ${q.title}` : "Question"}
                    </div>
                    <div className="text-sm">{d.body}</div>
                  </div>
                  <OpenLink missionId={d.mission_id} questionId={d.question_id} />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section icon={<GitMerge className="h-4 w-4 text-purple-500" />} title="Alignment Drift" count={conflicts.length}>
        {conflicts.length === 0 ? (
          <Empty>No open alignment conflicts.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {conflicts.map((c) => {
              const a = qById[c.question_a_id];
              const b = qById[c.question_b_id];
              return (
                <li key={c.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <SeverityBadge severity={c.severity} />
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{c.conflict_type}</span>
                  </div>
                  <div className="text-sm">{c.description}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {a && <OpenLink missionId={c.mission_id} questionId={c.question_a_id} compact label={`${a.question_number} →`} />}
                    {b && <OpenLink missionId={c.mission_id} questionId={c.question_b_id} compact label={`${b.question_number} →`} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section icon={<Activity className="h-4 w-4 text-primary" />} title="Recent Signals" count={signals.length}>
        {signals.length === 0 ? (
          <Empty>No critical or warning signals.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {signals.map((s) => {
              const q = s.related_question_id ? qById[s.related_question_id] : null;
              return (
                <li key={s.id} className="flex items-start gap-4 p-4">
                  <SeverityBadge severity={s.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.signal_title}</div>
                    {s.signal_summary && <div className="text-xs text-muted-foreground mt-0.5">{s.signal_summary}</div>}
                    <div className="text-[11px] text-muted-foreground/70 mt-1">
                      {s.signal_type.replace(/_/g, " ")} · {new Date(s.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {q && <> · {q.question_number} {q.title}</>}
                    </div>
                  </div>
                  {s.related_question_id && q && (
                    <OpenLink missionId={s.mission_id} questionId={s.related_question_id} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>

  );
}

function MissionTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Pill({ color, label, count }: { color: "green" | "yellow" | "red"; label: string; count: number }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3 flex items-center gap-3">
      <span className={`dot dot-${color}`} />
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{count}</div>
      </div>
    </div>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
        <span className="text-xs font-normal text-muted-foreground">({count})</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function SeverityBadge({ severity }: { severity: string | null }) {
  const s = (severity ?? "warning").toLowerCase();
  const cls =
    s === "critical" || s === "high"
      ? "bg-red-500/15 text-red-500"
      : s === "warning" || s === "medium"
      ? "bg-amber-500/15 text-amber-500"
      : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>{s}</span>;
}

function OpenLink({ missionId, questionId, compact, label }: { missionId: string; questionId: string; compact?: boolean; label?: string }) {
  return (
    <Link
      to="/missions/$missionId/sections/$questionId"
      params={{ missionId, questionId }}
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-surface-hover px-3 py-1.5 text-xs font-medium hover:bg-surface ${compact ? "" : "shrink-0"}`}
    >
      {label ?? "Open Question"} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}
