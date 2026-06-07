import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSectionBrief,
  generateQuestionSet,
  getSectionBrief,
  listSectionBriefs,
  refineBrief,
  saveWriterAnswers,
} from "@/lib/iris-section-questions.functions";

const NAVY = "#1F3864";
const GOLD = "#C9A84C";
const BG = "#0a0e1a";
const PANEL = "#111827";
const BORDER = "#1f2937";

type QuestionStatus =
  | "not_started"
  | "questions_ready"
  | "answering"
  | "answers_submitted"
  | "refined_brief_ready";

type SectionBriefRow = {
  id: string;
  mission_id: string;
  section_name: string;
  content: unknown;
  question_set: QuestionSet | null;
  writer_answers: Record<string, string> | null;
  refined_brief: RefinedBrief | null;
  refined_brief_version: number;
  question_status: QuestionStatus;
  questions_generated_at: string | null;
  answers_submitted_at: string | null;
  refined_brief_generated_at: string | null;
};

interface QuestionSet {
  section_name?: string;
  question_brief_headline?: string;
  evaluator_questions?: Array<{
    question_id: string;
    question: string;
    why_it_matters: string;
    writer_prompt: string;
  }>;
  proof_questions?: Array<{
    question_id: string;
    question: string;
    claim_to_prove: string;
    answer_format_hint: string;
  }>;
  sme_questions?: Array<{
    question_id: string;
    expertise_needed: string;
    question_for_sme: string;
    why_needed: string;
    suggested_source: string;
  }>;
  gap_questions?: Array<{
    question_id: string;
    gap: string;
    question: string;
    risk_if_unanswered: string;
  }>;
  the_win_question?: { question: string; context: string };
}

interface RefinedBrief {
  refined_headline?: string;
  sharpened_argument?: {
    core_claim?: string;
    proof_chain?: Array<{ claim: string; proof: string; how_to_present: string }>;
    opening_line_suggestion?: string;
  };
  win_themes_applied?: Array<{
    theme: string;
    specific_application: string;
    language_suggestion: string;
  }>;
  sme_outputs_to_include?: Array<{ expertise: string; what_to_incorporate: string }>;
  gaps_remaining?: Array<{ gap: string; recommended_action: string; risk_if_ignored: string }>;
  section_outline?: Array<{
    subsection: string;
    content_guidance: string;
    word_count_guidance: string;
    key_proof_point: string;
  }>;
  iris_final_note?: string;
}

export function SectionBriefManager({ missionId }: { missionId: string }) {
  const listFn = useServerFn(listSectionBriefs);
  const createFn = useServerFn(createSectionBrief);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["section-briefs", missionId],
    queryFn: () => listFn({ data: { mission_id: missionId } }),
  });

  const briefs: SectionBriefRow[] =
    (data?.success ? (data.briefs as unknown as SectionBriefRow[]) : []) ?? [];

  useEffect(() => {
    if (!selectedId && briefs.length > 0) setSelectedId(briefs[0].id);
  }, [briefs, selectedId]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const res = await createFn({
      data: { mission_id: missionId, section_name: name },
    });
    if (!res.success) {
      toast.error(res.error ?? "Could not create section brief");
      return;
    }
    setNewName("");
    setSelectedId(res.brief.id);
    qc.invalidateQueries({ queryKey: ["section-briefs", missionId] });
  }

  return (
    <div className="min-h-screen" style={{ background: BG, color: "#e5e7eb" }}>
      <div className="mx-auto max-w-7xl grid grid-cols-12 gap-6 px-6 py-8">
        <aside
          className="col-span-12 md:col-span-3 rounded-xl p-4"
          style={{ background: PANEL, border: `1px solid ${BORDER}` }}
        >
          <h2 className="text-sm font-semibold tracking-wide uppercase mb-3" style={{ color: GOLD }}>
            Pre-Flight Status
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Section name (e.g. Technical Approach)"
              className="flex-1 rounded-md px-2 py-1.5 text-sm bg-transparent"
              style={{ border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
            <button
              onClick={() => void handleCreate()}
              className="rounded-md px-2 py-1.5 text-sm font-medium"
              style={{ background: NAVY, color: "white" }}
            >
              Request Pre-Flight
            </button>
          </div>
          {isLoading ? (
            <p className="text-xs text-neutral-500">Loading…</p>
          ) : briefs.length === 0 ? (
            <p className="text-xs text-neutral-500">No Pre-Flights initiated. Select a section and request your Pre-Flight briefing before you write.</p>
          ) : (
            <ul className="space-y-1">
              {briefs.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => setSelectedId(b.id)}
                    className="w-full text-left rounded-md px-3 py-2 text-sm"
                    style={{
                      background: b.id === selectedId ? NAVY : "transparent",
                      color: b.id === selectedId ? "white" : "#cbd5e1",
                      border: `1px solid ${b.id === selectedId ? NAVY : BORDER}`,
                    }}
                  >
                    <div className="font-medium truncate">{b.section_name}</div>
                    <div className="text-[10px] uppercase tracking-wide opacity-70">
                      {statusLabel(b.question_status)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="col-span-12 md:col-span-9">
          {selectedId ? (
            <BriefPanel sectionBriefId={selectedId} missionId={missionId} />
          ) : (
            <div
              className="rounded-xl p-10 text-center"
              style={{ background: PANEL, border: `1px solid ${BORDER}` }}
            >
              <p className="text-neutral-400">
                Create a section brief on the left to begin the IRIS question flow.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function statusLabel(s: QuestionStatus): string {
  switch (s) {
    case "not_started":
      return "Not Initiated";
    case "questions_ready":
      return "Pre-Flight Ready";
    case "answering":
      return "In Progress";
    case "answers_submitted":
      return "Answers Submitted";
    case "refined_brief_ready":
      return "Flight Plan Ready";
  }
}

function BriefPanel({ sectionBriefId, missionId }: { sectionBriefId: string; missionId: string }) {
  const getFn = useServerFn(getSectionBrief);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["section-brief", sectionBriefId],
    queryFn: () => getFn({ data: { section_brief_id: sectionBriefId } }),
    refetchOnWindowFocus: false,
  });

  const brief = data?.success ? (data.brief as unknown as SectionBriefRow) : null;
  const status: QuestionStatus = brief?.question_status ?? "not_started";
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  useEffect(() => {
    if (status === "refined_brief_ready") setStep(4);
    else if (status === "answers_submitted") setStep(3);
    else if (status === "questions_ready" || status === "answering") setStep(2);
    else setStep(1);
  }, [status]);

  if (isLoading || !brief) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{ background: PANEL, border: `1px solid ${BORDER}` }}
      >
        <Loader2 className="mx-auto animate-spin" />
      </div>
    );
  }

  function invalidate() {
    void refetch();
    qc.invalidateQueries({ queryKey: ["section-briefs", missionId] });
  }

  return (
    <div className="rounded-xl" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
      <header className="px-6 py-5 border-b" style={{ borderColor: BORDER }}>
        <p className="text-xs uppercase tracking-wider" style={{ color: GOLD }}>
          IRIS Writer Question Brief
        </p>
        <h1 className="text-xl font-semibold text-white">{brief.section_name}</h1>
      </header>

      <Stepper current={step} setStep={setStep} status={status} />

      <div className="p-6">
        {step === 1 && <Step1Brief brief={brief} onGenerated={invalidate} />}
        {step === 2 && (
          <Step2Questions brief={brief} onSubmitted={invalidate} onSaved={invalidate} />
        )}
        {step === 3 && <Step3Review brief={brief} onEdit={() => setStep(2)} />}
        {step === 4 && <Step4Refined brief={brief} onRegenerate={invalidate} />}
      </div>
    </div>
  );
}

function Stepper({
  current,
  setStep,
  status,
}: {
  current: 1 | 2 | 3 | 4;
  setStep: (s: 1 | 2 | 3 | 4) => void;
  status: QuestionStatus;
}) {
  const steps = [
    { n: 1 as const, label: "IRIS Brief", unlocked: true },
    { n: 2 as const, label: "Flight Questions", unlocked: status !== "not_started" },
    {
      n: 3 as const,
      label: "Your Answers",
      unlocked: status === "answers_submitted" || status === "refined_brief_ready",
    },
    { n: 4 as const, label: "Flight Plan", unlocked: status === "refined_brief_ready" },
  ];
  return (
    <div className="flex items-center gap-2 px-6 py-4 border-b" style={{ borderColor: BORDER }}>
      {steps.map((s, i) => {
        const active = s.n === current;
        const done = s.unlocked && s.n < current;
        return (
          <div key={s.n} className="flex items-center gap-2 flex-1">
            <button
              disabled={!s.unlocked}
              onClick={() => setStep(s.n)}
              className="flex items-center gap-2 px-3 py-2 rounded-md w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: active ? NAVY : "transparent",
                border: `1px solid ${active ? NAVY : BORDER}`,
                color: active ? "white" : done ? GOLD : "#94a3b8",
              }}
            >
              {!s.unlocked ? (
                <Lock className="w-4 h-4" />
              ) : done ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <span className="text-xs font-bold w-5 h-5 rounded-full inline-flex items-center justify-center border" style={{ borderColor: active ? "white" : BORDER }}>
                  {s.n}
                </span>
              )}
              <span className="text-sm font-medium">{s.label}</span>
            </button>
            {i < steps.length - 1 && <ArrowRight className="w-4 h-4 text-neutral-600 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

function Step1Brief({
  brief,
  onGenerated,
}: {
  brief: SectionBriefRow;
  onGenerated: () => void;
}) {
  const genFn = useServerFn(generateQuestionSet);
  const [busy, setBusy] = useState(false);

  async function handleGenerate() {
    setBusy(true);
    try {
      const res = await genFn({ data: { section_brief_id: brief.id } });
      if (!res.success) {
        if (res.error === "missing_mission_intelligence") {
          toast.error(
            "Generate a Mission Brief and Strategic Assessment first. IRIS needs procurement intelligence before it can build your question set.",
          );
        } else {
          toast.error(res.error ?? "Could not generate question set");
        }
        return;
      }
      toast.success("Question set ready");
      onGenerated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-2">Section Writing Brief</h2>
        <p className="text-sm text-neutral-400 mb-4">
          The procurement intelligence IRIS has already gathered for this section.
        </p>
        {brief.content ? (
          <pre
            className="rounded-md p-4 text-xs whitespace-pre-wrap text-neutral-300 max-h-96 overflow-auto"
            style={{ background: BG, border: `1px solid ${BORDER}` }}
          >
            {JSON.stringify(brief.content, null, 2)}
          </pre>
        ) : (
          <div
            className="rounded-md p-4 text-sm text-neutral-400"
            style={{ background: BG, border: `1px solid ${BORDER}` }}
          >
            No brief content captured yet for this section. IRIS will still use the mission-wide
            intelligence (Mission Brief + Strategic Assessment) to generate questions.
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => void handleGenerate()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
          style={{ background: GOLD, color: NAVY }}
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> IRIS is preparing your Pre-Flight…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Generate Question Set
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Step2Questions({
  brief,
  onSubmitted,
  onSaved,
}: {
  brief: SectionBriefRow;
  onSubmitted: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveWriterAnswers);
  const refineFn = useServerFn(refineBrief);
  const qs: QuestionSet | null = brief.question_set ?? null;
  const initial = useMemo<Record<string, string>>(
    () => (brief.writer_answers ?? {}) as Record<string, string>,
    [brief.writer_answers],
  );
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dirty = useRef(false);

  // Autosave every 10s if dirty.
  useEffect(() => {
    const t = setInterval(() => {
      if (dirty.current) void flush();
    }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flush() {
    dirty.current = false;
    const res = await saveFn({
      data: { section_brief_id: brief.id, writer_answers: answers },
    });
    if (res.success) setSavedAt(new Date().toLocaleTimeString());
  }

  function set(qid: string, v: string) {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [qid]: v }));
  }

  if (!qs) {
    return <p className="text-sm text-neutral-400">No question set yet. Go back to Step 1.</p>;
  }

  const allQuestionIds: string[] = [
    ...(qs.evaluator_questions ?? []).map((q) => q.question_id),
    ...(qs.proof_questions ?? []).map((q) => q.question_id),
    ...(qs.sme_questions ?? []).map((q) => q.question_id),
    ...(qs.gap_questions ?? []).map((q) => q.question_id),
    "WIN",
  ];
  const total = allQuestionIds.length;
  const answered = allQuestionIds.filter((id) => (answers[id] ?? "").trim().length > 0).length;
  const canSubmit = total > 0 && answered / total >= 0.5;

  async function handleSubmit() {
    if (!confirm("Submit your answers? IRIS will use them to generate a refined writing brief specific to your organization.")) return;
    setSubmitting(true);
    try {
      const res = await refineFn({
        data: { section_brief_id: brief.id, writer_answers: answers },
      });
      if (!res.success) {
        toast.error(res.error ?? "Could not refine brief");
        return;
      }
      toast.success("Refined brief ready");
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            IRIS Question Set — {qs.section_name ?? brief.section_name}
          </h2>
          {qs.question_brief_headline && (
            <p className="text-sm text-neutral-400 mt-1">{qs.question_brief_headline}</p>
          )}
        </div>
        <div className="text-right text-xs text-neutral-400 shrink-0">
          <div>
            {answered} of {total} answered
          </div>
          {savedAt && <div className="text-emerald-400">Saved {savedAt}</div>}
        </div>
      </div>

      <QuestionGroup
        title="What the Evaluator Is Really Asking"
        subtitle="Answer these as if you are speaking directly to the evaluation panel."
        badge="EQ"
      >
        {(qs.evaluator_questions ?? []).map((q) => (
          <div key={q.question_id} className="space-y-2">
            <Badge label={q.question_id} color={GOLD} />
            <p className="italic text-amber-200">"{q.question}"</p>
            <p className="text-xs text-neutral-400">Why it matters: {q.why_it_matters}</p>
            <p className="text-sm font-semibold text-white">{q.writer_prompt}</p>
            <AnswerArea
              value={answers[q.question_id] ?? ""}
              onChange={(v) => set(q.question_id, v)}
              onBlur={() => void flush()}
            />
          </div>
        ))}
      </QuestionGroup>

      <QuestionGroup
        title="Prove It — What Evidence Do You Have?"
        subtitle="Be specific. Evaluators score claims that are backed by data, contracts, or outcomes."
        badge="PQ"
      >
        {(qs.proof_questions ?? []).map((q) => (
          <div key={q.question_id} className="space-y-2">
            <Badge label={q.question_id} color="#60A5FA" />
            <p className="text-sm font-semibold text-white">{q.claim_to_prove}</p>
            <p className="text-sm text-neutral-300">{q.question}</p>
            <AnswerArea
              value={answers[q.question_id] ?? ""}
              onChange={(v) => set(q.question_id, v)}
              onBlur={() => void flush()}
              placeholder={q.answer_format_hint}
            />
          </div>
        ))}
      </QuestionGroup>

      <QuestionGroup
        title="Who Knows This? What Do You Need to Ask Them?"
        subtitle="These are interview questions for internal experts. You do not have to answer them yourself — but someone on your team does."
        badge="SQ"
      >
        {(qs.sme_questions ?? []).map((q) => (
          <div key={q.question_id} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge label={q.question_id} color="#a78bfa" />
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: "#1f2937", color: "#a78bfa", border: `1px solid ${BORDER}` }}
              >
                {q.expertise_needed}
              </span>
            </div>
            <p className="text-sm font-semibold text-white">{q.question_for_sme}</p>
            <p className="text-xs text-neutral-400">{q.why_needed}</p>
            <p className="text-xs text-neutral-500">Suggested source: {q.suggested_source}</p>
            <AnswerArea
              value={answers[q.question_id] ?? ""}
              onChange={(v) => set(q.question_id, v)}
              onBlur={() => void flush()}
              placeholder="What did you learn?"
            />
          </div>
        ))}
      </QuestionGroup>

      <QuestionGroup
        title="What Don't You Know Yet?"
        subtitle="Unanswered gaps become proposal weaknesses. Address these before writing."
        badge="GQ"
      >
        {(qs.gap_questions ?? []).map((q) => (
          <div key={q.question_id} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge label={q.question_id} color="#f87171" />
              <span className="text-[10px] px-2 py-0.5 rounded-full text-red-300 bg-red-950 border border-red-900">
                Risk: {q.risk_if_unanswered}
              </span>
            </div>
            <p className="text-sm text-neutral-300">{q.gap}</p>
            <p className="text-sm font-semibold text-white">{q.question}</p>
            <AnswerArea
              value={answers[q.question_id] ?? ""}
              onChange={(v) => set(q.question_id, v)}
              onBlur={() => void flush()}
            />
          </div>
        ))}
      </QuestionGroup>

      {qs.the_win_question && (
        <div
          className="rounded-xl p-5"
          style={{ background: BG, border: `2px solid ${GOLD}` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5" style={{ color: GOLD }} />
            <h3 className="text-base font-bold" style={{ color: GOLD }}>
              The Win Question
            </h3>
          </div>
          <p className="text-lg text-white mb-2">{qs.the_win_question.question}</p>
          <p className="text-xs text-neutral-400 mb-3">{qs.the_win_question.context}</p>
          <AnswerArea
            value={answers["WIN"] ?? ""}
            onChange={(v) => set("WIN", v)}
            onBlur={() => void flush()}
            placeholder="Your answer:"
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: BORDER }}>
        {!canSubmit ? (
          <p className="text-xs text-amber-400">
            Answer at least half the questions for IRIS to generate a meaningful refined brief.
          </p>
        ) : (
          <span />
        )}
        <button
          disabled={!canSubmit || submitting}
          onClick={() => void handleSubmit()}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: GOLD, color: NAVY }}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> IRIS is synthesizing…
            </>
          ) : (
            <>
              Submit Answers to IRIS <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function QuestionGroup({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg" style={{ background: BG, border: `1px solid ${BORDER}` }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: NAVY, color: "white" }}
          >
            {badge}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="text-xs text-neutral-400">{subtitle}</p>
          </div>
        </div>
        <MessageSquare className="w-4 h-4 text-neutral-500" />
      </button>
      {open && <div className="px-4 pb-4 space-y-6">{children}</div>}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded inline-block"
      style={{ background: "#0a0e1a", color, border: `1px solid ${color}` }}
    >
      {label}
    </span>
  );
}

function AnswerArea({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-md p-3 text-sm bg-transparent resize-y"
        style={{ border: `1px solid ${BORDER}`, color: "#e5e7eb" }}
      />
      <div className="absolute bottom-1 right-2 text-[10px] text-neutral-500">
        {value.length} chars
      </div>
    </div>
  );
}

function Step3Review({ brief, onEdit }: { brief: SectionBriefRow; onEdit: () => void }) {
  const qs = brief.question_set;
  const answers = (brief.writer_answers ?? {}) as Record<string, string>;
  if (!qs) return <p className="text-sm text-neutral-400">No data.</p>;

  function row(qid: string, q: string) {
    return (
      <div key={qid} className="py-2 border-b" style={{ borderColor: BORDER }}>
        <p className="text-xs text-neutral-500">{qid}</p>
        <p className="text-sm text-neutral-300">{q}</p>
        <p className="text-sm text-white whitespace-pre-wrap mt-1">
          {answers[qid] || <em className="text-neutral-600">No answer</em>}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">Your Answers</h2>
        <button
          onClick={onEdit}
          className="text-sm rounded-md px-3 py-1.5"
          style={{ background: NAVY, color: "white" }}
        >
          Edit Answers
        </button>
      </div>
      <div>
        {(qs.evaluator_questions ?? []).map((q) => row(q.question_id, q.writer_prompt))}
        {(qs.proof_questions ?? []).map((q) => row(q.question_id, q.question))}
        {(qs.sme_questions ?? []).map((q) => row(q.question_id, q.question_for_sme))}
        {(qs.gap_questions ?? []).map((q) => row(q.question_id, q.question))}
        {qs.the_win_question && row("WIN", qs.the_win_question.question)}
      </div>
    </div>
  );
}

function Step4Refined({
  brief,
  onRegenerate,
}: {
  brief: SectionBriefRow;
  onRegenerate: () => void;
}) {
  const refineFn = useServerFn(refineBrief);
  const [busy, setBusy] = useState(false);
  const rb = brief.refined_brief;
  if (!rb) return <p className="text-sm text-neutral-400">No refined brief yet.</p>;

  async function handleRegen() {
    setBusy(true);
    try {
      const res = await refineFn({ data: { section_brief_id: brief.id } });
      if (res.success) {
        toast.success("Refined brief regenerated");
        onRegenerate();
      } else {
        toast.error(res.error ?? "Could not regenerate");
      }
    } finally {
      setBusy(false);
    }
  }

  const answerCount = Object.values(
    (brief.writer_answers ?? {}) as Record<string, string>,
  ).filter((v) => (v ?? "").trim().length > 0).length;

  return (
    <div className="space-y-6">
      {rb.refined_headline && (
        <div
          className="rounded-lg p-5"
          style={{ background: NAVY, border: `1px solid ${GOLD}` }}
        >
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: GOLD }}>
            IRIS Refined Brief — {brief.section_name}
          </p>
          <p className="text-lg font-semibold text-white">{rb.refined_headline}</p>
        </div>
      )}

      {rb.sharpened_argument && (
        <Section title="Sharpened Argument" icon={<Target className="w-4 h-4" />}>
          {rb.sharpened_argument.core_claim && (
            <p className="text-base font-semibold text-white mb-3">
              {rb.sharpened_argument.core_claim}
            </p>
          )}
          {rb.sharpened_argument.opening_line_suggestion && (
            <div
              className="rounded-md p-3 mb-3 text-sm italic"
              style={{ background: BG, border: `1px dashed ${GOLD}`, color: "#fcd34d" }}
            >
              Suggested opener: "{rb.sharpened_argument.opening_line_suggestion}"
            </div>
          )}
          <ol className="space-y-3 list-decimal pl-5">
            {(rb.sharpened_argument.proof_chain ?? []).map((p, i) => (
              <li key={i} className="text-sm text-neutral-300">
                <div className="font-medium text-white">{p.claim}</div>
                <div className="text-neutral-400">Proof: {p.proof}</div>
                <div className="text-neutral-500 italic">How to present: {p.how_to_present}</div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {rb.win_themes_applied && rb.win_themes_applied.length > 0 && (
        <Section title="Win Themes Applied">
          <div className="grid sm:grid-cols-2 gap-3">
            {rb.win_themes_applied.map((t, i) => (
              <div
                key={i}
                className="rounded-md p-3"
                style={{ background: BG, border: `1px solid ${BORDER}` }}
              >
                <div className="text-sm font-semibold" style={{ color: GOLD }}>
                  {t.theme}
                </div>
                <div className="text-xs text-neutral-300 mt-1">{t.specific_application}</div>
                <div className="text-xs text-neutral-400 italic mt-1">
                  "{t.language_suggestion}"
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {rb.section_outline && rb.section_outline.length > 0 && (
        <Section title="Section Outline">
          <ol className="space-y-3 list-decimal pl-5">
            {rb.section_outline.map((s, i) => (
              <li key={i} className="text-sm">
                <div className="font-semibold text-white">{s.subsection}</div>
                <div className="text-neutral-300">{s.content_guidance}</div>
                <div className="text-xs text-neutral-500">
                  Target: {s.word_count_guidance} · Key proof: {s.key_proof_point}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {rb.gaps_remaining && rb.gaps_remaining.length > 0 && (
        <Section title="Gaps Remaining">
          <div className="space-y-2">
            {rb.gaps_remaining.map((g, i) => (
              <div
                key={i}
                className="rounded-md p-3 text-sm"
                style={{ background: "#2a1612", border: "1px solid #7f1d1d" }}
              >
                <div className="font-semibold text-red-300">{g.gap}</div>
                <div className="text-neutral-300">→ {g.recommended_action}</div>
                <div className="text-xs text-red-400 mt-1">Risk: {g.risk_if_ignored}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {rb.sme_outputs_to_include && rb.sme_outputs_to_include.length > 0 && (
        <Section title="SME Outputs to Include">
          <ul className="space-y-2">
            {rb.sme_outputs_to_include.map((s, i) => (
              <li key={i} className="text-sm text-neutral-300">
                <span className="font-semibold text-white">{s.expertise}:</span>{" "}
                {s.what_to_incorporate}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rb.iris_final_note && (
        <div
          className="rounded-lg p-5"
          style={{ background: BG, border: `1px solid ${GOLD}` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: GOLD }}>
              IRIS Final Note
            </span>
          </div>
          <p className="text-sm text-neutral-200 italic">{rb.iris_final_note}</p>
        </div>
      )}

      <div
        className="flex items-center justify-between text-xs text-neutral-500 pt-4 border-t"
        style={{ borderColor: BORDER }}
      >
        <span>
          Refined by IRIS™ from {answerCount} writer answer{answerCount === 1 ? "" : "s"} · v
          {brief.refined_brief_version}
          {brief.refined_brief_generated_at &&
            ` · ${new Date(brief.refined_brief_generated_at).toLocaleString()}`}
        </span>
        <button
          onClick={() => void handleRegen()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
          style={{ background: NAVY, color: "white" }}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Regenerate Refined Brief
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg p-4" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: GOLD }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}
