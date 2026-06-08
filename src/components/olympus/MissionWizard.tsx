import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { runWizardIrisAnalysis } from "@/lib/mission-wizard-iris.functions";

const TOTAL_STEPS = 7;
const GOLD = "#C9A84C";
const NAVY = "#1F3864";

const STEP_META: Record<number, { name: string; subtitle: string }> = {
  1: { name: "Mission Identity", subtitle: "Define the mission foundation — this becomes the official record" },
  2: { name: "Source Materials", subtitle: "Give IRIS everything it needs to build your mission record" },
  3: { name: "IRIS Analysis", subtitle: "IRIS is reading your materials and building the mission record" },
  4: { name: "Review & Edit Record", subtitle: "IRIS drafted this — review it and correct anything before staging the team" },
  5: { name: "Build the Team", subtitle: "Stage your team — no invites go out until you launch" },
  6: { name: "Strategy", subtitle: "Coming soon" },
  7: { name: "Launch", subtitle: "Coming soon" },
};


const DOC_SLOTS: { type: string; label: string }[] = [
  { type: "rfp", label: "RFP" },
  { type: "sow", label: "SOW" },
  { type: "model_contract", label: "Model Contract" },
  { type: "win_themes", label: "Win Themes" },
  { type: "client_materials", label: "Client Materials" },
  { type: "pricing_notes", label: "Pricing Notes" },
  { type: "team_notes", label: "Team Notes" },
  { type: "known_risks", label: "Known Risks" },
];

const ENGAGEMENT_TYPES = ["Proposal", "Task Order", "IDIQ", "BPA", "Sole Source", "Other"];

const IRIS_PHASES = [
  "Reading source materials…",
  "Identifying requirements…",
  "Analyzing risks…",
  "Drafting mission record…",
  "Analysis complete ✓",
];

type KeyDate = { label: string; date: string; note: string };
type KeyRisk = { risk: string; mitigation: string };
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type ReviewData = {
  mission_overview: string;
  risk_level: RiskLevel;
  key_dates: KeyDate[];
  major_requirements: string[];
  deliverables: string[];
  key_risks: KeyRisk[];
  required_expertise: string[];
  client_sensitivities: string[];
  recommended_win_themes: string[];
  suggested_sections: string[];
  compliance_flags: string[];
  staffing_notes?: string;
  setup_checklist_notes?: string;
  [k: string]: unknown;
};

type Props = {
  open: boolean;
  onClose: () => void;
  missionId?: string;
  startStep?: number;
};

export default function MissionWizard({ open, onClose, missionId: initialMissionId, startStep = 1 }: Props) {
  const qc = useQueryClient();
  const runIris = useServerFn(runWizardIrisAnalysis);
  const [step, setStep] = useState(startStep);
  const [missionId, setMissionId] = useState<string | null>(initialMissionId ?? null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Step 3 IRIS analysis state
  const [irisState, setIrisState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [irisPhase, setIrisPhase] = useState(0);
  const [irisError, setIrisError] = useState<string | null>(null);

  // Step 4 review state
  const [review, setReview] = useState<ReviewData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewIntelId, setReviewIntelId] = useState<string | null>(null);


  // Step 1 state
  const [s1, setS1] = useState({
    name: "",
    client: "",
    prime_contractor: "",
    state: "",
    program_type: "",
    submission_date: "",
    engagement_type: "",
    internal_lead: "",
    operations_lead: "",
    engagement_lead: "",
  });

  // Step 2 state
  const [docs, setDocs] = useState<Record<string, { url: string; notes: string }>>(
    () => Object.fromEntries(DOC_SLOTS.map((d) => [d.type, { url: "", notes: "" }])),
  );

  const isEditMode = !!initialMissionId;

  useEffect(() => {
    if (open) {
      setStep(startStep);
      setErr(null);
    }
  }, [open, startStep]);

  // Edit-mode prefill: load existing mission + documents
  useEffect(() => {
    if (!open || !initialMissionId) return;
    let cancelled = false;
    (async () => {
      const { data: m } = await supabase
        .from("missions")
        .select("*")
        .eq("id", initialMissionId)
        .maybeSingle();
      if (cancelled || !m) return;
      const row = m as Record<string, unknown>;
      setS1({
        name: (row.name as string) ?? "",
        client: (row.client as string) ?? "",
        prime_contractor: (row.prime_contractor as string) ?? "",
        state: (row.state as string) ?? "",
        program_type: (row.program_type as string) ?? "",
        submission_date: (row.submission_date as string) ?? "",
        engagement_type: (row.engagement_type as string) ?? "",
        internal_lead: (row.internal_lead as string) ?? "",
        operations_lead: (row.operations_lead as string) ?? "",
        engagement_lead: (row.engagement_lead as string) ?? "",
      });

      const { data: dRows } = await supabase
        .from("mission_documents")
        .select("doc_type,file_url,notes")
        .eq("mission_id", initialMissionId);
      if (cancelled) return;
      const next: Record<string, { url: string; notes: string }> = Object.fromEntries(
        DOC_SLOTS.map((d) => [d.type, { url: "", notes: "" }]),
      );
      for (const r of (dRows ?? []) as Array<{ doc_type: string | null; file_url: string | null; notes: string | null }>) {
        if (r.doc_type && next[r.doc_type]) {
          next[r.doc_type] = { url: r.file_url ?? "", notes: r.notes ?? "" };
        }
      }
      setDocs(next);
    })();
    return () => { cancelled = true; };
  }, [open, initialMissionId]);


  if (!open) return null;

  const close = () => {
    if (step > 1) {
      const ok = window.confirm("Close the wizard? Progress on this step won't be saved.");
      if (!ok) return;
    }
    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
    onClose();
  };

  const saveStep1 = async () => {
    setErr(null);
    if (!s1.name.trim() || !s1.client.trim()) {
      setErr("Mission Name and Client / Agency are required.");
      return false;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: s1.name.trim(),
      client: s1.client.trim(),
    };
    if (!isEditMode) {
      payload.status = "DRAFT";
      payload.wizard_step = 1;
    }
    for (const k of [
      "prime_contractor",
      "state",
      "program_type",
      "engagement_type",
      "internal_lead",
      "operations_lead",
      "engagement_lead",
    ] as const) {
      payload[k] = s1[k].trim() || null;
    }
    payload.submission_date = s1.submission_date || null;

    if (isEditMode && missionId) {
      const { error } = await supabase
        .from("missions")
        .update(payload as never)
        .eq("id", missionId);
      setSaving(false);
      if (error) { setErr(error.message); return false; }
      toast.success("Mission updated");
      return true;
    }

    const { data, error } = await supabase.from("missions").insert(payload as never).select("id").single();
    if (error || !data) {
      setSaving(false);
      setErr(error?.message ?? "Failed to create mission");
      return false;
    }
    const newId = data.id as string;
    await supabase.from("mission_readiness").insert({ mission_id: newId });
    setMissionId(newId);
    setSaving(false);
    toast.success("Mission created");
    return true;
  };

  const saveStep2 = async () => {
    if (!missionId) {
      setErr("Mission not created yet.");
      return false;
    }
    setSaving(true);
    setErr(null);
    // Replace existing rows for the slots we manage
    if (isEditMode) {
      await supabase
        .from("mission_documents")
        .delete()
        .eq("mission_id", missionId)
        .in("doc_type", DOC_SLOTS.map((d) => d.type));
    }
    const rows = DOC_SLOTS
      .map((slot) => {
        const v = docs[slot.type];
        if (!v.url.trim() && !v.notes.trim()) return null;
        return {
          mission_id: missionId,
          doc_type: slot.type,
          file_url: v.url.trim() || null,
          notes: v.notes.trim() || null,
        };
      })
      .filter(Boolean) as { mission_id: string; doc_type: string; file_url: string | null; notes: string | null }[];

    if (rows.length > 0) {
      const { error } = await supabase.from("mission_documents").insert(rows as never);
      if (error) {
        setSaving(false);
        setErr(error.message);
        return false;
      }
    }
    await supabase.from("missions").update({ wizard_step: 2 }).eq("id", missionId);
    setSaving(false);
    toast.success("Materials saved — IRIS will analyze these now");
    return true;
  };

  const saveStep4 = async () => {
    if (!missionId || !review) return false;
    setSaving(true);
    setErr(null);
    let q = supabase.from("mission_intelligence").update({ content: review as never } as never);
    q = reviewIntelId
      ? q.eq("id", reviewIntelId)
      : q.eq("mission_id", missionId).eq("layer", "wizard_analysis");
    const { error } = await q;
    if (error) {
      setSaving(false);
      setErr(error.message);
      return false;
    }
    await supabase.from("missions").update({ wizard_step: 4 } as never).eq("id", missionId);
    setSaving(false);
    toast.success("Mission record confirmed");
    return true;
  };

  const saveStep5 = async () => {
    if (!missionId) return false;
    setSaving(true);
    setErr(null);
    const { error } = await supabase
      .from("missions")
      .update({ wizard_step: 5 } as never)
      .eq("id", missionId);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return false;
    }
    return true;
  };

  const handleContinue = async () => {
    let ok = true;
    if (step === 1) ok = await saveStep1();
    else if (step === 2) ok = await saveStep2();
    else if (step === 4) ok = await saveStep4();
    else if (step === 5) ok = await saveStep5();
    if (!ok) return;
    if (step >= TOTAL_STEPS) {
      qc.invalidateQueries({ queryKey: ["olympus-missions"] });
      onClose();
      return;
    }
    setStep(step + 1);
  };

  const skipStep2 = () => {
    setStep(3);
  };

  const skipStep5 = () => {
    setStep(6);
  };


  const startIris = async () => {
    if (!missionId) return;
    setIrisState("running");
    setIrisError(null);
    setIrisPhase(0);
    try {
      await runIris({ data: { missionId } });
      setIrisPhase(IRIS_PHASES.length - 1);
      setIrisState("done");
      toast.success("IRIS analysis complete");
      setTimeout(() => setStep((s) => (s === 3 ? 4 : s)), 1500);
    } catch (e) {
      setIrisError(e instanceof Error ? e.message : "Analysis failed");
      setIrisState("error");
    }
  };

  // Auto-trigger IRIS when entering step 3; skip if analysis already exists (edit-mode resume)
  useEffect(() => {
    if (step !== 3 || irisState !== "idle" || !missionId) return;
    let cancelled = false;
    (async () => {
      const { data: existing } = await supabase
        .from("mission_intelligence")
        .select("id")
        .eq("mission_id", missionId)
        .eq("layer", "wizard_analysis")
        .maybeSingle();
      if (cancelled) return;
      if (existing) {
        setIrisState("done");
        setIrisPhase(IRIS_PHASES.length - 1);
      } else {
        void startIris();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, missionId]);


  // Cycle phase text while running
  useEffect(() => {
    if (irisState !== "running") return;
    const t = setInterval(() => {
      setIrisPhase((p) => Math.min(p + 1, IRIS_PHASES.length - 2));
    }, 1800);
    return () => clearInterval(t);
  }, [irisState]);

  // Load review data when entering Step 4
  useEffect(() => {
    if (step !== 4 || !missionId) return;
    if (review) return;
    let cancelled = false;
    (async () => {
      setReviewLoading(true);
      const { data: row } = await supabase
        .from("mission_intelligence")
        .select("id,content")
        .eq("mission_id", missionId)
        .eq("layer", "wizard_analysis")
        .maybeSingle();
      if (cancelled) return;
      if (row) {
        setReviewIntelId((row as { id: string }).id);
        const c = ((row as { content: unknown }).content ?? {}) as Partial<ReviewData>;
        setReview(normalizeReview(c));
      } else {
        setReview(normalizeReview({}));
      }
      setReviewLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, missionId]);

  const rerunIris = () => {
    setReview(null);
    setReviewIntelId(null);
    setIrisState("idle");
    setIrisPhase(0);
    setIrisError(null);
    setStep(3);
  };

  const meta = STEP_META[step];
  const progressPct = (step / TOTAL_STEPS) * 100;


  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ backgroundColor: "rgba(10, 14, 26, 0.95)" }}
    >
      <div className="relative my-auto w-full max-w-[900px] rounded-xl border border-border bg-background shadow-2xl">
        {/* Close */}
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          aria-label="Close wizard"
        >
          <X size={18} />
        </button>

        {/* Progress */}
        <div className="px-6 pt-6 sm:px-10">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            <span>Step {step} of {TOTAL_STEPS}</span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${progressPct}%`, backgroundColor: GOLD }}
            />
          </div>
          <h2 className="mt-5 text-xl font-bold text-foreground sm:text-2xl">{meta.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{meta.subtitle}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-6 sm:px-10">
          {step === 1 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Mission Name *">
                <Input value={s1.name} onChange={(v) => setS1({ ...s1, name: v })} autoFocus />
              </Field>
              <Field label="Submission Date">
                <Input type="date" value={s1.submission_date} onChange={(v) => setS1({ ...s1, submission_date: v })} />
              </Field>
              <Field label="Client / Agency *">
                <Input value={s1.client} onChange={(v) => setS1({ ...s1, client: v })} />
              </Field>
              <Field label="Engagement Type">
                <select
                  value={s1.engagement_type}
                  onChange={(e) => setS1({ ...s1, engagement_type: e.target.value })}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {ENGAGEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Prime Contractor">
                <Input value={s1.prime_contractor} onChange={(v) => setS1({ ...s1, prime_contractor: v })} />
              </Field>
              <Field label="Internal Lead">
                <Input value={s1.internal_lead} onChange={(v) => setS1({ ...s1, internal_lead: v })} />
              </Field>
              <Field label="State">
                <Input value={s1.state} onChange={(v) => setS1({ ...s1, state: v })} placeholder="e.g. New Jersey" />
              </Field>
              <Field label="Operations Lead">
                <Input value={s1.operations_lead} onChange={(v) => setS1({ ...s1, operations_lead: v })} />
              </Field>
              <Field label="Program Type">
                <Input value={s1.program_type} onChange={(v) => setS1({ ...s1, program_type: v })} placeholder="e.g. CSOC" />
              </Field>
              <Field label="Engagement Lead">
                <Input value={s1.engagement_lead} onChange={(v) => setS1({ ...s1, engagement_lead: v })} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DOC_SLOTS.map((slot) => {
                const v = docs[slot.type];
                const hasContent = !!(v.url.trim() || v.notes.trim());
                return (
                  <div key={slot.type} className="rounded-lg border border-border bg-surface/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wider text-foreground">{slot.label}</div>
                      {hasContent && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                          ✓ Saved
                        </span>
                      )}
                    </div>
                    <input
                      value={v.url}
                      onChange={(e) => setDocs({ ...docs, [slot.type]: { ...v, url: e.target.value } })}
                      placeholder="Paste link or URL"
                      className="mb-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                    />
                    <textarea
                      value={v.notes}
                      maxLength={3000}
                      onChange={(e) => setDocs({ ...docs, [slot.type]: { ...v, notes: e.target.value } })}
                      placeholder="Or paste text or notes..."
                      rows={3}
                      className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                    />
                  </div>
                );
              })}
              <div className="sm:col-span-2 text-right">
                <button
                  type="button"
                  onClick={skipStep2}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div
              className="rounded-xl border p-10 text-center"
              style={{ backgroundColor: NAVY, borderColor: GOLD + "40" }}
            >
              {irisState === "running" || irisState === "done" ? (
                <div className="flex flex-col items-center gap-5 text-white">
                  {irisState === "running" && (
                    <div
                      className="h-12 w-12 animate-spin rounded-full border-[3px] border-white/20"
                      style={{ borderTopColor: GOLD }}
                    />
                  )}
                  {irisState === "done" && (
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold text-black"
                      style={{ backgroundColor: GOLD }}
                    >
                      ✓
                    </div>
                  )}
                  <div
                    key={irisPhase}
                    className="animate-in fade-in text-sm font-medium"
                    style={{ color: GOLD }}
                  >
                    {IRIS_PHASES[irisPhase]}
                  </div>
                  <div className="text-xs text-white/60">
                    IRIS is building your mission record. This usually takes 10–30 seconds.
                  </div>
                </div>
              ) : irisState === "error" ? (
                <div className="flex flex-col items-center gap-4 text-white">
                  <div className="text-sm font-medium text-rose-200">
                    IRIS analysis could not complete. You can continue and fill in the record manually.
                  </div>
                  {irisError && <div className="text-xs text-white/60">{irisError}</div>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void startIris()}
                      className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                    >
                      Try Again
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="rounded-md px-3 py-1.5 text-xs font-semibold text-black"
                      style={{ backgroundColor: GOLD }}
                    >
                      Continue Without IRIS →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-white/70">Preparing analysis…</div>
              )}
            </div>
          )}

          {step === 4 && (
            reviewLoading || !review ? (
              <div className="rounded-lg border border-dashed border-border bg-surface/30 p-10 text-center text-sm text-muted-foreground">
                Loading IRIS draft…
              </div>
            ) : (
              <ReviewForm
                review={review}
                onChange={setReview}
                onRerun={rerunIris}
              />
            )
          )}

          {step === 5 && missionId && (
            <TeamStep missionId={missionId} onSkip={skipStep5} />
          )}

          {step >= 6 && (
            <div className="rounded-lg border border-dashed border-border bg-surface/30 p-10 text-center text-sm text-muted-foreground">
              {meta.name} — coming soon.
            </div>
          )}


          {err && (
            <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {err}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 sm:px-10">
          <button
            type="button"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || saving}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            className="rounded-md px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
            style={{ backgroundColor: GOLD }}
          >
            {saving ? "Saving…" : step >= TOTAL_STEPS ? "Finish" : "Save & Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
    />
  );
}

// ---------- Step 4 helpers ----------

function normalizeReview(c: Partial<ReviewData>): ReviewData {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const lvl = (c.risk_level as string | undefined)?.toUpperCase();
  const risk_level: RiskLevel = lvl === "LOW" || lvl === "HIGH" ? lvl : "MEDIUM";
  const key_dates: KeyDate[] = Array.isArray(c.key_dates)
    ? (c.key_dates as KeyDate[]).map((d) => ({
        label: d?.label ?? "",
        date: d?.date ?? "",
        note: d?.note ?? "",
      }))
    : [];
  const key_risks: KeyRisk[] = Array.isArray(c.key_risks)
    ? (c.key_risks as KeyRisk[]).map((d) => ({
        risk: d?.risk ?? "",
        mitigation: d?.mitigation ?? "",
      }))
    : [];
  return {
    mission_overview: typeof c.mission_overview === "string" ? c.mission_overview : "",
    risk_level,
    key_dates,
    major_requirements: arr(c.major_requirements),
    deliverables: arr(c.deliverables),
    key_risks,
    required_expertise: arr(c.required_expertise),
    client_sensitivities: arr(c.client_sensitivities),
    recommended_win_themes: arr(c.recommended_win_themes),
    suggested_sections: arr(c.suggested_sections),
    compliance_flags: arr(c.compliance_flags),
    staffing_notes: typeof c.staffing_notes === "string" ? c.staffing_notes : "",
    setup_checklist_notes:
      typeof c.setup_checklist_notes === "string" ? c.setup_checklist_notes : "",
  };
}

const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  HIGH: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

function ReviewForm({
  review,
  onChange,
  onRerun,
}: {
  review: ReviewData;
  onChange: (r: ReviewData) => void;
  onRerun: () => void;
}) {
  const update = <K extends keyof ReviewData>(k: K, v: ReviewData[K]) =>
    onChange({ ...review, [k]: v });

  const cycleRisk = () => {
    const next: RiskLevel =
      review.risk_level === "LOW" ? "MEDIUM" : review.risk_level === "MEDIUM" ? "HIGH" : "LOW";
    update("risk_level", next);
  };

  return (
    <div className="space-y-8">
      {/* Mission Overview */}
      <Section title="Mission Overview">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Risk Level
          </span>
          <button
            type="button"
            onClick={cycleRisk}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${RISK_COLORS[review.risk_level]}`}
            title="Click to change"
          >
            {review.risk_level}
          </button>
        </div>
        <textarea
          value={review.mission_overview}
          onChange={(e) => update("mission_overview", e.target.value)}
          rows={5}
          className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </Section>

      {/* Key Dates */}
      <Section title="Key Dates">
        <DateTable
          rows={review.key_dates}
          onChange={(rows) => update("key_dates", rows)}
        />
      </Section>

      {/* Requirements + Deliverables */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Section title="Major Requirements">
          <TagList
            values={review.major_requirements}
            onChange={(v) => update("major_requirements", v)}
            placeholder="Add requirement…"
          />
        </Section>
        <Section title="Deliverables">
          <TagList
            values={review.deliverables}
            onChange={(v) => update("deliverables", v)}
            placeholder="Add deliverable…"
          />
        </Section>
      </div>

      {/* Risks */}
      <Section title="Risks">
        <RiskTable
          rows={review.key_risks}
          onChange={(rows) => update("key_risks", rows)}
        />
      </Section>

      {/* Team & Win Strategy */}
      <Section title="Team & Win Strategy">
        <div className="space-y-4">
          <SubField label="Required Expertise">
            <TagList
              values={review.required_expertise}
              onChange={(v) => update("required_expertise", v)}
              placeholder="Add expertise…"
            />
          </SubField>
          <SubField label="Client Sensitivities">
            <TagList
              values={review.client_sensitivities}
              onChange={(v) => update("client_sensitivities", v)}
              placeholder="Add sensitivity…"
            />
          </SubField>
          <SubField label="Recommended Win Themes">
            <TagList
              values={review.recommended_win_themes}
              onChange={(v) => update("recommended_win_themes", v)}
              placeholder="Add win theme…"
            />
          </SubField>
        </div>
      </Section>

      {/* Sections */}
      <Section title="Sections (will populate Atlas after launch)">
        <TagList
          values={review.suggested_sections}
          onChange={(v) => update("suggested_sections", v)}
          placeholder="Add section…"
        />
        <p className="mt-2 text-[11px] italic text-muted-foreground">
          These will pre-populate Atlas section assignments when the mission launches.
        </p>
      </Section>

      {/* Compliance Flags */}
      <Section title="Compliance Flags">
        <TagList
          values={review.compliance_flags}
          onChange={(v) => update("compliance_flags", v)}
          placeholder="Add compliance flag…"
        />
      </Section>

      <div className="flex justify-end border-t border-border pt-4">
        <button
          type="button"
          onClick={onRerun}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ↻ Re-run IRIS
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3
        className="mb-3 text-xs font-bold uppercase tracking-[0.18em]"
        style={{ color: GOLD }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function SubField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function TagList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...values, t]);
    setDraft("");
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.length === 0 && (
          <span className="text-xs italic text-muted-foreground">No items yet.</span>
        )}
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-rose-400"
              aria-label="Remove"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-surface-hover"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function DateTable({
  rows,
  onChange,
}: {
  rows: KeyDate[];
  onChange: (r: KeyDate[]) => void;
}) {
  const upd = (i: number, patch: Partial<KeyDate>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_140px_1.5fr_28px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground sm:grid">
        <div>Label</div>
        <div>Date</div>
        <div>Note</div>
        <div />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_1.5fr_28px]">
          <input
            value={r.label}
            onChange={(e) => upd(i, { label: e.target.value })}
            placeholder="Label"
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
          />
          <input
            type="date"
            value={r.date}
            onChange={(e) => upd(i, { date: e.target.value })}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
          />
          <input
            value={r.note}
            onChange={(e) => upd(i, { note: e.target.value })}
            placeholder="Note"
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="text-muted-foreground hover:text-rose-400"
            aria-label="Remove date"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { label: "", date: "", note: "" }])}
        className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        + Add Date
      </button>
    </div>
  );
}

function RiskTable({
  rows,
  onChange,
}: {
  rows: KeyRisk[];
  onChange: (r: KeyRisk[]) => void;
}) {
  const upd = (i: number, patch: Partial<KeyRisk>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_1.5fr_28px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground sm:grid">
        <div>Risk</div>
        <div>Mitigation</div>
        <div />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_28px]">
          <textarea
            value={r.risk}
            onChange={(e) => upd(i, { risk: e.target.value })}
            placeholder="Risk"
            rows={2}
            className="resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
          />
          <textarea
            value={r.mitigation}
            onChange={(e) => upd(i, { mitigation: e.target.value })}
            placeholder="Mitigation"
            rows={2}
            className="resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="text-muted-foreground hover:text-rose-400"
            aria-label="Remove risk"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { risk: "", mitigation: "" }])}
        className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        + Add Risk
      </button>
    </div>
  );
}

// ---------- Step 5: Build the Team ----------

const TEAM_ROLES = [
  "Engagement Lead",
  "Operations Lead",
  "Project Manager",
  "SME",
  "Writer",
  "Copy Editor",
  "QA Reviewer",
  "Client Contact",
];

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  assigned_sections: string[] | null;
  start_date: string | null;
  talentdesk_status: string | null;
  contract_status: string | null;
  nda_status: string | null;
  baa_required: boolean | null;
  client_system_access: boolean | null;
  slack_access: boolean | null;
  folder_access: boolean | null;
};

function TeamStep({ missionId, onSkip }: { missionId: string; onSkip: () => void }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAccess, setShowAccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: TEAM_ROLES[0],
    sections: "",
    start_date: "",
  });
  const [adding, setAdding] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const refresh = async () => {
    const { data } = await supabase
      .from("mission_team_members")
      .select("*")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true });
    setMembers((data ?? []) as unknown as TeamMember[]);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  const addMember = async () => {
    setFormErr(null);
    if (!form.name.trim()) {
      setFormErr("Name is required.");
      return;
    }
    if (!form.role.trim()) {
      setFormErr("Role is required.");
      return;
    }
    setAdding(true);
    const sections = form.sections
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: Record<string, unknown> = {
      mission_id: missionId,
      name: form.name.trim(),
      role: form.role,
      assigned_sections: sections,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.start_date) payload.start_date = form.start_date;

    const { error } = await supabase
      .from("mission_team_members")
      .insert(payload as never);
    setAdding(false);
    if (error) {
      setFormErr(error.message);
      return;
    }
    toast.success(`${form.name.trim()} added to team`);
    setForm({ name: "", email: "", role: TEAM_ROLES[0], sections: "", start_date: "" });
    void refresh();
  };

  const removeMember = async (m: TeamMember) => {
    if (!window.confirm(`Remove ${m.name} from the team?`)) return;
    const { error } = await supabase.from("mission_team_members").delete().eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member removed");
    void refresh();
  };

  const updateMember = async (id: string, patch: Partial<TeamMember>) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    const { error } = await supabase
      .from("mission_team_members")
      .update(patch as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      void refresh();
    }
  };

  const toggleAccess = (id: string, field: keyof TeamMember, current: boolean | null | string) => {
    if (field === "talentdesk_status" || field === "contract_status" || field === "nda_status") {
      const next = current === "complete" ? "pending" : "complete";
      void updateMember(id, { [field]: next } as Partial<TeamMember>);
    } else {
      void updateMember(id, { [field]: !current } as Partial<TeamMember>);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      {/* Left: Add Team Member */}
      <div className="rounded-lg border border-border bg-surface/40 p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
          Add Team Member
        </h3>
        <div className="space-y-3">
          <Field label="Name *">
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          </Field>
          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {TEAM_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned Sections">
            <Input
              value={form.sections}
              onChange={(v) => setForm({ ...form, sections: v })}
              placeholder="e.g. Section C, Management"
            />
          </Field>
          <Field label="Start Date">
            <Input
              type="date"
              value={form.start_date}
              onChange={(v) => setForm({ ...form, start_date: v })}
            />
          </Field>
          {formErr && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">
              {formErr}
            </div>
          )}
          <button
            type="button"
            onClick={addMember}
            disabled={adding}
            className="w-full rounded-md px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
            style={{ backgroundColor: GOLD }}
          >
            {adding ? "Adding…" : "Add to Team"}
          </button>
        </div>
      </div>

      {/* Right: Roster */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
          Team Roster
        </h3>
        {loading ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No team members yet. Add one on the left.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">Role</th>
                  <th className="px-2 py-2 text-left">Email</th>
                  <th className="px-2 py-2 text-left">Sections</th>
                  <th className="px-2 py-2 text-left">Start</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <TeamRow
                    key={m.id}
                    member={m}
                    editing={editingId === m.id}
                    onEdit={() => setEditingId(m.id)}
                    onCancel={() => setEditingId(null)}
                    onSave={async (patch) => {
                      await updateMember(m.id, patch);
                      setEditingId(null);
                      toast.success("Member updated");
                    }}
                    onRemove={() => removeMember(m)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Access Requirements */}
        {members.length > 0 && (
          <div className="mt-4 rounded-md border border-border">
            <button
              type="button"
              onClick={() => setShowAccess((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-surface-hover"
            >
              <span>Access Requirements</span>
              <span className="text-muted-foreground">{showAccess ? "▾" : "▸"}</span>
            </button>
            {showAccess && (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-[11px]">
                  <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">Name</th>
                      <th className="px-2 py-2">TalentDesk</th>
                      <th className="px-2 py-2">Contract</th>
                      <th className="px-2 py-2">NDA</th>
                      <th className="px-2 py-2">BAA Req.</th>
                      <th className="px-2 py-2">Client</th>
                      <th className="px-2 py-2">Slack</th>
                      <th className="px-2 py-2">Folder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-2 py-1.5">{m.name}</td>
                        <td className="px-2 py-1.5 text-center">
                          <Toggle
                            on={m.talentdesk_status === "complete"}
                            onClick={() => toggleAccess(m.id, "talentdesk_status", m.talentdesk_status)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Toggle
                            on={m.contract_status === "complete"}
                            onClick={() => toggleAccess(m.id, "contract_status", m.contract_status)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Toggle
                            on={m.nda_status === "complete"}
                            onClick={() => toggleAccess(m.id, "nda_status", m.nda_status)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Toggle
                            on={!!m.baa_required}
                            onClick={() => toggleAccess(m.id, "baa_required", m.baa_required)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Toggle
                            on={!!m.client_system_access}
                            onClick={() => toggleAccess(m.id, "client_system_access", m.client_system_access)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Toggle
                            on={!!m.slack_access}
                            onClick={() => toggleAccess(m.id, "slack_access", m.slack_access)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Toggle
                            on={!!m.folder_access}
                            onClick={() => toggleAccess(m.id, "folder_access", m.folder_access)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 text-right">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Skip — add team later
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamRow({
  member,
  editing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
}: {
  member: TeamMember;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<TeamMember>) => Promise<void>;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState({
    name: member.name,
    role: member.role,
    email: member.email ?? "",
    sections: (member.assigned_sections ?? []).join(", "),
    start_date: member.start_date ?? "",
  });

  useEffect(() => {
    if (editing) {
      setDraft({
        name: member.name,
        role: member.role,
        email: member.email ?? "",
        sections: (member.assigned_sections ?? []).join(", "),
        start_date: member.start_date ?? "",
      });
    }
  }, [editing, member]);

  if (!editing) {
    return (
      <tr className="border-t border-border">
        <td className="px-2 py-1.5">{member.name}</td>
        <td className="px-2 py-1.5 text-muted-foreground">{member.role}</td>
        <td className="px-2 py-1.5 text-muted-foreground">{member.email ?? "—"}</td>
        <td className="px-2 py-1.5 text-muted-foreground">
          {(member.assigned_sections ?? []).join(", ") || "—"}
        </td>
        <td className="px-2 py-1.5 text-muted-foreground">{member.start_date ?? "—"}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onEdit}
            className="mr-1 rounded border border-border px-2 py-0.5 text-[10px] hover:bg-surface-hover"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-rose-500/40 px-2 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/10"
          >
            Remove
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border bg-surface/40">
      <td className="px-2 py-1.5">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={draft.role}
          onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
        >
          {TEAM_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={draft.sections}
          onChange={(e) => setDraft({ ...draft, sections: e.target.value })}
          placeholder="Comma-separated"
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={draft.start_date}
          onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
          className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
        />
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() =>
            void onSave({
              name: draft.name.trim() || member.name,
              role: draft.role,
              email: draft.email.trim() || null,
              assigned_sections: draft.sections
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              start_date: draft.start_date || null,
            })
          }
          className="mr-1 rounded px-2 py-0.5 text-[10px] font-semibold text-black"
          style={{ backgroundColor: GOLD }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-surface-hover"
        >
          Cancel
        </button>
      </td>
    </tr>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-4 w-7 items-center rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-border"}`}
      aria-pressed={on}
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${on ? "translate-x-3.5" : "translate-x-0.5"}`}
      />
    </button>
  );
}
