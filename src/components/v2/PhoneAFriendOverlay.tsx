import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { matchExperts, type ExpertMatch } from "@/lib/expertise.functions";
import {
  buildConsultDraft,
  matchExternalExperts,
  sendConsult,
  type ConsultContextSnapshot,
  type ConsultDraft,
  type ExternalExpert,
} from "@/lib/expert-consult.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Phone, Sparkles, ArrowRight, ArrowLeft, Clock, Users, Globe2 } from "lucide-react";

type Props = {
  missionId: string;
  /** Pass null for a global (header) consult. */
  questionId: string | null;
  questionNumber?: string;
  meId: string | null;
  meName: string;
  onClose: () => void;
};

type SelectedExpert =
  | { kind: "internal"; expert: ExpertMatch }
  | { kind: "external"; expert: ExternalExpert };

export function PhoneAFriendOverlay({
  missionId,
  questionId,
  questionNumber,
  meId,
  meName: _meName,
  onClose,
}: Props) {
  const qc = useQueryClient();
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(questionId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<SelectedExpert | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [urgency, setUrgency] = useState<"urgent" | "standard" | "fyi">("standard");
  const [contextSnapshot, setContextSnapshot] = useState<ConsultContextSnapshot>({});
  const [sending, setSending] = useState(false);

  // Load mission questions for the global "Consult about…" picker
  const { data: missionQuestions = [] } = useQuery({
    queryKey: ["paf-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,section_number,title,status")
        .eq("mission_id", missionId)
        .order("question_number");
      return data ?? [];
    },
  });

  // Step 3 draft (lazily fetched once we land on Step 3)
  const buildDraftFn = useServerFn(buildConsultDraft);
  const draftQuery = useQuery<ConsultDraft>({
    queryKey: ["paf-draft", missionId, activeQuestionId ?? "general"],
    queryFn: () =>
      buildDraftFn({
        data: { missionId, questionId: activeQuestionId },
      }),
    enabled: step === 3 && !subject && !body,
  });

  useEffect(() => {
    if (draftQuery.data && !subject && !body) {
      setSubject(draftQuery.data.subject);
      setBody(draftQuery.data.body);
      setUrgency(draftQuery.data.suggested_urgency);
      setContextSnapshot(draftQuery.data.context);
    }
  }, [draftQuery.data, subject, body]);

  // Internal SME matches (only when bound to a question)
  const fetchInternal = useServerFn(matchExperts);
  const { data: internalMatches, isLoading: internalLoading } = useQuery({
    queryKey: ["paf-internal", missionId, activeQuestionId],
    queryFn: () =>
      activeQuestionId
        ? fetchInternal({ data: { missionId, questionId: activeQuestionId } })
        : Promise.resolve(null),
    enabled: step === 2 && !!activeQuestionId,
  });

  const fetchExternal = useServerFn(matchExternalExperts);
  const { data: externalMatches = [], isLoading: externalLoading } = useQuery({
    queryKey: ["paf-external", missionId, activeQuestionId ?? "general"],
    queryFn: () => fetchExternal({ data: { missionId, questionId: activeQuestionId } }),
    enabled: step === 2,
  });

  const sendFn = useServerFn(sendConsult);

  async function handleSend() {
    if (!meId) return toast.error("Please sign in.");
    if (!selected) return toast.error("Pick an expert first.");
    if (!subject.trim() || !body.trim()) return toast.error("Subject and body required.");
    setSending(true);
    try {
      await sendFn({
        data: {
          missionId,
          questionId: activeQuestionId,
          expertUserId: selected.kind === "internal" ? selected.expert.id : null,
          externalExpertId: selected.kind === "external" ? selected.expert.id : null,
          urgency,
          askSubject: subject.trim(),
          askBody: body.trim(),
          contextSnapshot,
        },
      });
      const expertName =
        selected.kind === "internal"
          ? selected.expert.display_name
          : selected.expert.name;
      toast.success(`Sent to ${expertName ?? "expert"}.`);
      qc.invalidateQueries({ queryKey: ["mission-consults", missionId] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const headerLabel = useMemo(() => {
    if (activeQuestionId) {
      const found = missionQuestions.find((q: any) => q.id === activeQuestionId);
      const num = found?.question_number ?? questionNumber ?? "?";
      return `Q${num}`;
    }
    return "General consult";
  }, [activeQuestionId, missionQuestions, questionNumber]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-[680px] overflow-y-auto rounded-[14px] border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Phone a Friend · {headerLabel}</span>
            <StepDots step={step} />
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {step === 1 && (
            <Step1Context
              activeQuestionId={activeQuestionId}
              setActiveQuestionId={setActiveQuestionId}
              missionQuestions={missionQuestions as any[]}
              missionId={missionId}
            />
          )}
          {step === 2 && (
            <Step2ExpertMatch
              internalLoading={internalLoading}
              internalMatches={internalMatches ?? null}
              externalLoading={externalLoading}
              externalMatches={externalMatches}
              selected={selected}
              setSelected={setSelected}
              hasQuestion={!!activeQuestionId}
            />
          )}
          {step === 3 && (
            <Step3Ask
              loading={draftQuery.isLoading}
              subject={subject}
              setSubject={setSubject}
              body={body}
              setBody={setBody}
              urgency={urgency}
              setUrgency={setUrgency}
              context={contextSnapshot}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            onClick={() => (step === 1 ? onClose() : setStep(((step - 1) as 1 | 2 | 3)))}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(((step + 1) as 1 | 2 | 3))}
              disabled={step === 2 && !selected}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending || !selected || !subject.trim() || !body.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send via Atlas"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${n === step ? "bg-primary" : n < step ? "bg-emerald-500" : "bg-muted"}`}
        />
      ))}
    </span>
  );
}

/* ─────────────────── Step 1 — Context ─────────────────── */

function Step1Context({
  activeQuestionId,
  setActiveQuestionId,
  missionQuestions,
  missionId,
}: {
  activeQuestionId: string | null;
  setActiveQuestionId: (id: string | null) => void;
  missionQuestions: any[];
  missionId: string;
}) {
  const { data: q } = useQuery({
    queryKey: ["paf-ctx-q", activeQuestionId],
    queryFn: async () => {
      if (!activeQuestionId) return null;
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,question_text,point_value,pens_down_date,iris_risk_flag,iris_risk_flag_text,section_number")
        .eq("id", activeQuestionId)
        .maybeSingle();
      return data;
    },
    enabled: !!activeQuestionId,
  });

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Step 1 · What's the consult about?
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          IRIS pre-loads PRISIM™ context so the expert can react fast instead of asking for background.
        </p>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Consult about
        </label>
        <select
          className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
          value={activeQuestionId ?? ""}
          onChange={(e) => setActiveQuestionId(e.target.value || null)}
        >
          <option value="">General consult (no specific question)</option>
          {missionQuestions.map((mq) => (
            <option key={mq.id} value={mq.id}>
              Q{mq.question_number}
              {mq.section_number ? ` · §${mq.section_number}` : ""} — {mq.title}
            </option>
          ))}
        </select>
      </div>

      {q && (
        <div className="rounded-md border border-border bg-background/30 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            PRISIM™ context
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {q.point_value != null && <Chip>{q.point_value} pts</Chip>}
            {q.pens_down_date && <Chip>Pens down · {q.pens_down_date}</Chip>}
            {q.section_number && <Chip>§ {q.section_number}</Chip>}
            {q.iris_risk_flag && (
              <Chip tone="amber">IRIS flag · {q.iris_risk_flag}</Chip>
            )}
          </div>
          {q.iris_risk_flag_text && (
            <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              {q.iris_risk_flag_text}
            </p>
          )}
          <div className="mt-3 text-[12px] font-medium text-foreground">{q.title}</div>
          <p className="mt-1 line-clamp-4 text-[11px] text-muted-foreground">{q.question_text}</p>
        </div>
      )}

      {!activeQuestionId && (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground">
          General consult — IRIS will draft a question-agnostic ask using mission-level context.
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Step 2 — Expert Match ─────────────────── */

function Step2ExpertMatch({
  internalLoading,
  internalMatches,
  externalLoading,
  externalMatches,
  selected,
  setSelected,
  hasQuestion,
}: {
  internalLoading: boolean;
  internalMatches: { primary: ExpertMatch | null; alternatives: ExpertMatch[]; iris_line: string | null } | null;
  externalLoading: boolean;
  externalMatches: ExternalExpert[];
  selected: SelectedExpert | null;
  setSelected: (s: SelectedExpert) => void;
  hasQuestion: boolean;
}) {
  const [tab, setTab] = useState<"internal" | "external">(
    hasQuestion ? "internal" : "external",
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Step 2 · Pick an expert
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          IRIS ranked the best matches based on question content, tags, and past pursuits.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-border bg-background/40 p-0.5">
        <TabBtn active={tab === "internal"} onClick={() => setTab("internal")}>
          <Users className="h-3 w-3" /> Internal SMEs
        </TabBtn>
        <TabBtn active={tab === "external"} onClick={() => setTab("external")}>
          <Globe2 className="h-3 w-3" /> Expert Network
        </TabBtn>
      </div>

      {tab === "internal" ? (
        !hasQuestion ? (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-[11px] text-muted-foreground">
            Internal SME matching needs a specific question.<br />
            Pick one in Step 1 or switch to Expert Network for a general consult.
          </div>
        ) : internalLoading ? (
          <Loading text="Scanning Athena Collective…" />
        ) : !internalMatches?.primary && internalMatches?.alternatives?.length === 0 ? (
          <Empty text="No internal SME matches yet." />
        ) : (
          <div className="space-y-2">
            {internalMatches?.primary && (
              <InternalCard
                expert={internalMatches.primary}
                isPrimary
                irisLine={internalMatches.iris_line}
                selected={selected?.kind === "internal" && selected.expert.id === internalMatches.primary.id}
                onSelect={() => setSelected({ kind: "internal", expert: internalMatches.primary! })}
              />
            )}
            {internalMatches?.alternatives.map((e) => (
              <InternalCard
                key={e.id}
                expert={e}
                isPrimary={false}
                selected={selected?.kind === "internal" && selected.expert.id === e.id}
                onSelect={() => setSelected({ kind: "internal", expert: e })}
              />
            ))}
          </div>
        )
      ) : externalLoading ? (
        <Loading text="Loading curated experts…" />
      ) : externalMatches.length === 0 ? (
        <Empty text="No curated external experts yet. Ask an admin to populate the directory." />
      ) : (
        <div className="space-y-2">
          {externalMatches.map((e) => (
            <ExternalCard
              key={e.id}
              expert={e}
              selected={selected?.kind === "external" && selected.expert.id === e.id}
              onSelect={() => setSelected({ kind: "external", expert: e })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold ${
        active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function InternalCard({
  expert,
  isPrimary,
  irisLine,
  selected,
  onSelect,
}: {
  expert: ExpertMatch;
  isPrimary: boolean;
  irisLine?: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const initials = (expert.display_name ?? expert.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-[12px] border p-3 text-left transition ${
        selected
          ? "border-primary bg-primary/[0.06] ring-1 ring-inset ring-primary/40"
          : "border-border bg-surface/60 hover:bg-surface-hover"
      }`}
    >
      {isPrimary && (
        <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--accent,#3b7fff)" }}>
          <Sparkles className="h-3 w-3" /> IRIS Recommends
        </div>
      )}
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: expert.avatar_color ?? "#3b7fff" }}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground">
            {expert.display_name ?? "Unnamed"}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {expert.programs_experience[0] ?? expert.email ?? ""}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {expert.expertise_areas.slice(0, 4).map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
          {isPrimary && irisLine && (
            <p className="mt-2 rounded-md bg-background/40 px-2.5 py-1.5 text-[11px] italic text-foreground/90">
              "{irisLine}"
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available
          </span>
        </div>
      </div>
    </button>
  );
}

function ExternalCard({
  expert,
  selected,
  onSelect,
}: {
  expert: ExternalExpert;
  selected: boolean;
  onSelect: () => void;
}) {
  const initials = expert.name.slice(0, 2).toUpperCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-[12px] border p-3 text-left transition ${
        selected
          ? "border-primary bg-primary/[0.06] ring-1 ring-inset ring-primary/40"
          : "border-border bg-surface/60 hover:bg-surface-hover"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[11px] font-semibold text-white">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">{expert.name}</span>
            <Chip tone="violet">External</Chip>
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {[expert.title, expert.org].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {expert.domain_tags.slice(0, 4).map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
          {expert.reasons.length > 0 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="mr-1 inline h-3 w-3 text-violet-400" />
              {expert.reasons.join(" · ")}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted-foreground">
          {expert.avg_response_hours != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> ~{expert.avg_response_hours}h
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─────────────────── Step 3 — IRIS-Drafted Ask ─────────────────── */

function Step3Ask({
  loading,
  subject,
  setSubject,
  body,
  setBody,
  urgency,
  setUrgency,
  context,
}: {
  loading: boolean;
  subject: string;
  setSubject: (s: string) => void;
  body: string;
  setBody: (s: string) => void;
  urgency: "urgent" | "standard" | "fyi";
  setUrgency: (u: "urgent" | "standard" | "fyi") => void;
  context: ConsultContextSnapshot;
}) {
  if (loading) return <Loading text="IRIS is drafting the ask…" />;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Step 3 · Review & send
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          IRIS drafted this from PRISIM™ context. Edit anything before sending.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["urgent", "standard", "fyi"] as const).map((u) => (
          <button
            key={u}
            onClick={() => setUrgency(u)}
            className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
              urgency === u
                ? u === "urgent"
                  ? "border-red-500/50 bg-red-500/10 text-red-300"
                  : u === "standard"
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-surface text-foreground"
                : "border-border bg-background/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          The ask
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={11}
          className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
        />
      </div>

      {(context.point_value || context.pens_down_date || context.iris_risk_flag) && (
        <div className="rounded-md border border-border bg-background/30 p-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Attached context (sent with the ask)
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {context.point_value != null && <Chip>{context.point_value} pts</Chip>}
            {context.pens_down_date && <Chip>Due {context.pens_down_date}</Chip>}
            {context.iris_risk_flag && <Chip tone="amber">{context.iris_risk_flag}</Chip>}
            {context.draft_so_far && <Chip>Draft attached</Chip>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── tiny helpers ─────────────────── */

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "violet" }) {
  const cls =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : tone === "violet"
        ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
        : "bg-white/[0.06] text-foreground border-transparent";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>{children}</span>
  );
}

function Loading({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-[12px] text-muted-foreground">{text}</div>;
}

/* ───────────────────────── global event listener ───────────────────────── */
/**
 * Mount once near the flight deck to handle ⌘K "Phone a Friend" launches.
 */
export function PhoneAFriendListener({
  missionId,
  questionId,
  questionNumber,
  meId,
  meName,
}: {
  missionId: string;
  questionId: string;
  questionNumber: string;
  meId: string | null;
  meName: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atlas:open-phone-a-friend", onOpen);
    return () => window.removeEventListener("atlas:open-phone-a-friend", onOpen);
  }, []);
  if (!open) return null;
  return (
    <PhoneAFriendOverlay
      missionId={missionId}
      questionId={questionId}
      questionNumber={questionNumber}
      meId={meId}
      meName={meName}
      onClose={() => setOpen(false)}
    />
  );
}
