import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter as FilterIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/missions/$missionId/questions/")({
  component: ResponsesList,
});

type Q = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
  health: "red" | "yellow" | "green" | null;
  status: string | null;
  current_score: number | null;
};

type Gate = { id: string; gate_name: string; target_date: string | null };
type Profile = { id: string; display_name: string | null; email: string | null };
type Collab = { id: string; question_id: string; entry_type: string; resolved: boolean; body: string | null };
type Conflict = { question_a_id: string; question_b_id: string; description: string; resolved_at: string | null };

type View = "mine" | "all";

const HEALTH_DOT: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-emerald-500",
};
const HEALTH_LABEL: Record<string, string> = {
  red: "Red",
  yellow: "Yellow",
  green: "Green",
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function fmtDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------- Writer brief panel ----------

function WriterBriefPanel({
  missionId,
  myQuestions,
  collabsByQ,
}: {
  missionId: string;
  myQuestions: Q[];
  collabsByQ: Record<string, Collab[]>;
}) {
  const { data: nextGate } = useQuery({
    queryKey: ["writer-brief-gate", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("gate_name,target_date")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []).find((g: any) => g.target_date && new Date(g.target_date) >= new Date()) ?? null;
    },
  });

  // Row 1: today
  const attention = myQuestions.filter((q) => q.health === "red" || q.health === "yellow");
  const row1 =
    attention.length === 0
      ? "All questions on track."
      : `${attention.length} question${attention.length === 1 ? "" : "s"} need your attention — ${attention.map((q) => `Q${q.question_number}`).join(", ")}`;

  // Row 2: next step
  const candidates = (myQuestions.filter((q) => q.pens_down_date) as Q[]).sort(
    (a, b) => new Date(a.pens_down_date!).getTime() - new Date(b.pens_down_date!).getTime(),
  );
  const nextStepQ =
    candidates.find((q) => q.health !== "green") ?? candidates[0] ?? null;

  // Row 3: waiting on
  const openItems: { q: Q; type: string }[] = [];
  for (const q of myQuestions) {
    const items = collabsByQ[q.id] ?? [];
    for (const it of items) {
      if (!it.resolved && (it.entry_type === "sme_request" || it.entry_type === "decision_needed")) {
        openItems.push({ q, type: it.entry_type });
      }
    }
  }
  let row3: string;
  if (openItems.length === 0) {
    row3 = "Nothing waiting. Clear to write.";
  } else {
    const samples = openItems.slice(0, 2).map(({ q, type }) =>
      type === "sme_request"
        ? `SME response pending on Q${q.question_number}`
        : `decision needed on Q${q.question_number}`,
    );
    row3 = `${openItems.length} open item${openItems.length === 1 ? "" : "s"} — ${samples.join(", ")}`;
  }

  // Row 4: next gate
  const row4 = nextGate ? `${nextGate.gate_name} · ${fmtDate(nextGate.target_date)}` : "No gates scheduled.";

  return (
    <div className="mb-6 rounded-[10px] border border-primary/30 bg-primary/[0.04] px-5 py-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Writer Brief</div>
      <dl className="space-y-2 text-sm">
        <BriefRow label="TODAY" value={row1} />
        <BriefRow
          label="NEXT STEP"
          value={
            nextStepQ ? (
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">Q{nextStepQ.question_number}</span>
                <span>· {nextStepQ.title}</span>
                {nextStepQ.pens_down_date && (
                  <span className="text-muted-foreground">· Pens Down {fmtDate(nextStepQ.pens_down_date)}</span>
                )}
                {nextStepQ.health && (
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[nextStepQ.health]}`} />
                    {HEALTH_LABEL[nextStepQ.health]}
                  </span>
                )}
              </span>
            ) : (
              "No upcoming deadline."
            )
          }
        />
        <BriefRow label="WAITING ON" value={row3} />
        <BriefRow label="NEXT GATE" value={row4} />
      </dl>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <dt className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-foreground">{value}</dd>
    </div>
  );
}

// ---------- Main ----------

function ResponsesList() {
  const { missionId } = Route.useParams();

  const { data: me } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: myRole } = useQuery({
    queryKey: ["mission-role", missionId, me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("mission_id", missionId)
        .eq("user_id", me!)
        .maybeSingle();
      return (data?.role ?? "writer") as string;
    },
  });
  const isWriter = myRole === "writer";

  const [view, setView] = useState<View>("mine");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // For non-writers, default to All
  const effectiveView: View = isWriter === false ? "all" : view;

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["mission-questions-v2", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,pens_down_date,assigned_writer_id,health,status,current_score")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Q[];
    },
  });

  const writerIds = Array.from(new Set(questions.map((q) => q.assigned_writer_id).filter(Boolean) as string[]));
  const { data: profiles = [] } = useQuery({
    queryKey: ["mission-writers", missionId, writerIds.join(",")],
    enabled: writerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", writerIds);
      return (data ?? []) as Profile[];
    },
  });
  const writerById = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const { data: collabs = [] } = useQuery({
    queryKey: ["mission-collabs", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,entry_type,resolved,body")
        .eq("mission_id", missionId)
        .eq("resolved", false);
      return (data ?? []) as Collab[];
    },
  });
  const collabsByQ = useMemo(() => {
    const m: Record<string, Collab[]> = {};
    for (const c of collabs) (m[c.question_id] ??= []).push(c);
    return m;
  }, [collabs]);

  const { data: conflicts = [] } = useQuery({
    queryKey: ["mission-conflicts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("alignment_conflicts")
        .select("question_a_id,question_b_id,description,resolved_at")
        .eq("mission_id", missionId)
        .is("resolved_at", null);
      return (data ?? []) as Conflict[];
    },
  });
  const conflictByQ = useMemo(() => {
    const m: Record<string, Conflict> = {};
    for (const c of conflicts) {
      if (!m[c.question_a_id]) m[c.question_a_id] = c;
      if (!m[c.question_b_id]) m[c.question_b_id] = c;
    }
    return m;
  }, [conflicts]);

  const myQuestions = useMemo(
    () => (me ? questions.filter((q) => q.assigned_writer_id === me) : []),
    [questions, me],
  );

  const visible = effectiveView === "mine" ? myQuestions : questions;

  function statusNote(q: Q): string {
    const days = daysUntil(q.pens_down_date);
    if (q.health === "red" && conflictByQ[q.id]) {
      return `Alignment conflict — ${conflictByQ[q.id].description.slice(0, 80)}`;
    }
    const items = collabsByQ[q.id] ?? [];
    if ((q.health === "red" || q.health === "yellow") && items.some((i) => i.entry_type === "sme_request")) {
      return "Awaiting SME response";
    }
    if ((q.health === "red" || q.health === "yellow") && items.some((i) => i.entry_type === "decision_needed")) {
      return "Decision needed";
    }
    if (
      (!q.status || q.status === "not_started") &&
      days !== null && days >= 0 && days <= 14
    ) {
      return `No draft started · ${days} day${days === 1 ? "" : "s"}`;
    }
    if (q.health === "green") return "On track";
    return (q.status ?? "—").replace(/_/g, " ");
  }

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10">
      <div className="mb-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">The Studio</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Responses</h1>
      </div>

      {isWriter && <WriterBriefPanel missionId={missionId} myQuestions={myQuestions} collabsByQ={collabsByQ} />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isWriter && (
          <div className="inline-flex rounded-full border border-border bg-surface p-0.5">
            {(["mine", "all"] as View[]).map((k) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "mine" ? "My Questions" : "All Questions"}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <FilterIcon className="h-3 w-3" /> Filter
          {filtersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </div>

      {filtersOpen && (
        <div className="mb-4 rounded-md border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
          No additional filters configured. Use the toggle to switch between My Questions and All Questions.
        </div>
      )}

      {isLoading ? (
        <div className="rounded-[12px] border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          Loading responses…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground">
          {effectiveView === "mine" ? "You have no assigned questions on this mission." : "No responses yet."}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
          {visible.map((q) => {
            const writer = q.assigned_writer_id ? writerById[q.assigned_writer_id] : null;
            const days = daysUntil(q.pens_down_date);
            const urgentRed = days !== null && days <= 7 && q.health !== "green";
            return (
              <li key={q.id}>
                <Link
                  to="/missions/$missionId/questions/$questionId"
                  params={{ missionId, questionId: q.id }}
                  className="block px-5 py-4 hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[q.health ?? "yellow"] ?? "bg-muted"}`} />
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">Q{q.question_number}</span>
                    <span className="flex-1 truncate text-sm font-medium">· {q.title}</span>
                    <span
                      className={`shrink-0 text-xs ${
                        urgentRed ? "text-red-400 font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {q.pens_down_date ? fmtDate(q.pens_down_date) : "—"}
                    </span>
                  </div>
                  <div className="mt-1 pl-[1.5rem] text-[11px] text-muted-foreground">
                    {statusNote(q)}
                    {!isWriter && writer && (
                      <span className="ml-3 opacity-70">· {writer.display_name || writer.email}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
