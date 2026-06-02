import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { toast } from "sonner";
import { X, Sparkles, HelpCircle, Check } from "lucide-react";

/** Open the modal from anywhere. Optionally pre-select a question. */
export function openUpdateReality(questionId?: string | null) {
  window.dispatchEvent(
    new CustomEvent("update-reality:open", { detail: { questionId: questionId ?? null } }),
  );
}

type Step = "choose" | "learned" | "need";
type NeedKind = "direction" | "decision" | "help" | "air_cover";

const NEED_LABEL: Record<NeedKind, string> = {
  direction: "Direction",
  decision: "Decision",
  help: "Help",
  air_cover: "Air Cover",
};

type WriterQ = { id: string; question_number: string; title: string };

export function UpdateRealityHost({ missionId, role }: { missionId: string; role: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  const [needKind, setNeedKind] = useState<NeedKind | null>(null);
  const [text, setText] = useState("");
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isWriter = role === "writer" || role === null; // also show to admins for testing? spec says writer-only for button. Modal can still open from workspace for anyone.

  // Listen for global open events
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail ?? {};
      setQuestionId(detail.questionId ?? null);
      setStep("choose");
      setNeedKind(null);
      setText("");
      setOpen(true);
    }
    window.addEventListener("update-reality:open", onOpen);
    return () => window.removeEventListener("update-reality:open", onOpen);
  }, []);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Load writer's assigned questions for the dropdown
  const { data: questions = [] } = useQuery({
    queryKey: ["update-reality-myq", missionId],
    enabled: open && (step === "learned" || step === "need"),
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return [];
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,assigned_writer_id")
        .eq("mission_id", missionId);
      const rows = (data ?? []) as Array<WriterQ & { assigned_writer_id: string | null }>;
      const mine = rows.filter((r) => r.assigned_writer_id === uid);
      const list = mine.length > 0 ? mine : rows; // fallback to all so non-writers can still pick
      return list
        .sort((a, b) => a.question_number.localeCompare(b.question_number, undefined, { numeric: true }))
        .map((r) => ({ id: r.id, question_number: r.question_number, title: r.title }));
    },
  });

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === questionId) ?? null,
    [questions, questionId],
  );

  async function getMe() {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) throw new Error("Not signed in");
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name,email")
      .eq("id", user.id)
      .maybeSingle();
    const name = profile?.display_name || profile?.email?.split("@")[0] || "Unknown";
    return { user, name };
  }

  async function submitNothingChanged() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { user, name } = await getMe();
      const { error } = await supabase.from("question_collaboration").insert({
        question_id: questionId ?? "00000000-0000-0000-0000-000000000000",
        mission_id: missionId,
        author_id: user.id,
        author_name: name,
        entry_type: "signal",
        body: "Nothing Changed",
        resolved: true,
      });
      // If question_id is required (NOT NULL), the no-question case will fail.
      // Fall back: only insert collab when there's a question, else just emit signal.
      if (error && !questionId) {
        // emit mission-level signal only
        await createSignal({
          mission_id: missionId,
          source_module: "update_reality",
          signal_type: "comment_added",
          signal_title: "Nothing changed",
          signal_summary: "Status check — no change",
          severity: "info",
        }, qc);
      } else if (error) {
        throw error;
      } else {
        await createSignal({
          mission_id: missionId,
          source_module: "update_reality",
          signal_type: "comment_added",
          signal_title: "Nothing changed",
          signal_summary: "Status check — no change",
          severity: "info",
          related_question_id: questionId,
        }, qc);
      }
      toast.success("Signal received. Keep going.");
      qc.invalidateQueries({ queryKey: ["question-collabs", questionId] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLearned() {
    if (submitting) return;
    const body = text.trim();
    if (!body) return;
    setSubmitting(true);
    try {
      const { user, name } = await getMe();
      if (questionId) {
        const { error } = await supabase.from("question_collaboration").insert({
          question_id: questionId,
          mission_id: missionId,
          author_id: user.id,
          author_name: name,
          entry_type: "note",
          body,
          resolved: false,
        });
        if (error) throw error;
      }
      await createSignal({
        mission_id: missionId,
        source_module: "update_reality",
        signal_type: "comment_added",
        signal_title: `Writer learned something${selectedQuestion ? ` · Q${selectedQuestion.question_number}` : ""}`,
        signal_summary: body,
        severity: "info",
        related_question_id: questionId,
      }, qc);
      toast.success("Intelligence logged.");
      qc.invalidateQueries({ queryKey: ["question-collabs", questionId] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNeed() {
    if (submitting || !needKind) return;
    const body = text.trim();
    if (!body) return;
    setSubmitting(true);
    try {
      const { user, name } = await getMe();
      // Map need kind to existing entry_type, encode original need in body
      const entryType =
        needKind === "decision" ? "decision_needed"
        : needKind === "air_cover" ? "decision_needed"
        : "sme_request";
      const taggedBody = `[NEED: ${NEED_LABEL[needKind].toUpperCase()}] ${body}`;
      if (questionId) {
        const { error } = await supabase.from("question_collaboration").insert({
          question_id: questionId,
          mission_id: missionId,
          author_id: user.id,
          author_name: name,
          entry_type: entryType,
          body: taggedBody,
          resolved: false,
        });
        if (error) throw error;
      }
      await createSignal({
        mission_id: missionId,
        source_module: "update_reality",
        signal_type: "decision_needed",
        signal_title: `Need ${NEED_LABEL[needKind]}${selectedQuestion ? ` · Q${selectedQuestion.question_number}` : " · General"} · ${name}`,
        signal_summary: body,
        severity: needKind === "air_cover" || needKind === "decision" ? "critical" : "warning",
        related_question_id: questionId,
        tags: [`need:${needKind}`],
      }, qc);
      toast.success("Leadership has been notified.");
      qc.invalidateQueries({ queryKey: ["question-collabs", questionId] });
      qc.invalidateQueries({ queryKey: ["leadership-attention"] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Persistent floating button — writers only */}
      {isWriter && (
        <button
          onClick={() => openUpdateReality(null)}
          className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90"
          aria-label="Update Reality"
        >
          ⚡ Update Reality
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Update Reality</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {step === "choose" && (
              <div className="grid grid-cols-1 gap-3">
                <ChoiceCard
                  icon={<Sparkles className="h-5 w-5" />}
                  title="I Learned Something"
                  subtitle="Share new intelligence with the team"
                  color="#22c55e"
                  onClick={() => { setStep("learned"); }}
                />
                <ChoiceCard
                  icon={<HelpCircle className="h-5 w-5" />}
                  title="I Need Something"
                  subtitle="Direction / decision / help / air cover"
                  color="#f59e0b"
                  onClick={() => { setStep("need"); }}
                />
                <ChoiceCard
                  icon={<Check className="h-5 w-5" />}
                  title="Nothing Changed"
                  subtitle="Signal received, work continuing as planned"
                  color="#8b9ab5"
                  onClick={submitNothingChanged}
                  disabled={submitting}
                />
              </div>
            )}

            {step === "learned" && (
              <div className="space-y-3">
                <QuestionPicker
                  questions={questions}
                  value={questionId}
                  onChange={setQuestionId}
                />
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    What did you learn?
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 280))}
                    placeholder="New state guidance, SME input, competitive intel, changed requirement…"
                    rows={4}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
                    autoFocus
                  />
                  <div className="mt-1 text-right text-[10px] text-muted-foreground">{text.length}/280</div>
                </div>
                <div className="flex items-center justify-between">
                  <button onClick={() => setStep("choose")} className="text-[11px] text-muted-foreground hover:text-foreground">← Back</button>
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    <button
                      onClick={submitLearned}
                      disabled={submitting || !text.trim()}
                      className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {submitting ? "Sending…" : "Submit Signal"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === "need" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    What do you need?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(NEED_LABEL) as NeedKind[]).map((k) => {
                      const active = needKind === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setNeedKind(k)}
                          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                            active
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                          }`}
                        >
                          {NEED_LABEL[k]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <QuestionPicker
                  questions={questions}
                  value={questionId}
                  onChange={setQuestionId}
                  optional
                />
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Describe what you need
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, 280))}
                    placeholder="Be specific. Leadership will respond here."
                    rows={4}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
                    autoFocus
                  />
                  <div className="mt-1 text-right text-[10px] text-muted-foreground">{text.length}/280</div>
                </div>
                <div className="flex items-center justify-between">
                  <button onClick={() => setStep("choose")} className="text-[11px] text-muted-foreground hover:text-foreground">← Back</button>
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    <button
                      onClick={submitNeed}
                      disabled={submitting || !needKind || !text.trim()}
                      className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {submitting ? "Sending…" : "Submit — Notify Leadership"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ChoiceCard({
  icon, title, subtitle, color, onClick, disabled,
}: {
  icon: React.ReactNode; title: string; subtitle: string; color: string;
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-start gap-3 rounded-lg border border-border bg-background/40 p-4 text-left transition hover:border-[--c] hover:bg-[--c]/5 disabled:opacity-50"
      style={{ ["--c" as any]: color }}
    >
      <span className="mt-0.5 shrink-0 rounded-md p-2" style={{ background: `${color}1a`, color }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

function QuestionPicker({
  questions, value, onChange, optional,
}: {
  questions: WriterQ[];
  value: string | null;
  onChange: (v: string | null) => void;
  optional?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Which question?{optional ? " (optional)" : ""}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
      >
        <option value="">General / not question-specific</option>
        {questions.map((q) => (
          <option key={q.id} value={q.id}>
            Q{q.question_number} · {q.title}
          </option>
        ))}
      </select>
    </div>
  );
}
