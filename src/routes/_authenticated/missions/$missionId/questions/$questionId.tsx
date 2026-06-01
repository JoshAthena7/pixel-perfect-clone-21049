import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { irisQuestionSignals } from "@/lib/iris.functions";
import { toast } from "sonner";
import {
  ArrowLeft, Sparkles, MessageSquare, AlertTriangle, FileText, Activity,
  Target, Calendar, User as UserIcon, Send, CheckCircle2, Shield, Trophy, Link2, Copy,
} from "lucide-react";
import { ScoreTrend } from "@/components/v2/ScoreTrend";
import { ShortcutsHint } from "@/components/v2/KeyboardShortcuts";


export const Route = createFileRoute(
  "/_authenticated/missions/$missionId/questions/$questionId",
)({
  component: QuestionWorkspace,
});

type Question = {
  id: string;
  mission_id: string;
  question_number: string;
  section_number: string | null;
  title: string;
  question_text: string;
  requirements: string[] | null;
  mandatory_language: string[] | null;
  scoring_criteria: string | null;
  evaluation_weight: number | null;
  page_limit: number | null;
  word_limit: number | null;
  formatting_rules: string | null;
  pens_down_date: string | null;
  status: string;
  health: "green" | "yellow" | "red";
  health_drivers: Record<string, unknown> | null;
  current_score: number | null;
  target_score: number | null;
  assigned_writer_id: string | null;
  assigned_sme_id: string | null;
};

type Collab = {
  id: string;
  entry_type: string;
  body: string;
  author_id: string | null;
  author_name: string;
  resolved: boolean;
  created_at: string;
};

type Intel = {
  iris_brief: string | null;
  state_priorities: string | null;
  procurement_priorities: string | null;
  competitor_signals: string | null;
  key_messages: string[] | null;
  compliance_flags: string[] | null;
  generated_at: string | null;
  expires_at: string | null;
};

type Conflict = {
  id: string;
  conflict_type: string;
  description: string | null;
  resolved: boolean;
  question_a_id: string;
  question_b_id: string;
  question_a: { question_number: string; title: string } | null;
  question_b: { question_number: string; title: string } | null;
};

type Profile = { id: string; display_name: string | null; email: string | null };
type Gate = { id: string; gate_name: string; gate_order: number; target_date: string | null };
type GateStatus = { gate_id: string; status: string; completed_at: string | null };
type WinTheme = { id: string; title: string; description: string | null; key_message: string | null; question_ids: string[] | null };

function QuestionWorkspace() {
  const { missionId, questionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement)?.closest("textarea,input,select")) {
        navigate({ to: "/missions/$missionId/questions", params: { missionId } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, missionId]);

  const { data: q, isLoading } = useQuery({
    queryKey: ["question", questionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records").select("*").eq("id", questionId).maybeSingle();
      if (error) throw error;
      return data as Question | null;
    },
  });

  const assignedIds = [q?.assigned_writer_id, q?.assigned_sme_id].filter(Boolean) as string[];
  const { data: people = [] } = useQuery({
    queryKey: ["question-people", questionId, assignedIds.join(",")],
    enabled: assignedIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", assignedIds);
      return (data ?? []) as Profile[];
    },
  });
  const peopleById = Object.fromEntries(people.map((p) => [p.id, p]));

  const { data: collab = [] } = useQuery({
    queryKey: ["question-collab", questionId],
    queryFn: async () => {
      const { data } = await supabase.from("question_collaboration")
        .select("id,entry_type,body,author_id,author_name,resolved,created_at")
        .eq("question_id", questionId).order("created_at", { ascending: false });
      return (data ?? []) as Collab[];
    },
  });

  const { data: intel = null } = useQuery({
    queryKey: ["question-intel", questionId],
    queryFn: async () => {
      const { data } = await supabase.from("question_intelligence")
        .select("*").eq("question_id", questionId).maybeSingle();
      return (data as Intel | null) ?? null;
    },
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: ["question-conflicts", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("alignment_conflicts")
        .select(`id,conflict_type,description,resolved,question_a_id,question_b_id,
          question_a:question_records!alignment_conflicts_question_a_id_fkey(question_number,title),
          question_b:question_records!alignment_conflicts_question_b_id_fkey(question_number,title)`)
        .or(`question_a_id.eq.${questionId},question_b_id.eq.${questionId}`);
      return (data ?? []) as unknown as Conflict[];
    },
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("mission_review_gates")
        .select("id,gate_name,gate_order,target_date")
        .eq("mission_id", missionId).order("gate_order");
      return (data ?? []) as Gate[];
    },
  });

  const { data: gateStatuses = [] } = useQuery({
    queryKey: ["question-gates", questionId],
    queryFn: async () => {
      const { data } = await supabase.from("question_gate_status")
        .select("gate_id,status,completed_at").eq("question_id", questionId);
      return (data ?? []) as GateStatus[];
    },
  });
  const gateStatusMap = Object.fromEntries(gateStatuses.map((g) => [g.gate_id, g]));

  const { data: winThemes = [] } = useQuery({
    queryKey: ["mission-winthemes", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("win_themes")
        .select("id,title,description,key_message,question_ids").eq("mission_id", missionId);
      return (data ?? []) as WinTheme[];
    },
  });
  const connectedThemes = winThemes.filter((w) => (w.question_ids ?? []).includes(questionId));

  useEffect(() => {
    const ch = supabase
      .channel(`collab-${questionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "question_collaboration", filter: `question_id=eq.${questionId}` },
        () => qc.invalidateQueries({ queryKey: ["question-collab", questionId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [questionId, qc]);

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("question_records").update({ status }).eq("id", questionId);
      if (error) throw error;
      if (status === "complete" && q) {
        await createSignal({
          mission_id: missionId,
          source_module: "question_workspace",
          signal_type: "question_completed",
          signal_title: `Question ${q.question_number} completed`,
          signal_summary: q.title,
          severity: "info",
          related_question_id: questionId,
        });
      }
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["question", questionId] });
      qc.invalidateQueries({ queryKey: ["mission-questions", missionId] });
    },
  });

  if (isLoading) return <div className="px-8 py-12 text-sm text-muted-foreground">Loading question…</div>;
  if (!q) {
    return (
      <div className="px-8 py-12 text-sm">
        Question not found.{" "}
        <Link to="/missions/$missionId/questions" params={{ missionId }} className="text-primary hover:underline">Back</Link>
      </div>
    );
  }

  const days = q.pens_down_date
    ? Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86400000)
    : null;
  const writer = q.assigned_writer_id ? peopleById[q.assigned_writer_id] : null;
  const sme = q.assigned_sme_id ? peopleById[q.assigned_sme_id] : null;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-surface/60 backdrop-blur px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              to="/missions/$missionId/questions" params={{ missionId }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Questions
              <span className="ml-2 hidden md:inline text-[10px] uppercase tracking-wider opacity-60">Esc</span>
            </Link>
            <div className="h-5 w-px bg-border" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`dot dot-${q.health}`} />
                <span className="font-mono">{q.question_number}</span>
                {q.section_number && <><span>·</span><span>§ {q.section_number}</span></>}
                {q.page_limit && <><span>·</span><span>{q.page_limit}p</span></>}
                {q.pens_down_date && (
                  <><span>·</span>
                    <span className={days !== null && days <= 3 ? "text-red" : days !== null && days <= 7 ? "text-yellow" : ""}>
                      Pens down {new Date(q.pens_down_date).toLocaleDateString()} {days !== null && `(${days}d)`}
                    </span>
                  </>
                )}
              </div>
              <h1 className="mt-0.5 text-base font-semibold truncate">{q.title}</h1>
              {(writer || sme) && (
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                  {writer && <span><UserIcon className="inline h-3 w-3 mr-1" />Writer: <span className="text-foreground/80">{writer.display_name || writer.email}</span></span>}
                  {sme && <span><Shield className="inline h-3 w-3 mr-1" />SME: <span className="text-foreground/80">{sme.display_name || sme.email}</span></span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={q.status}
              onChange={(e) => updateStatus.mutate(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs"
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="complete">Complete</option>
            </select>
            {q.current_score != null && (
              <div className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs inline-flex items-center gap-2">
                <span>Score <span className="font-semibold text-primary">{q.current_score}</span>
                <span className="text-muted-foreground"> / {q.target_score ?? 5}</span></span>
                <ScoreTrend questionId={questionId} />
              </div>
            )}
          </div>
        </div>
      </header>


      {/* Two-column body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] overflow-hidden">
        {/* LEFT */}
        <div className="overflow-y-auto border-r border-border">
          <div className="px-8 py-6 space-y-6">
            <Card title="Question Details" icon={<FileText className="h-4 w-4" />}>
              <div className="space-y-4 text-sm">
                <p className="whitespace-pre-wrap leading-relaxed">{q.question_text}</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Meta label="Weight" value={q.evaluation_weight ? `${q.evaluation_weight}%` : "—"} icon={<Target className="h-3 w-3" />} />
                  <Meta label="Word Limit" value={q.word_limit ? q.word_limit.toLocaleString() : "—"} icon={<FileText className="h-3 w-3" />} />
                  <Meta label="Page Limit" value={q.page_limit ? `${q.page_limit} pages` : "—"} icon={<FileText className="h-3 w-3" />} />
                  <Meta label="Pens Down" value={q.pens_down_date ? new Date(q.pens_down_date).toLocaleDateString() : "—"} icon={<Calendar className="h-3 w-3" />} />
                </div>

                {q.requirements && q.requirements.length > 0 && (
                  <Block label="Requirements">
                    <ul className="space-y-1.5">
                      {q.requirements.map((r, i) => (
                        <li key={i} className="flex gap-2 text-xs"><span className="text-primary mt-0.5">›</span><span className="text-foreground/80">{r}</span></li>
                      ))}
                    </ul>
                  </Block>
                )}

                {q.mandatory_language && q.mandatory_language.length > 0 && (
                  <Block label="Mandatory Language">
                    <ul className="space-y-1.5">
                      {q.mandatory_language.map((m, i) => (
                        <li key={i} className="rounded-md border border-red/30 bg-red/5 px-3 py-2 text-xs text-foreground/90">
                          <span className="text-red mr-1.5">⚠</span>{m}
                        </li>
                      ))}
                    </ul>
                  </Block>
                )}

                {q.scoring_criteria && (
                  <Block label="Scoring Criteria">
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{q.scoring_criteria}</p>
                  </Block>
                )}

                {q.formatting_rules && (
                  <Block label="Formatting Rules">
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{q.formatting_rules}</p>
                  </Block>
                )}
              </div>
            </Card>

            <CollabPanel collab={collab} questionId={questionId} missionId={missionId} />

            <HealthPanel question={q} gates={gates} gateStatusMap={gateStatusMap} />
          </div>
        </div>

        {/* RIGHT */}
        <div className="overflow-y-auto bg-background/40">
          <div className="px-8 py-6 space-y-6">
            <IntelPanel intel={intel} questionId={questionId} missionId={missionId} />
            <RecentSignalsPanel questionId={questionId} />
            <AlignmentPanel
              conflicts={conflicts}
              missionId={missionId}
              currentId={questionId}
              winThemes={connectedThemes}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {icon}{title}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Meta({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className="mt-0.5 text-xs text-foreground/90">{value}</div>
    </div>
  );
}

function HealthPanel({
  question, gates, gateStatusMap,
}: { question: Question; gates: Gate[]; gateStatusMap: Record<string, GateStatus> }) {
  const drivers = (question.health_drivers ?? {}) as Record<string, string>;
  const entries = Object.entries(drivers);
  const completed = gates.filter((g) => gateStatusMap[g.id]?.status === "passed").length;
  return (
    <Card title="Question Health" icon={<span className={`dot dot-${question.health}`} />}>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold uppercase text-white" style={{ background: `var(--${question.health})` }}>
          {question.health[0]}
        </div>
        <div className="text-xs text-muted-foreground">
          {question.health === "green" && "On track. No blockers detected."}
          {question.health === "yellow" && "Needs attention — review drivers below."}
          {question.health === "red" && "Critical — blocking issues need resolution."}
        </div>
      </div>

      {entries.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
              <span className="text-foreground/80 text-right">{String(v)}</span>
            </li>
          ))}
        </ul>
      )}

      {gates.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
            <span>Review Gates</span>
            <span>{completed} / {gates.length} passed</span>
          </div>
          <div className="flex items-center gap-1.5">
            {gates.map((g) => {
              const st = gateStatusMap[g.id]?.status ?? "pending";
              const color = st === "passed" ? "var(--green)" : st === "failed" ? "var(--red)" : st === "in_review" ? "var(--yellow)" : "var(--border)";
              return (
                <div key={g.id} className="flex-1 group relative">
                  <div className="h-1.5 rounded-full" style={{ background: color }} />
                  <div className="mt-1 text-[10px] text-muted-foreground truncate">{g.gate_name}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

const ENTRY_TYPES = [
  { value: "note", label: "Note" },
  { value: "open_question", label: "Open Question" },
  { value: "sme_request", label: "SME Request" },
  { value: "decision_needed", label: "Decision Needed" },
  { value: "leadership_guidance", label: "Leadership Guidance" },
];

function CollabPanel({ collab, questionId, missionId }: { collab: Collab[]; questionId: string; missionId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [type, setType] = useState("note");

  const post = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      const { error } = await supabase.from("question_collaboration").insert({
        question_id: questionId,
        mission_id: missionId,
        author_id: user.id,
        author_name: prof?.display_name || user.email || "User",
        entry_type: type,
        body: body.trim(),
      });
      if (error) throw error;
      const typeToSignal: Record<string, { st: string; sev: "info" | "warning" | "critical"; title: string }> = {
        note: { st: "comment_added", sev: "info", title: "Comment added" },
        open_question: { st: "comment_added", sev: "info", title: "Open question raised" },
        sme_request: { st: "sme_requested", sev: "warning", title: "SME requested" },
        decision_needed: { st: "decision_needed", sev: "warning", title: "Decision needed" },
        leadership_guidance: { st: "leadership_guidance_added", sev: "info", title: "Leadership guidance added" },
      };
      const cfg = typeToSignal[type] ?? typeToSignal.note;
      await createSignal({
        mission_id: missionId,
        source_module: "question_workspace",
        signal_type: cfg.st,
        signal_title: cfg.title,
        signal_summary: body.trim().slice(0, 200),
        severity: cfg.sev,
        related_question_id: questionId,
      });
    },
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["question-collab", questionId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("question_collaboration")
        .update({ resolved: true, resolved_by: user?.id, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["question-collab", questionId] }),
  });

  return (
    <Card title="Collaboration" icon={<MessageSquare className="h-4 w-4" />}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
            {ENTRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add note, question, or request…"
            rows={2}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={() => post.mutate()}
            disabled={!body.trim() || post.isPending}
            className="self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {collab.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No collaboration yet.</p>}
          {collab.map((c) => (
            <div key={c.id} className={`rounded-md border px-3 py-2 ${c.resolved ? "border-border/40 bg-background/30 opacity-60" : "border-border bg-background/60"}`}>
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground"><UserIcon className="inline h-3 w-3 mr-1" />{c.author_name}</span>
                  <span className={`rounded px-1.5 py-0.5 ${entryColor(c.entry_type)}`}>{c.entry_type.replace(/_/g, " ")}</span>
                </div>
                <span className="text-muted-foreground/70">{new Date(c.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="mt-1.5 text-sm whitespace-pre-wrap text-foreground/90">{c.body}</p>
              {!c.resolved && c.entry_type !== "note" && (
                <button onClick={() => resolve.mutate(c.id)} className="mt-1.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary">
                  <CheckCircle2 className="h-3 w-3" /> Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function entryColor(t: string) {
  switch (t) {
    case "decision_needed": return "bg-red/15 text-red";
    case "sme_request": return "bg-yellow/15 text-yellow";
    case "leadership_guidance": return "bg-primary/15 text-primary";
    case "iris_alert": return "bg-primary/15 text-primary";
    case "open_question": return "bg-yellow/15 text-yellow";
    default: return "bg-surface-hover text-muted-foreground";
  }
}

function IntelPanel({ intel, questionId, missionId }: { intel: Intel | null; questionId: string; missionId: string }) {
  const qc = useQueryClient();
  const generate = useMutation({
    mutationFn: async () => {
      const stub = {
        question_id: questionId,
        mission_id: missionId,
        iris_brief: "IRIS intelligence generation will activate in Step 9 (iris-question-brief). When live, this panel will surface a synthesized brief tying state priorities, procurement signals, and recent research to this specific question.",
        state_priorities: null,
        procurement_priorities: null,
        competitor_signals: null,
        key_messages: null,
        compliance_flags: null,
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      };
      const { error } = await supabase.from("question_intelligence").upsert(stub, { onConflict: "question_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["question-intel", questionId] }); toast.success("Brief refreshed (stub)"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const expired = intel?.expires_at && new Date(intel.expires_at).getTime() < Date.now();

  return (
    <Card
      title="Athena Intelligence"
      icon={<Sparkles className="h-4 w-4 text-primary" />}
      action={
        <button onClick={() => generate.mutate()} disabled={generate.isPending}
          className="rounded-md border border-border px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-50">
          {intel ? "Refresh" : "Generate"}
        </button>
      }
    >
      {!intel ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No IRIS brief yet. <span className="block mt-1 opacity-70">Generate to synthesize state, procurement, and competitor intel.</span>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          {expired && <div className="rounded-md border border-yellow/40 bg-yellow/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-yellow">Cached brief expired — refresh recommended</div>}
          {intel.iris_brief && <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{intel.iris_brief}</p>}
          {intel.state_priorities && <IntelBlock label="State Priorities" body={intel.state_priorities} />}
          {intel.procurement_priorities && <IntelBlock label="Procurement Signals" body={intel.procurement_priorities} />}
          {intel.competitor_signals && <IntelBlock label="Competitor Signals" body={intel.competitor_signals} />}
          {intel.key_messages && intel.key_messages.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Key Messages</div>
              <ul className="space-y-1">{intel.key_messages.map((m, i) => <li key={i} className="text-xs text-foreground/80">• {m}</li>)}</ul>
            </div>
          )}
          {intel.compliance_flags && intel.compliance_flags.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-red mb-1.5">Compliance Flags</div>
              <ul className="space-y-1">{intel.compliance_flags.map((m, i) => <li key={i} className="text-xs text-foreground/80">⚠ {m}</li>)}</ul>
            </div>
          )}
          {intel.generated_at && <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 pt-2 border-t border-border">Generated {new Date(intel.generated_at).toLocaleString()}</div>}
        </div>
      )}
    </Card>
  );
}

function IntelBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">{label}</div>
      <p className="text-xs text-foreground/80 whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function AlignmentPanel({
  conflicts, missionId, currentId, winThemes,
}: { conflicts: Conflict[]; missionId: string; currentId: string; winThemes: WinTheme[] }) {
  const open = conflicts.filter((c) => !c.resolved);
  return (
    <Card
      title="Strategy Alignment"
      icon={<AlertTriangle className="h-4 w-4" />}
      action={
        <Link
          to="/command/alignment"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/40"
        >
          <Link2 className="h-3 w-3" /> Alignment Map
        </Link>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1.5">
            <Trophy className="h-3 w-3" /> Connected Win Themes
          </div>
          {winThemes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No win themes connected to this question yet.</p>
          ) : (
            <div className="space-y-1.5">
              {winThemes.map((w) => (
                <div key={w.id} className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                  <div className="text-xs font-semibold text-foreground">{w.title}</div>
                  {w.key_message && <p className="mt-0.5 text-[11px] text-foreground/70 italic">"{w.key_message}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Related Questions / Conflicts</div>
          {open.length === 0 ? (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green" />
              No alignment conflicts detected.
            </div>
          ) : (
            <div className="space-y-2">
              {open.map((c) => {
                const other = c.question_a_id === currentId ? c.question_b : c.question_a;
                const otherId = c.question_a_id === currentId ? c.question_b_id : c.question_a_id;
                return (
                  <div key={c.id} className="rounded-md border border-yellow/30 bg-yellow/5 px-3 py-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                      <span className="text-yellow font-semibold">{c.conflict_type.replace(/_/g, " ")}</span>
                    </div>
                    {c.description && <p className="mt-1 text-xs text-foreground/90">{c.description}</p>}
                    {other && (
                      <Link
                        to="/missions/$missionId/questions/$questionId"
                        params={{ missionId, questionId: otherId }}
                        className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary hover:underline"
                      >
                        ↔ {other.question_number} · {other.title}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function RecentSignalsPanel({ questionId }: { questionId: string }) {
  const fn = useServerFn(irisQuestionSignals);
  const { data } = useQuery({
    queryKey: ["question-signals", questionId],
    queryFn: () => fn({ data: { questionId, limit: 5 } }),
    refetchInterval: 60_000,
  });
  const signals = data?.signals ?? [];
  return (
    <Card title="Recent Signals" icon={<Activity className="h-4 w-4" />}>
      {signals.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No signals on this question yet.</p>
      ) : (
        <ul className="space-y-2">
          {signals.map((s) => {
            const color =
              s.severity === "critical" ? "border-red/40 bg-red/5"
              : s.severity === "warning" ? "border-yellow/40 bg-yellow/5"
              : "border-border bg-background/40";
            return (
              <li key={s.id} className={`rounded-md border px-3 py-2 ${color}`}>
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{s.signal_type.replace(/_/g, " ")}</span>
                  <span>{new Date(s.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="mt-0.5 text-sm font-medium text-foreground/90">{s.signal_title}</div>
                {s.signal_summary && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{s.signal_summary}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
