import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Trash2, Check, Sparkles, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runWizardIrisAnalysis } from "@/lib/mission-wizard-iris.functions";

const GOLD = "#C9A84C";
const NAVY = "#1F3864";
const OVERLAY_BG = "rgba(10, 14, 26, 0.95)";

const STEP_NAMES = [
  "Mission Basics",
  "Source Materials",
  "IRIS Review",
  "Review & Edit Record",
  "Build the Team",
  "Readiness & GO LIVE",
];

type Milestone = { label: string; date: string };

type Step1 = {
  name: string;
  client: string;
  prime_contractor: string;
  state: string;
  program_type: string;
  internal_notes: string;
  submission_date: string;
  procurement_type: string;
  engagement_lead: string;
  operations_lead: string;
  client_contacts: string;
  milestones: Milestone[];
};

const DOC_SLOTS: { key: string; label: string }[] = [
  { key: "rfp", label: "RFP" },
  { key: "sow", label: "SOW" },
  { key: "model_contract", label: "Model Contract" },
  { key: "win_themes", label: "Win Themes" },
  { key: "client_materials", label: "Client Materials" },
  { key: "pricing_notes", label: "Pricing Notes" },
  { key: "staffing_notes", label: "Staffing Notes" },
  { key: "research_notes", label: "Research Notes" },
];

type SlotState = Record<string, { url: string; notes: string }>;

type Props = {
  open: boolean;
  onClose: () => void;
  missionId?: string;
  startStep?: number;
};

export default function MissionWizard({ open, onClose, missionId: initialMissionId, startStep = 1 }: Props) {
  const [step, setStep] = useState(startStep);
  const [missionId, setMissionId] = useState<string | null>(initialMissionId ?? null);
  const [saving, setSaving] = useState(false);

  const [step1, setStep1] = useState<Step1>({
    name: "",
    client: "",
    prime_contractor: "",
    state: "",
    program_type: "",
    internal_notes: "",
    submission_date: "",
    procurement_type: "",
    engagement_lead: "",
    operations_lead: "",
    client_contacts: "",
    milestones: [],
  });

  const [slots, setSlots] = useState<SlotState>(() =>
    Object.fromEntries(DOC_SLOTS.map((s) => [s.key, { url: "", notes: "" }])),
  );
  const [otherMaterials, setOtherMaterials] = useState("");
  const step4SaveRef = useRef<null | (() => Promise<boolean>)>(null);


  if (!open) return null;

  const requestClose = () => {
    if (step > 1) {
      if (!confirm("Close the wizard? Unsaved changes on this step will be lost.")) return;
    }
    onClose();
  };

  const saveStep1 = async (): Promise<boolean> => {
    if (!step1.name.trim() || !step1.client.trim()) {
      toast.error("Mission Name and Client are required.");
      return false;
    }
    setSaving(true);
    try {
      const payload = {
        name: step1.name.trim(),
        client: step1.client.trim(),
        prime_contractor: step1.prime_contractor || null,
        state: step1.state || null,
        program_type: step1.program_type || null,
        engagement_type: step1.procurement_type || null,
        internal_lead: step1.engagement_lead || null,
        operations_lead: step1.operations_lead || null,
        engagement_lead: step1.client_contacts || null,
        submission_date: step1.submission_date || null,
        submission_milestones: step1.milestones.filter((m) => m.label.trim() || m.date),
        description: step1.internal_notes || null,
        mission_status: "Draft",
        wizard_step: 1,
        status: "DRAFT",
      };
      const { data: inserted, error } = await supabase
        .from("missions")
        .insert(payload as any)
        .select("id")
        .single();
      if (error) throw error;
      setMissionId(inserted.id);
      await supabase.from("mission_readiness").insert({ mission_id: inserted.id } as any);
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Could not save mission.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveStep2 = async (): Promise<boolean> => {
    if (!missionId) return false;
    setSaving(true);
    try {
      const rows = DOC_SLOTS
        .map((s) => ({ slot: s, val: slots[s.key] }))
        .filter(({ val }) => val.url.trim() || val.notes.trim())
        .map(({ slot, val }) => ({
          mission_id: missionId,
          doc_type: slot.key,
          file_url: val.url.trim() || null,
          notes: val.notes.trim() || null,
        }));
      if (otherMaterials.trim()) {
        rows.push({
          mission_id: missionId,
          doc_type: "other",
          file_url: null,
          notes: otherMaterials.trim(),
        });
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("mission_documents").insert(rows as any);
        if (error) throw error;
      }
      const { error: upErr } = await supabase
        .from("missions")
        .update({ mission_status: "IRIS Review Needed", wizard_step: 2 } as any)
        .eq("id", missionId);
      if (upErr) throw upErr;
      toast.success("Materials saved");
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Could not save materials.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const skipStep2 = async () => {
    if (!missionId) return;
    await supabase.from("missions").update({ wizard_step: 2 } as any).eq("id", missionId);
    setStep(3);
  };

  const handleContinue = async () => {
    if (step === 1) {
      const ok = await saveStep1();
      if (ok) setStep(2);
    } else if (step === 2) {
      const ok = await saveStep2();
      if (ok) setStep(3);
    } else if (step === 3) {
      // Step 3 advances via its own internal buttons; this is a no-op.
      return;
    } else if (step === 4) {
      if (!step4SaveRef.current) {
        setStep(5);
        return;
      }
      setSaving(true);
      try {
        const ok = await step4SaveRef.current();
        if (ok) setStep(5);
      } finally {
        setSaving(false);
      }
    } else if (step === 5) {
      if (!missionId) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from("missions")
          .update({ wizard_step: 5 } as never)
          .eq("id", missionId);
        if (error) throw error;
        setStep(6);
      } catch (e: any) {
        toast.error(e?.message || "Could not save");
      } finally {
        setSaving(false);
      }
    } else if (step < 6) {
      setStep(step + 1);
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10 px-4"
      style={{ backgroundColor: OVERLAY_BG }}
    >
      <div className="w-full max-w-[900px] rounded-xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <span>Step {step} of 6</span>
                <span>{STEP_NAMES[step - 1]}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                <div
                  className="h-full transition-all"
                  style={{ width: `${(step / 6) * 100}%`, backgroundColor: GOLD }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {step === 1 && <Step1Form value={step1} onChange={setStep1} />}
          {step === 2 && (
            <Step2Form
              slots={slots}
              setSlots={setSlots}
              other={otherMaterials}
              setOther={setOtherMaterials}
              onSkip={skipStep2}
            />
          )}
          {step === 3 && missionId && (
            <Step3IrisReview
              missionId={missionId}
              onAdvance={() => setStep(4)}
            />
          )}
          {step === 4 && missionId && (
            <Step4Review
              missionId={missionId}
              registerSave={(fn) => {
                step4SaveRef.current = fn;
              }}
              onReRun={() => setStep(3)}
            />
          )}
          {step === 5 && missionId && (
            <Step5Team
              missionId={missionId}
              onSkip={async () => {
                await supabase
                  .from("missions")
                  .update({ wizard_step: 5 } as never)
                  .eq("id", missionId);
                setStep(6);
              }}
            />
          )}
          {step === 6 && missionId && (
            <Step6Readiness
              missionId={missionId}
              onClose={onClose}
              onSaveAndClose={async () => {
                await supabase
                  .from("missions")
                  .update({ wizard_step: 6 } as never)
                  .eq("id", missionId);
                onClose();
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep(step - 1) : requestClose())}
            disabled={saving}
            className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            ← Back
          </button>
          {step !== 3 && step !== 6 && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={saving}
              className="rounded-md px-5 py-2 text-sm font-bold uppercase tracking-wider shadow disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              {saving ? "Saving…" : "Save & Continue →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step1Form({ value, onChange }: { value: Step1; onChange: (v: Step1) => void }) {
  const set = <K extends keyof Step1>(k: K, v: Step1[K]) => onChange({ ...value, [k]: v });

  const addMilestone = () =>
    set("milestones", [...value.milestones, { label: "", date: "" }]);
  const removeMilestone = (i: number) =>
    set("milestones", value.milestones.filter((_, idx) => idx !== i));
  const updateMilestone = (i: number, patch: Partial<Milestone>) =>
    set(
      "milestones",
      value.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">This becomes the official mission record</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left */}
        <div className="space-y-4">
          <Field label="Mission Name" required>
            <Input value={value.name} onChange={(v) => set("name", v)} />
          </Field>
          <Field label="Client / Agency" required>
            <Input value={value.client} onChange={(v) => set("client", v)} />
          </Field>
          <Field label="Prime Contractor">
            <Input value={value.prime_contractor} onChange={(v) => set("prime_contractor", v)} />
          </Field>
          <Field label="State">
            <Input value={value.state} onChange={(v) => set("state", v)} placeholder="e.g. New Jersey" />
          </Field>
          <Field label="Program Type">
            <Input
              value={value.program_type}
              onChange={(v) => set("program_type", v)}
              placeholder="e.g. CSOC, IT Modernization"
            />
          </Field>
          <Field label="Internal Notes">
            <Textarea value={value.internal_notes} onChange={(v) => set("internal_notes", v)} rows={3} />
          </Field>
        </div>

        {/* Right */}
        <div className="space-y-4">
          <Field label="Submission Date">
            <Input type="date" value={value.submission_date} onChange={(v) => set("submission_date", v)} />
          </Field>
          <Field label="Procurement Type">
            <Select
              value={value.procurement_type}
              onChange={(v) => set("procurement_type", v)}
              options={["", "Proposal", "Task Order", "IDIQ", "BPA", "Sole Source", "Other"]}
            />
          </Field>
          <Field label="Engagement Lead">
            <Input value={value.engagement_lead} onChange={(v) => set("engagement_lead", v)} />
          </Field>
          <Field label="Operations Lead">
            <Input value={value.operations_lead} onChange={(v) => set("operations_lead", v)} />
          </Field>
          <Field label="Client Contacts">
            <Input
              value={value.client_contacts}
              onChange={(v) => set("client_contacts", v)}
              placeholder="Names or emails, comma-separated"
            />
          </Field>
        </div>
      </div>

      {/* Milestones */}
      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Submission Milestones
          </h3>
          <button
            type="button"
            onClick={addMilestone}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-surface-hover"
          >
            <Plus className="h-3 w-3" /> Add Milestone
          </button>
        </div>
        {value.milestones.length === 0 ? (
          <p className="text-xs text-muted-foreground">No milestones added.</p>
        ) : (
          <div className="space-y-2">
            {value.milestones.map((m, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  value={m.label}
                  onChange={(v) => updateMilestone(i, { label: v })}
                  placeholder="Milestone label"
                />
                <Input
                  type="date"
                  value={m.date}
                  onChange={(v) => updateMilestone(i, { date: v })}
                />
                <button
                  type="button"
                  onClick={() => removeMilestone(i)}
                  aria-label="Remove milestone"
                  className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Step2Form({
  slots,
  setSlots,
  other,
  setOther,
  onSkip,
}: {
  slots: SlotState;
  setSlots: (v: SlotState) => void;
  other: string;
  setOther: (v: string) => void;
  onSkip: () => void;
}) {
  const update = (key: string, patch: Partial<{ url: string; notes: string }>) =>
    setSlots({ ...slots, [key]: { ...slots[key], ...patch } });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Upload or link everything IRIS needs — you can add more later
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DOC_SLOTS.map((slot) => {
          const v = slots[slot.key];
          const filled = !!(v.url.trim() || v.notes.trim());
          return (
            <div
              key={slot.key}
              className="rounded-lg border border-border bg-background/40 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{slot.label}</h4>
                {filled && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#34d399" }}
                  >
                    <Check className="h-3 w-3" /> Saved
                  </span>
                )}
              </div>
              <Input
                value={v.url}
                onChange={(val) => update(slot.key, { url: val })}
                placeholder="Paste a link or URL"
              />
              <Textarea
                value={v.notes}
                onChange={(val) => update(slot.key, { notes: val.slice(0, 3000) })}
                rows={3}
                placeholder="Or paste text, notes, or key details here..."
              />
              <div className="text-right text-[10px] text-muted-foreground">
                {v.notes.length} / 3000
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Other Reference Materials</h4>
        <Textarea value={other} onChange={setOther} rows={4} placeholder="Anything else IRIS should know..." />
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Skip for now — I'll add materials later
        </button>
      </div>
    </div>
  );
}

/* ---------- primitives ---------- */

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label} {required && <span className="text-rose-400">*</span>}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[color:var(--athena-gold,#C9A84C)] focus:outline-none"
    />
  );
}

function Textarea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[color:var(--athena-gold,#C9A84C)] focus:outline-none resize-y"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-[color:var(--athena-gold,#C9A84C)] focus:outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o || "Select…"}
        </option>
      ))}
    </select>
  );
}

/* ---------- Step 3: IRIS Review ---------- */

const LOADING_STAGES = [
  "Reading source materials...",
  "Identifying requirements...",
  "Mapping compliance items...",
  "Drafting mission record...",
  "Analysis complete ✓",
];

type DocSummary = { doc_type: string | null; has_content: boolean };

function Step3IrisReview({
  missionId,
  onAdvance,
}: {
  missionId: string;
  onAdvance: () => void;
}) {
  const runIris = useServerFn(runWizardIrisAnalysis);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: dRows }, { data: intel }] = await Promise.all([
        supabase
          .from("mission_documents")
          .select("doc_type,file_url,notes")
          .eq("mission_id", missionId),
        supabase
          .from("mission_intelligence")
          .select("id")
          .eq("mission_id", missionId)
          .eq("layer", "wizard_analysis")
          .maybeSingle(),
      ]);
      if (!alive) return;
      const summary: DocSummary[] = (dRows ?? []).map((r) => ({
        doc_type: r.doc_type,
        has_content: !!(r.file_url || r.notes),
      }));
      setDocs(summary);
      setHasExisting(!!intel);
      if (intel) setStatus("done");
      setLoadingDocs(false);
    })();
    return () => {
      alive = false;
    };
  }, [missionId]);

  useEffect(() => {
    if (status !== "running") return;
    setStageIdx(0);
    const interval = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, LOADING_STAGES.length - 2));
    }, 1800);
    return () => clearInterval(interval);
  }, [status]);

  const filledDocs = useMemo(() => docs.filter((d) => d.has_content), [docs]);

  const trigger = async () => {
    setStatus("running");
    setError(null);
    try {
      await runIris({ data: { missionId } });
      setStageIdx(LOADING_STAGES.length - 1);
      setStatus("done");
      toast.success("IRIS analysis complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "IRIS analysis failed";
      setError(msg);
      setStatus("error");
    }
  };

  const skipManually = async () => {
    await supabase
      .from("missions")
      .update({ wizard_step: 3 } as never)
      .eq("id", missionId);
    onAdvance();
  };

  if (loadingDocs) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
        Loading source materials…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        IRIS will read your materials and draft the full mission record
      </p>

      <div
        className="rounded-xl border p-6"
        style={{
          borderColor: "rgba(201, 168, 76, 0.3)",
          backgroundColor: "rgba(31, 56, 100, 0.08)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5" style={{ color: GOLD }} />
          <span
            className="text-[11px] font-extrabold uppercase tracking-[0.28em]"
            style={{ color: GOLD }}
          >
            IRIS
          </span>
        </div>

        {status === "idle" && (
          <IdleView
            filledDocs={filledDocs}
            onRun={trigger}
            onSkip={skipManually}
            hasExisting={hasExisting}
          />
        )}

        {status === "running" && (
          <RunningView stageIdx={stageIdx} />
        )}

        {status === "done" && (
          <DoneView onAdvance={onAdvance} />
        )}

        {status === "error" && (
          <ErrorView
            message={error ?? "Unknown error"}
            onRetry={trigger}
            onContinue={() => {
              skipManually();
            }}
          />
        )}
      </div>
    </div>
  );
}

function IdleView({
  filledDocs,
  onRun,
  onSkip,
  hasExisting,
}: {
  filledDocs: DocSummary[];
  onRun: () => void;
  onSkip: () => void;
  hasExisting: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          {hasExisting ? "Re-run IRIS Analysis" : "Ready to analyze your mission"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {filledDocs.length} source {filledDocs.length === 1 ? "document" : "documents"} provided
          {filledDocs.length > 0 && (
            <>
              :{" "}
              <span className="text-foreground/80">
                {filledDocs.map((d) => formatDocType(d.doc_type)).join(", ")}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground leading-relaxed">
        IRIS will read your source materials and draft: Mission briefing, Key dates,
        Requirements, Deliverables, Risks, Compliance items, Suggested sections, Win themes,
        Staffing needs, and Intelligence notes.
      </div>

      <div className="flex flex-col items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onRun}
          className="rounded-lg px-8 py-3.5 text-sm font-bold uppercase tracking-[0.18em] shadow-lg hover:opacity-90 transition"
          style={{ backgroundColor: GOLD, color: NAVY }}
        >
          {hasExisting ? "Re-run IRIS Review →" : "Run IRIS Review →"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Skip — I'll fill in the record manually →
        </button>
      </div>
    </div>
  );
}

function RunningView({ stageIdx }: { stageIdx: number }) {
  return (
    <div className="py-10 space-y-6 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(201, 168, 76, 0.15)" }}
      >
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: GOLD }} />
      </div>
      <div className="space-y-2">
        {LOADING_STAGES.slice(0, -1).map((s, i) => {
          const reached = i <= stageIdx;
          const active = i === stageIdx;
          return (
            <div
              key={s}
              className="text-sm transition-opacity"
              style={{
                color: active ? GOLD : reached ? "rgba(201, 168, 76, 0.6)" : "rgba(148,163,184,0.45)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {reached ? "▸ " : "  "}
              {s}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DoneView({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div className="py-6 space-y-5 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(16, 185, 129, 0.15)" }}
      >
        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">
          IRIS analysis complete
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Review and edit the record below
        </p>
      </div>
      <button
        type="button"
        onClick={onAdvance}
        className="rounded-lg px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] shadow hover:opacity-90"
        style={{ backgroundColor: GOLD, color: NAVY }}
      >
        Review the Record →
      </button>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
  onContinue,
}: {
  message: string;
  onRetry: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="py-6 space-y-5 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(244, 63, 94, 0.12)" }}
      >
        <AlertTriangle className="h-7 w-7 text-rose-400" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">
          IRIS could not complete the analysis
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          You can fill in the record manually.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-2 italic">{message}</p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-hover"
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wider shadow"
          style={{ backgroundColor: GOLD, color: NAVY }}
        >
          Continue Without IRIS →
        </button>
      </div>
    </div>
  );
}

function formatDocType(s: string | null): string {
  if (!s) return "doc";
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/* ---------- Step 4: Review & Edit Record ---------- */

type KeyDate = { label: string; date: string; note: string };
type KeyRisk = { risk: string; mitigation: string };
type Staffing = { role: string; reason: string };
type WritingAssignment = { section: string; role: string; notes: string };
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type RecordContent = {
  mission_overview: string;
  mission_briefing: string;
  risk_level: RiskLevel;
  key_dates: KeyDate[];
  major_requirements: string[];
  deliverables: string[];
  compliance_items: string[];
  key_risks: KeyRisk[];
  known_gaps: string[];
  recommended_win_themes: string[];
  intelligence_notes: string;
  iris_briefing_notes: string;
  suggested_sections: string[];
  workstreams: string[];
  suggested_staffing: Staffing[];
  suggested_writing_assignments: WritingAssignment[];
  required_expertise: string[];
  client_sensitivities: string[];
};

const EMPTY_RECORD: RecordContent = {
  mission_overview: "",
  mission_briefing: "",
  risk_level: "MEDIUM",
  key_dates: [],
  major_requirements: [],
  deliverables: [],
  compliance_items: [],
  key_risks: [],
  known_gaps: [],
  recommended_win_themes: [],
  intelligence_notes: "",
  iris_briefing_notes: "",
  suggested_sections: [],
  workstreams: [],
  suggested_staffing: [],
  suggested_writing_assignments: [],
  required_expertise: [],
  client_sensitivities: [],
};

function normalizeContent(raw: any): RecordContent {
  const c = raw && typeof raw === "object" ? raw : {};
  const asArr = (v: any): any[] => (Array.isArray(v) ? v : []);
  const asStrArr = (v: any): string[] =>
    asArr(v).map((x) => (typeof x === "string" ? x : x?.label ?? x?.name ?? String(x ?? ""))).filter(Boolean);
  const rl = String(c.risk_level || "MEDIUM").toUpperCase();
  return {
    mission_overview: c.mission_overview ?? "",
    mission_briefing: c.mission_briefing ?? "",
    risk_level: (rl === "LOW" || rl === "HIGH" ? rl : "MEDIUM") as RiskLevel,
    key_dates: asArr(c.key_dates).map((d: any) => ({
      label: d?.label ?? "",
      date: d?.date ?? "",
      note: d?.note ?? "",
    })),
    major_requirements: asStrArr(c.major_requirements),
    deliverables: asStrArr(c.deliverables),
    compliance_items: asStrArr(c.compliance_items),
    key_risks: asArr(c.key_risks).map((r: any) =>
      typeof r === "string"
        ? { risk: r, mitigation: "" }
        : { risk: r?.risk ?? "", mitigation: r?.mitigation ?? "" },
    ),
    known_gaps: asStrArr(c.known_gaps),
    recommended_win_themes: asStrArr(c.recommended_win_themes),
    intelligence_notes: c.intelligence_notes ?? "",
    iris_briefing_notes: c.iris_briefing_notes ?? "",
    suggested_sections: asStrArr(c.suggested_sections),
    workstreams: asStrArr(c.workstreams),
    suggested_staffing: asArr(c.suggested_staffing).map((s: any) =>
      typeof s === "string"
        ? { role: s, reason: "" }
        : { role: s?.role ?? "", reason: s?.reason ?? "" },
    ),
    suggested_writing_assignments: asArr(c.suggested_writing_assignments).map((s: any) => ({
      section: s?.section ?? "",
      role: s?.role ?? "",
      notes: s?.notes ?? "",
    })),
    required_expertise: asStrArr(c.required_expertise),
    client_sensitivities: asStrArr(c.client_sensitivities),
  };
}

function Step4Review({
  missionId,
  registerSave,
  onReRun,
}: {
  missionId: string;
  registerSave: (fn: () => Promise<boolean>) => void;
  onReRun: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [intelId, setIntelId] = useState<string | null>(null);
  const [rec, setRec] = useState<RecordContent>(EMPTY_RECORD);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("mission_intelligence")
        .select("id, content, created_at")
        .eq("mission_id", missionId)
        .eq("layer", "wizard_analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setIntelId(data.id);
        setRec(normalizeContent((data as any).content));
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [missionId]);

  useEffect(() => {
    registerSave(async () => {
      try {
        if (intelId) {
          const { error } = await supabase
            .from("mission_intelligence")
            .update({ content: rec as any } as never)
            .eq("id", intelId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from("mission_intelligence")
            .insert({
              mission_id: missionId,
              layer: "wizard_analysis",
              type: "wizard_analysis",
              content: rec as any,
            } as never)
            .select("id")
            .single();
          if (error) throw error;
          if (data) setIntelId((data as any).id);
        }
        const { error: mErr } = await supabase
          .from("missions")
          .update({ wizard_step: 4 } as never)
          .eq("id", missionId);
        if (mErr) throw mErr;
        toast.success("Record saved");
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Could not save record");
        return false;
      }
    });
  }, [rec, intelId, missionId, registerSave]);

  const set = <K extends keyof RecordContent>(k: K, v: RecordContent[K]) =>
    setRec((r) => ({ ...r, [k]: v }));

  const handleReRun = () => {
    if (
      confirm(
        "Re-run IRIS? This will overwrite the current record after the new analysis completes.",
      )
    ) {
      onReRun();
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
        Loading mission record…
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          IRIS drafted this — correct anything, add what's missing, and save your changes
        </p>
        <button
          type="button"
          onClick={handleReRun}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Re-run IRIS
        </button>
      </div>

      <Section title="Mission Overview">
        <Field label="Overview">
          <Textarea
            value={rec.mission_overview}
            onChange={(v) => set("mission_overview", v)}
            rows={4}
          />
        </Field>
        <Field label="Mission Briefing — shown to the team at launch">
          <Textarea
            value={rec.mission_briefing}
            onChange={(v) => set("mission_briefing", v)}
            rows={5}
          />
        </Field>
      </Section>

      <Section title="Risk Level">
        <div className="flex gap-2">
          {(["LOW", "MEDIUM", "HIGH"] as RiskLevel[]).map((lvl) => {
            const active = rec.risk_level === lvl;
            const color =
              lvl === "LOW" ? "#10b981" : lvl === "MEDIUM" ? "#f59e0b" : "#f43f5e";
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => set("risk_level", lvl)}
                className="rounded-md border px-4 py-2 text-xs font-bold uppercase tracking-wider transition"
                style={{
                  borderColor: active ? color : "var(--border)",
                  backgroundColor: active ? `${color}22` : "transparent",
                  color: active ? color : "var(--muted-foreground)",
                }}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Key Dates">
        <RowTable
          headers={["Label", "Date", "Note"]}
          rows={rec.key_dates}
          onAdd={() =>
            set("key_dates", [...rec.key_dates, { label: "", date: "", note: "" }])
          }
          addLabel="Add Date"
          render={(row, i) => (
            <>
              <Input
                value={row.label}
                onChange={(v) =>
                  set(
                    "key_dates",
                    rec.key_dates.map((r, idx) => (idx === i ? { ...r, label: v } : r)),
                  )
                }
                placeholder="e.g. Proposal Due"
              />
              <Input
                type="date"
                value={row.date}
                onChange={(v) =>
                  set(
                    "key_dates",
                    rec.key_dates.map((r, idx) => (idx === i ? { ...r, date: v } : r)),
                  )
                }
              />
              <Input
                value={row.note}
                onChange={(v) =>
                  set(
                    "key_dates",
                    rec.key_dates.map((r, idx) => (idx === i ? { ...r, note: v } : r)),
                  )
                }
                placeholder="Note"
              />
            </>
          )}
          onRemove={(i) =>
            set("key_dates", rec.key_dates.filter((_, idx) => idx !== i))
          }
        />
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="Major Requirements">
          <ChipEditor
            items={rec.major_requirements}
            onChange={(v) => set("major_requirements", v)}
            placeholder="Add requirement"
          />
        </Section>
        <Section title="Deliverables">
          <ChipEditor
            items={rec.deliverables}
            onChange={(v) => set("deliverables", v)}
            placeholder="Add deliverable"
          />
        </Section>
      </div>

      <Section title="Compliance Items">
        <ChipEditor
          items={rec.compliance_items}
          onChange={(v) => set("compliance_items", v)}
          placeholder="Add compliance item"
        />
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="Key Risks">
          <RowTable
            headers={["Risk", "Mitigation"]}
            rows={rec.key_risks}
            onAdd={() =>
              set("key_risks", [...rec.key_risks, { risk: "", mitigation: "" }])
            }
            addLabel="Add Risk"
            render={(row, i) => (
              <>
                <Input
                  value={row.risk}
                  onChange={(v) =>
                    set(
                      "key_risks",
                      rec.key_risks.map((r, idx) => (idx === i ? { ...r, risk: v } : r)),
                    )
                  }
                  placeholder="Risk"
                />
                <Input
                  value={row.mitigation}
                  onChange={(v) =>
                    set(
                      "key_risks",
                      rec.key_risks.map((r, idx) =>
                        idx === i ? { ...r, mitigation: v } : r,
                      ),
                    )
                  }
                  placeholder="Mitigation"
                />
              </>
            )}
            onRemove={(i) =>
              set("key_risks", rec.key_risks.filter((_, idx) => idx !== i))
            }
          />
        </Section>
        <Section title="Known Gaps">
          <ChipEditor
            items={rec.known_gaps}
            onChange={(v) => set("known_gaps", v)}
            placeholder="Add gap"
          />
        </Section>
      </div>

      <Section title="Recommended Win Themes">
        <ChipEditor
          items={rec.recommended_win_themes}
          onChange={(v) => set("recommended_win_themes", v)}
          placeholder="Add win theme"
        />
      </Section>

      <Section title="Intelligence Notes">
        <Textarea
          value={rec.intelligence_notes}
          onChange={(v) => set("intelligence_notes", v)}
          rows={4}
        />
      </Section>

      <Section title="IRIS Briefing Notes">
        <Textarea
          value={rec.iris_briefing_notes}
          onChange={(v) => set("iris_briefing_notes", v)}
          rows={4}
        />
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section
          title="Suggested Sections"
          subtitle="These will populate Atlas at launch"
        >
          <ChipEditor
            items={rec.suggested_sections}
            onChange={(v) => set("suggested_sections", v)}
            placeholder="Add section"
          />
        </Section>
        <Section title="Workstreams">
          <ChipEditor
            items={rec.workstreams}
            onChange={(v) => set("workstreams", v)}
            placeholder="Add workstream"
          />
        </Section>
      </div>

      <Section title="Suggested Staffing">
        <RowTable
          headers={["Role", "Reason"]}
          rows={rec.suggested_staffing}
          onAdd={() =>
            set("suggested_staffing", [
              ...rec.suggested_staffing,
              { role: "", reason: "" },
            ])
          }
          addLabel="Add Role"
          render={(row, i) => (
            <>
              <Input
                value={row.role}
                onChange={(v) =>
                  set(
                    "suggested_staffing",
                    rec.suggested_staffing.map((r, idx) =>
                      idx === i ? { ...r, role: v } : r,
                    ),
                  )
                }
                placeholder="Role"
              />
              <Input
                value={row.reason}
                onChange={(v) =>
                  set(
                    "suggested_staffing",
                    rec.suggested_staffing.map((r, idx) =>
                      idx === i ? { ...r, reason: v } : r,
                    ),
                  )
                }
                placeholder="Reason"
              />
            </>
          )}
          onRemove={(i) =>
            set(
              "suggested_staffing",
              rec.suggested_staffing.filter((_, idx) => idx !== i),
            )
          }
        />
      </Section>

      <Section title="Suggested Writing Assignments">
        <RowTable
          headers={["Section", "Role", "Notes"]}
          rows={rec.suggested_writing_assignments}
          onAdd={() =>
            set("suggested_writing_assignments", [
              ...rec.suggested_writing_assignments,
              { section: "", role: "", notes: "" },
            ])
          }
          addLabel="Add Assignment"
          render={(row, i) => (
            <>
              <Input
                value={row.section}
                onChange={(v) =>
                  set(
                    "suggested_writing_assignments",
                    rec.suggested_writing_assignments.map((r, idx) =>
                      idx === i ? { ...r, section: v } : r,
                    ),
                  )
                }
                placeholder="Section"
              />
              <Input
                value={row.role}
                onChange={(v) =>
                  set(
                    "suggested_writing_assignments",
                    rec.suggested_writing_assignments.map((r, idx) =>
                      idx === i ? { ...r, role: v } : r,
                    ),
                  )
                }
                placeholder="Role"
              />
              <Input
                value={row.notes}
                onChange={(v) =>
                  set(
                    "suggested_writing_assignments",
                    rec.suggested_writing_assignments.map((r, idx) =>
                      idx === i ? { ...r, notes: v } : r,
                    ),
                  )
                }
                placeholder="Notes"
              />
            </>
          )}
          onRemove={(i) =>
            set(
              "suggested_writing_assignments",
              rec.suggested_writing_assignments.filter((_, idx) => idx !== i),
            )
          }
        />
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="Required Expertise">
          <ChipEditor
            items={rec.required_expertise}
            onChange={(v) => set("required_expertise", v)}
            placeholder="Add expertise"
          />
        </Section>
        <Section title="Client Sensitivities">
          <ChipEditor
            items={rec.client_sensitivities}
            onChange={(v) => set("client_sensitivities", v)}
            placeholder="Add sensitivity"
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ChipEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground italic">None</span>
        )}
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs"
          >
            {it}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-rose-400"
              aria-label="Remove"
            >
              <X className="h-3 w-3" />
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
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-[color:var(--athena-gold,#C9A84C)] focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-surface-hover"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}

function RowTable<T>({
  headers,
  rows,
  render,
  onAdd,
  onRemove,
  addLabel,
}: {
  headers: string[];
  rows: T[];
  render: (row: T, i: number) => React.ReactNode;
  onAdd: () => void;
  onRemove: (i: number) => void;
  addLabel: string;
}) {
  const cols = headers.length;
  const gridTemplate = `${"minmax(0,1fr) ".repeat(cols)}auto`;
  return (
    <div className="space-y-2">
      <div
        className="grid gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {headers.map((h) => (
          <div key={h}>{h}</div>
        ))}
        <div />
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No rows yet.</p>
      ) : (
        rows.map((row, i) => (
          <div
            key={i}
            className="grid gap-2 items-center"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {render(row, i)}
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label="Remove row"
              className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-surface-hover"
      >
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    </div>
  );
}

/* ---------- Step 5: Build the Team ---------- */

const TEAM_ROLES = [
  "Engagement Lead",
  "Operations Lead",
  "Project Manager",
  "SME",
  "Writer",
  "Copy Editor",
  "QA Reviewer",
  "Client Contact",
] as const;

type TeamMember = {
  id: string;
  mission_id: string;
  name: string;
  email: string | null;
  role: string;
  assigned_sections: any;
  start_date: string | null;
  talentdesk_status: string | null;
  contract_status: string | null;
  nda_status: string | null;
  baa_required: boolean | null;
  baa_status: string | null;
  client_system_access: boolean | null;
  slack_access: boolean | null;
  folder_access: boolean | null;
};

type StaffingSuggestion = { role: string; reason: string };
type WritingSuggestion = { section: string; role: string; notes: string };

function sectionsToText(v: any): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "string") return v;
  return "";
}
function sectionsFromText(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function Step5Team({
  missionId,
  onSkip,
}: {
  missionId: string;
  onSkip: () => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessOpen, setAccessOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [staffing, setStaffing] = useState<StaffingSuggestion[]>([]);
  const [writing, setWriting] = useState<WritingSuggestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // form state
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fRole, setFRole] = useState<string>(TEAM_ROLES[0]);
  const [fSections, setFSections] = useState("");
  const [fStart, setFStart] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = async () => {
    const { data } = await supabase
      .from("mission_team_members")
      .select(
        "id, mission_id, name, email, role, assigned_sections, start_date, talentdesk_status, contract_status, nda_status, baa_required, baa_status, client_system_access, slack_access, folder_access",
      )
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true });
    setMembers((data ?? []) as any);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await reload();
      const { data: intel } = await supabase
        .from("mission_intelligence")
        .select("content")
        .eq("mission_id", missionId)
        .eq("layer", "wizard_analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const c: any = (intel as any)?.content ?? {};
      setStaffing(
        Array.isArray(c.suggested_staffing)
          ? c.suggested_staffing.map((s: any) =>
              typeof s === "string"
                ? { role: s, reason: "" }
                : { role: s?.role ?? "", reason: s?.reason ?? "" },
            )
          : [],
      );
      setWriting(
        Array.isArray(c.suggested_writing_assignments)
          ? c.suggested_writing_assignments.map((s: any) => ({
              section: s?.section ?? "",
              role: s?.role ?? "",
              notes: s?.notes ?? "",
            }))
          : [],
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  const addMember = async () => {
    if (!fName.trim()) {
      toast.error("Name is required");
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase.from("mission_team_members").insert({
        mission_id: missionId,
        name: fName.trim(),
        email: fEmail.trim() || null,
        role: fRole,
        assigned_sections: sectionsFromText(fSections),
        start_date: fStart || null,
      } as never);
      if (error) throw error;
      setFName("");
      setFEmail("");
      setFRole(TEAM_ROLES[0]);
      setFSections("");
      setFStart("");
      await reload();
      toast.success("Added to team");
    } catch (e: any) {
      toast.error(e?.message || "Could not add member");
    } finally {
      setAdding(false);
    }
  };

  const updateMember = async (id: string, patch: Partial<TeamMember>) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
    const { error } = await supabase
      .from("mission_team_members")
      .update(patch as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      await reload();
    }
  };

  const removeMember = async (m: TeamMember) => {
    if (!confirm(`Remove ${m.name} from the team?`)) return;
    const { error } = await supabase
      .from("mission_team_members")
      .delete()
      .eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembers((prev) => prev.filter((x) => x.id !== m.id));
    toast.success("Removed");
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
        Loading team…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Stage your team — no invites go out until you GO LIVE
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Add member form */}
        <div className="rounded-lg border border-border bg-background/40 p-4 space-y-3 h-fit">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
            Add Team Member
          </h3>
          <Field label="Name" required>
            <Input value={fName} onChange={setFName} />
          </Field>
          <Field label="Email">
            <Input value={fEmail} onChange={setFEmail} placeholder="name@example.com" />
          </Field>
          <Field label="Role">
            <Select
              value={fRole}
              onChange={setFRole}
              options={[...TEAM_ROLES]}
            />
          </Field>
          <Field label="Assigned Sections">
            <Input
              value={fSections}
              onChange={setFSections}
              placeholder="e.g. Section C, Management Approach"
            />
          </Field>
          <Field label="Start Date">
            <Input type="date" value={fStart} onChange={setFStart} />
          </Field>
          <button
            type="button"
            onClick={addMember}
            disabled={adding}
            className="w-full rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wider shadow disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: NAVY }}
          >
            {adding ? "Adding…" : "Add to Team"}
          </button>
        </div>

        {/* Roster */}
        <div className="space-y-3 min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
            Team Roster ({members.length})
          </h3>
          {members.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/30 p-6 text-center text-sm text-muted-foreground">
              No team members yet — add your first one.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Role</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Sections</th>
                    <th className="px-3 py-2 text-left">Start</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((m) => {
                    const editing = editingId === m.id;
                    return (
                      <tr key={m.id} className="align-top">
                        <td className="px-3 py-2">
                          {editing ? (
                            <Input value={m.name} onChange={(v) => updateMember(m.id, { name: v })} />
                          ) : (
                            <span className="font-medium text-foreground">{m.name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editing ? (
                            <Select
                              value={m.role}
                              onChange={(v) => updateMember(m.id, { role: v })}
                              options={[...TEAM_ROLES]}
                            />
                          ) : (
                            m.role
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editing ? (
                            <Input value={m.email ?? ""} onChange={(v) => updateMember(m.id, { email: v })} />
                          ) : (
                            <span className="text-muted-foreground">{m.email || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editing ? (
                            <Input
                              value={sectionsToText(m.assigned_sections)}
                              onChange={(v) =>
                                updateMember(m.id, { assigned_sections: sectionsFromText(v) as any })
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {sectionsToText(m.assigned_sections) || "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editing ? (
                            <Input
                              type="date"
                              value={m.start_date ?? ""}
                              onChange={(v) => updateMember(m.id, { start_date: v || null })}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">{m.start_date || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => setEditingId(editing ? null : m.id)}
                            className="text-xs font-semibold text-muted-foreground hover:text-foreground mr-2"
                          >
                            {editing ? "Done" : "Edit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMember(m)}
                            aria-label="Remove"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Access Requirements */}
      {members.length > 0 && (
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setAccessOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
              Access Requirements
            </span>
            <span className="text-xs text-muted-foreground">{accessOpen ? "Hide" : "Show"}</span>
          </button>
          {accessOpen && (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-center">TalentDesk</th>
                    <th className="px-3 py-2 text-center">Contract</th>
                    <th className="px-3 py-2 text-center">NDA</th>
                    <th className="px-3 py-2 text-center">BAA Required</th>
                    <th className="px-3 py-2 text-center">Client Access</th>
                    <th className="px-3 py-2 text-center">Slack</th>
                    <th className="px-3 py-2 text-center">Folder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 font-medium text-foreground">{m.name}</td>
                      <td className="px-3 py-2 text-center">
                        <Toggle
                          on={m.talentdesk_status === "active"}
                          onChange={(v) =>
                            updateMember(m.id, { talentdesk_status: v ? "active" : "pending" })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Toggle
                          on={m.contract_status === "signed"}
                          onChange={(v) =>
                            updateMember(m.id, { contract_status: v ? "signed" : "pending" })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Toggle
                          on={m.nda_status === "signed"}
                          onChange={(v) =>
                            updateMember(m.id, { nda_status: v ? "signed" : "pending" })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Toggle
                          on={!!m.baa_required}
                          onChange={(v) =>
                            updateMember(m.id, {
                              baa_required: v,
                              baa_status: v ? "pending" : "not_required",
                            } as any)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Toggle
                          on={!!m.client_system_access}
                          onChange={(v) => updateMember(m.id, { client_system_access: v })}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Toggle
                          on={!!m.slack_access}
                          onChange={(v) => updateMember(m.id, { slack_access: v })}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Toggle
                          on={!!m.folder_access}
                          onChange={(v) => updateMember(m.id, { folder_access: v })}
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

      {/* IRIS Suggestions */}
      {(staffing.length > 0 || writing.length > 0) && (
        <div
          className="rounded-lg border"
          style={{ borderColor: "rgba(201, 168, 76, 0.3)", backgroundColor: "rgba(31, 56, 100, 0.06)" }}
        >
          <button
            type="button"
            onClick={() => setSuggestionsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
              <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
                IRIS Suggestions — Review these as you build the team
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {suggestionsOpen ? "Hide" : "Show"}
            </span>
          </button>
          {suggestionsOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/60 p-4">
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Suggested Staffing
                </h4>
                {staffing.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {staffing.map((s, i) => (
                      <li key={i} className="rounded border border-border/60 bg-background/40 p-2">
                        <div className="font-semibold text-foreground">{s.role}</div>
                        {s.reason && <div className="text-muted-foreground mt-0.5">{s.reason}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Suggested Writing Assignments
                </h4>
                {writing.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {writing.map((s, i) => (
                      <li key={i} className="rounded border border-border/60 bg-background/40 p-2">
                        <div className="font-semibold text-foreground">{s.section}</div>
                        <div className="text-muted-foreground">{s.role}</div>
                        {s.notes && <div className="text-muted-foreground mt-0.5">{s.notes}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Skip — I'll add the team later
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition"
      style={{ backgroundColor: on ? GOLD : "rgba(148,163,184,0.35)" }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}
