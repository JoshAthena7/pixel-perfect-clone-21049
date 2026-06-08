import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Trash2, Check, Sparkles, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { runWizardQuestionArchitecture } from "@/lib/mission-wizard-architecture.functions";

const GOLD = "#C9A84C";
const NAVY = "#1F3864";
const OVERLAY_BG = "rgba(10, 14, 26, 0.95)";

const STEP_NAMES = [
  "Mission Basics",
  "Source Materials",
  "IRIS Review",
  "Review & Edit Record",
  "Upload Assignment Tracker",
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
  
  

  // Prefill Step 1 (and Step 2 slot indicators) when opened in edit mode
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
      const mm = m as any;
      setStep1({
        name: mm.name ?? "",
        client: mm.client ?? "",
        prime_contractor: mm.prime_contractor ?? "",
        state: mm.state ?? "",
        program_type: mm.program_type ?? "",
        internal_notes: mm.description ?? "",
        submission_date: mm.submission_date ?? "",
        procurement_type: mm.engagement_type ?? "",
        engagement_lead: mm.internal_lead ?? "",
        operations_lead: mm.operations_lead ?? "",
        client_contacts: mm.engagement_lead ?? "",
        milestones: Array.isArray(mm.submission_milestones) ? mm.submission_milestones : [],
      });
      const { data: docs } = await supabase
        .from("mission_documents")
        .select("doc_type,file_url,notes")
        .eq("mission_id", initialMissionId);
      if (cancelled) return;
      const next: SlotState = Object.fromEntries(DOC_SLOTS.map((s) => [s.key, { url: "", notes: "" }]));
      let other = "";
      for (const d of (docs ?? []) as any[]) {
        if (d.doc_type === "other") {
          other = d.notes ?? "";
        } else if (next[d.doc_type]) {
          next[d.doc_type] = { url: d.file_url ?? "", notes: d.notes ?? "" };
        }
      }
      setSlots(next);
      setOtherMaterials(other);
    })();
    return () => { cancelled = true; };
  }, [open, initialMissionId]);

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
      const payload: Record<string, unknown> = {
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
      };
      if (missionId) {
        // EDIT MODE: update existing row, preserve mission_status / wizard_step
        const { error } = await supabase
          .from("missions")
          .update(payload as any)
          .eq("id", missionId);
        if (error) throw error;
      } else {
        const insertPayload = { ...payload, mission_status: "Draft", wizard_step: 1, status: "DRAFT" };
        const { data: inserted, error } = await supabase
          .from("missions")
          .insert(insertPayload as any)
          .select("id")
          .single();
        if (error) throw error;
        setMissionId(inserted.id);
        await supabase.from("mission_readiness").insert({ mission_id: inserted.id } as any);
      }
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
      // Step 4 advances via its own internal "Confirm Architecture →" button.
      return;
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
            <Step4QuestionReconciliation
              missionId={missionId}
              onAdvance={() => setStep(5)}
            />
          )}
          {step === 5 && missionId && (
            <Step5AssignmentTracker
              missionId={missionId}
              onAdvance={() => setStep(6)}
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
          {step !== 3 && step !== 4 && step !== 5 && step !== 6 && (
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

/* ---------- Step 3: IRIS Analysis ---------- */

const LOADING_STAGES = [
  "Reading RFP...",
  "Extracting sections...",
  "Mapping questions...",
  "Identifying requirements...",
  "Building response architecture...",
  "Architecture v1 complete ✓",
];

type DocSummary = { doc_type: string | null; has_content: boolean };

function Step3IrisReview({
  missionId,
  onAdvance,
}: {
  missionId: string;
  onAdvance: () => void;
}) {
  const runArch = useServerFn(runWizardQuestionArchitecture);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);
  const [result, setResult] = useState<{ sectionCount: number; questionCount: number } | null>(null);

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
      const r = await runArch({ data: { missionId } });
      setResult({ sectionCount: r.sectionCount, questionCount: r.questionCount });
      setStageIdx(LOADING_STAGES.length - 1);
      setStatus("done");
      toast.success(`IRIS extracted ${r.questionCount} questions across ${r.sectionCount} sections`);
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
        IRIS will read your RFP and build the response architecture
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

        {status === "running" && <RunningView stageIdx={stageIdx} />}

        {status === "done" && (
          <DoneView onAdvance={onAdvance} result={result} />
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
          {hasExisting ? "Re-run IRIS Analysis" : "Ready to analyze your RFP"}
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
        IRIS will extract: Sections, Questions, Subquestions, Requirements, Evaluation Criteria,
        Page Limits, Deliverables, and Compliance Requirements. This becomes the mission backbone.
      </div>

      <div className="flex flex-col items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onRun}
          className="rounded-lg px-8 py-3.5 text-sm font-bold uppercase tracking-[0.18em] shadow-lg hover:opacity-90 transition"
          style={{ backgroundColor: GOLD, color: NAVY }}
        >
          {hasExisting ? "Re-run IRIS Analyze →" : "Run IRIS Analyze →"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Skip — I'll enter questions manually →
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

function DoneView({
  onAdvance,
  result,
}: {
  onAdvance: () => void;
  result: { sectionCount: number; questionCount: number } | null;
}) {
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
          {result
            ? `✓ IRIS extracted ${result.questionCount} questions across ${result.sectionCount} sections`
            : "✓ Response Architecture v1 ready"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Response Architecture v1 ready
        </p>
      </div>
      <button
        type="button"
        onClick={onAdvance}
        className="rounded-lg px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] shadow hover:opacity-90"
        style={{ backgroundColor: GOLD, color: NAVY }}
      >
        Review Architecture →
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
          IRIS could not complete
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          You can enter questions manually.
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

/* ---------- Step 4: Question Reconciliation ---------- */

type QuestionRow = {
  id: string;
  mission_id: string;
  question_number: string | null;
  question_name: string | null;
  question_text: string | null;
  section: string | null;
  subsection: string | null;
  page_limit: number | null;
  admin_notes: string | null;
  sort_order: number | null;
  architecture_version: string | null;
};

const WORKSTREAM_PREFIX = "Workstream: ";

function Step4QuestionReconciliation({
  missionId,
  onAdvance,
}: {
  missionId: string;
  onAdvance: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [filter, setFilter] = useState("");
  const [expandedText, setExpandedText] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [mergeAnchor, setMergeAnchor] = useState<string | null>(null);
  const [splitTarget, setSplitTarget] = useState<QuestionRow | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Load
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("*")
        .eq("mission_id", missionId)
        .eq("architecture_version", "v1")
        .order("sort_order", { ascending: true });
      if (!alive) return;
      if (error) toast.error(error.message);
      setRows((data as QuestionRow[]) || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [missionId]);

  // Persist a single field update
  const persistField = async (id: string, patch: Partial<QuestionRow>) => {
    const { error } = await supabase
      .from("questions")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) toast.error(error.message);
  };

  const updateRow = (id: string, patch: Partial<QuestionRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const commitField = (id: string, patch: Partial<QuestionRow>) => {
    updateRow(id, patch);
    void persistField(id, patch);
  };

  const sectionsList = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add((r.section || "Unsorted").trim()));
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) =>
      [r.question_number, r.question_name, r.question_text, r.section, r.admin_notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(f)),
    );
  }, [rows, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, QuestionRow[]>();
    filtered.forEach((r) => {
      const sec = (r.section || "Unsorted").trim();
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(r);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const totalQuestions = rows.length;
  const totalSections = useMemo(
    () => new Set(rows.map((r) => (r.section || "Unsorted").trim())).size,
    [rows],
  );

  const nextSort = () =>
    (rows.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0) || 0) + 10;

  const addQuestion = async (sectionName?: string) => {
    const payload: any = {
      mission_id: missionId,
      architecture_version: "v1",
      section: sectionName ?? null,
      sort_order: nextSort(),
      status: "open",
    };
    const { data, error } = await supabase
      .from("questions")
      .insert(payload as never)
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    setRows((rs) => [...rs, data as QuestionRow]);
  };

  const addSection = async () => {
    const name = window.prompt("New section name?");
    if (!name) return;
    await addQuestion(name);
  };

  const addWorkstream = async () => {
    const name = window.prompt("New workstream label? (internal grouping only)");
    if (!name) return;
    await addQuestion(WORKSTREAM_PREFIX + name);
  };

  const deleteRow = async (id: string) => {
    if (!window.confirm("Delete this question?")) return;
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  const moveRow = async (id: string, dir: -1 | 1) => {
    const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = sorted.findIndex((r) => r.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    const aSort = a.sort_order ?? 0;
    const bSort = b.sort_order ?? 0;
    setRows((rs) =>
      rs.map((r) =>
        r.id === a.id ? { ...r, sort_order: bSort } : r.id === b.id ? { ...r, sort_order: aSort } : r,
      ),
    );
    await Promise.all([
      persistField(a.id, { sort_order: bSort }),
      persistField(b.id, { sort_order: aSort }),
    ]);
  };

  const beginMerge = (id: string) => setMergeAnchor(id);
  const cancelMerge = () => setMergeAnchor(null);
  const confirmMerge = async () => {
    if (!mergeAnchor) return;
    const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = sorted.findIndex((r) => r.id === mergeAnchor);
    const a = sorted[idx];
    const b = sorted[idx + 1];
    if (!a || !b) {
      toast.error("No next question to merge with");
      setMergeAnchor(null);
      return;
    }
    const mergedText = [a.question_text, b.question_text].filter(Boolean).join("\n\n");
    const mergedName = [a.question_name, b.question_name].filter(Boolean).join(" + ");
    const patch: Partial<QuestionRow> = {
      question_text: mergedText,
      question_name: mergedName,
    };
    const { error: uErr } = await supabase
      .from("questions")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", a.id);
    if (uErr) return toast.error(uErr.message);
    const { error: dErr } = await supabase.from("questions").delete().eq("id", b.id);
    if (dErr) return toast.error(dErr.message);
    setRows((rs) =>
      rs.filter((r) => r.id !== b.id).map((r) => (r.id === a.id ? { ...r, ...patch } : r)),
    );
    setMergeAnchor(null);
    toast.success("Merged");
  };

  const performSplit = async (original: QuestionRow, firstText: string, secondText: string) => {
    const patch: Partial<QuestionRow> = { question_text: firstText };
    const { error: uErr } = await supabase
      .from("questions")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", original.id);
    if (uErr) return toast.error(uErr.message);
    const newSort = (original.sort_order ?? 0) + 1;
    const insertPayload: any = {
      mission_id: missionId,
      architecture_version: "v1",
      section: original.section,
      subsection: original.subsection,
      page_limit: original.page_limit,
      question_number: original.question_number ? original.question_number + ".b" : null,
      question_name: original.question_name ? original.question_name + " (part 2)" : null,
      question_text: secondText,
      sort_order: newSort,
      status: "open",
    };
    const { data, error: iErr } = await supabase
      .from("questions")
      .insert(insertPayload as never)
      .select("*")
      .single();
    if (iErr) return toast.error(iErr.message);
    setRows((rs) =>
      [...rs.map((r) => (r.id === original.id ? { ...r, ...patch } : r)), data as QuestionRow],
    );
    setSplitTarget(null);
    toast.success("Split into 2 questions");
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const { error: qErr } = await supabase
        .from("questions")
        .update({ architecture_version: "v2" } as never)
        .eq("mission_id", missionId);
      if (qErr) throw qErr;
      const { error: mErr } = await supabase
        .from("missions")
        .update({ wizard_step: 4 } as never)
        .eq("id", missionId);
      if (mErr) throw mErr;
      toast.success(`Response Architecture v2 confirmed — ${totalQuestions} questions locked in`);
      onAdvance();
    } catch (e: any) {
      toast.error(e?.message || "Could not confirm architecture");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
        Loading questions…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Review every question IRIS extracted — merge, split, rename, reorganize
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <button
          type="button"
          onClick={() => addQuestion()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold hover:bg-surface-hover"
        >
          <Plus className="h-3 w-3" /> Add Question
        </button>
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold hover:bg-surface-hover"
        >
          <Plus className="h-3 w-3" /> Add Section
        </button>
        <button
          type="button"
          onClick={addWorkstream}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold hover:bg-surface-hover"
        >
          <Plus className="h-3 w-3" /> Add Workstream
        </button>
        <div className="ml-auto">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter questions…"
            className="w-56 rounded-md border border-border bg-background px-2.5 py-1 text-xs"
          />
        </div>
      </div>

      {mergeAnchor && (
        <div className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <span>Merge selected question with the next one in order.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelMerge}
              className="rounded-md border border-border bg-surface px-2.5 py-1 font-semibold hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmMerge}
              className="rounded-md px-2.5 py-1 font-bold uppercase tracking-wider"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              Confirm Merge
            </button>
          </div>
        </div>
      )}

      {/* Grouped table */}
      {grouped.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No questions yet. Use "Add Question" or re-run IRIS.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([sec, qs]) => {
            const isWorkstream = sec.startsWith(WORKSTREAM_PREFIX);
            const collapsed = !!collapsedSections[sec];
            return (
              <div key={sec} className="rounded-md border border-border">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedSections((c) => ({ ...c, [sec]: !c[sec] }))
                  }
                  className="flex w-full items-center justify-between border-b border-border bg-surface px-3 py-2 text-left text-xs font-bold uppercase tracking-wider"
                >
                  <span className="flex items-center gap-2">
                    <span>{collapsed ? "▸" : "▾"}</span>
                    {isWorkstream ? (
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px]"
                        style={{ backgroundColor: `${GOLD}33`, color: GOLD }}
                      >
                        WORKSTREAM
                      </span>
                    ) : null}
                    <span>{sec}</span>
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {qs.length} question{qs.length === 1 ? "" : "s"}
                  </span>
                </button>
                {!collapsed && (
                  <div className="divide-y divide-border">
                    {qs.map((q) => {
                      const expanded = !!expandedText[q.id];
                      const isMergeAnchor = mergeAnchor === q.id;
                      const sortedAll = [...rows].sort(
                        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
                      );
                      const idxAll = sortedAll.findIndex((r) => r.id === q.id);
                      const isMergeNext =
                        mergeAnchor &&
                        idxAll > 0 &&
                        sortedAll[idxAll - 1].id === mergeAnchor;
                      return (
                        <div
                          key={q.id}
                          className={`grid grid-cols-12 gap-2 px-3 py-2 text-xs ${
                            isMergeAnchor || isMergeNext ? "bg-amber-500/10" : ""
                          }`}
                        >
                          <div className="col-span-2">
                            <label className="block text-[10px] uppercase text-muted-foreground">
                              Number
                            </label>
                            <Input
                              value={q.question_number ?? ""}
                              onChange={(v) => commitField(q.id, { question_number: v })}
                            />
                          </div>
                          <div className="col-span-4">
                            <label className="block text-[10px] uppercase text-muted-foreground">
                              Name
                            </label>
                            <Input
                              value={q.question_name ?? ""}
                              onChange={(v) => commitField(q.id, { question_name: v })}
                            />
                          </div>
                          <div className="col-span-4">
                            <label className="block text-[10px] uppercase text-muted-foreground">
                              Section
                            </label>
                            <input
                              list={`sections-${q.id}`}
                              value={q.section ?? ""}
                              onChange={(e) => commitField(q.id, { section: e.target.value })}
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                            />
                            <datalist id={`sections-${q.id}`}>
                              {sectionsList.map((s) => (
                                <option key={s} value={s} />
                              ))}
                            </datalist>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] uppercase text-muted-foreground">
                              Page Limit
                            </label>
                            <input
                              type="number"
                              value={q.page_limit ?? ""}
                              onChange={(e) =>
                                commitField(q.id, {
                                  page_limit: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                            />
                          </div>

                          <div className="col-span-12">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedText((m) => ({ ...m, [q.id]: !m[q.id] }))
                              }
                              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                            >
                              {expanded ? "▾ Hide question text" : "▸ Show question text"}
                            </button>
                            {expanded && (
                              <Textarea
                                value={q.question_text ?? ""}
                                onChange={(v) => commitField(q.id, { question_text: v })}
                                rows={4}
                              />
                            )}
                          </div>

                          <div className="col-span-12">
                            <label className="block text-[10px] uppercase text-muted-foreground">
                              Admin Notes
                            </label>
                            <Input
                              value={q.admin_notes ?? ""}
                              onChange={(v) => commitField(q.id, { admin_notes: v })}
                            />
                          </div>

                          <div className="col-span-12 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => beginMerge(q.id)}
                              className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-semibold hover:bg-surface-hover"
                            >
                              Merge ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitTarget(q)}
                              className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-semibold hover:bg-surface-hover"
                            >
                              Split
                            </button>
                            <button
                              type="button"
                              onClick={() => moveRow(q.id, -1)}
                              className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-semibold hover:bg-surface-hover"
                            >
                              Move Up ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveRow(q.id, 1)}
                              className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-semibold hover:bg-surface-hover"
                            >
                              Move Down ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteRow(q.id)}
                              className="ml-auto inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer summary + confirm */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totalQuestions}</span> questions across{" "}
          <span className="font-semibold text-foreground">{totalSections}</span> sections
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || totalQuestions === 0}
          className="rounded-md px-5 py-2 text-sm font-bold uppercase tracking-wider shadow disabled:opacity-50"
          style={{ backgroundColor: GOLD, color: NAVY }}
        >
          {confirming ? "Confirming…" : "Confirm Architecture →"}
        </button>
      </div>

      {splitTarget && (
        <SplitModal
          row={splitTarget}
          onCancel={() => setSplitTarget(null)}
          onConfirm={(a, b) => performSplit(splitTarget, a, b)}
        />
      )}
    </div>
  );
}

function SplitModal({
  row,
  onCancel,
  onConfirm,
}: {
  row: QuestionRow;
  onCancel: () => void;
  onConfirm: (firstText: string, secondText: string) => void;
}) {
  const text = row.question_text ?? "";
  const [splitAt, setSplitAt] = useState(() => Math.floor(text.length / 2));
  const first = text.slice(0, splitAt);
  const second = text.slice(splitAt);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ backgroundColor: OVERLAY_BG }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wider">Split Question</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Drag the slider to choose where this question splits into two.
          </p>
          <input
            type="range"
            min={1}
            max={Math.max(1, text.length - 1)}
            value={splitAt}
            onChange={(e) => setSplitAt(Number(e.target.value))}
            className="w-full"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Question 1
              </div>
              <div className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 text-xs whitespace-pre-wrap">
                {first}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Question 2
              </div>
              <div className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 text-xs whitespace-pre-wrap">
                {second}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!first.trim() || !second.trim()}
            onClick={() => onConfirm(first, second)}
            className="rounded-md px-4 py-1.5 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: NAVY }}
          >
            Confirm Split
          </button>
        </div>
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

/* ---------- Step 5: Upload Assignment Tracker ---------- */

type TrackerField =
  | "question_number"
  | "writer"
  | "athena_sme"
  | "client_sme"
  | "reviewer"
  | "copy_editor"
  | "workstream_lead"
  | "internal_deadline"
  | "notes";

const TRACKER_FIELDS: { key: TrackerField; label: string }[] = [
  { key: "question_number", label: "Question Number" },
  { key: "writer", label: "Writer" },
  { key: "athena_sme", label: "Athena SME" },
  { key: "client_sme", label: "Client SME" },
  { key: "reviewer", label: "Reviewer" },
  { key: "copy_editor", label: "Copy Editor" },
  { key: "workstream_lead", label: "Workstream Lead" },
  { key: "internal_deadline", label: "Internal Deadline" },
  { key: "notes", label: "Notes" },
];

const PERSON_FIELDS: TrackerField[] = [
  "writer",
  "athena_sme",
  "client_sme",
  "reviewer",
  "copy_editor",
  "workstream_lead",
];

function autoMapHeader(header: string, field: TrackerField): boolean {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<TrackerField, string[]> = {
    question_number: ["questionnumber", "qnumber", "questno", "qno", "questionno", "q", "questionid"],
    writer: ["writer", "author"],
    athena_sme: ["athenasme", "sme", "athena"],
    client_sme: ["clientsme", "client"],
    reviewer: ["reviewer", "review"],
    copy_editor: ["copyeditor", "copyedit", "editor"],
    workstream_lead: ["workstreamlead", "workstream", "lead"],
    internal_deadline: ["internaldeadline", "deadline", "duedate", "due"],
    notes: ["notes", "comment", "comments"],
  };
  return map[field].some((m) => h === m || h.includes(m));
}

function Step5AssignmentTracker({
  missionId,
  onAdvance,
}: {
  missionId: string;
  onAdvance: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<TrackerField, string>>({
    question_number: "",
    writer: "",
    athena_sme: "",
    client_sme: "",
    reviewer: "",
    copy_editor: "",
    workstream_lead: "",
    internal_deadline: "",
    notes: "",
  });
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      if (!json.length) {
        toast.error("Spreadsheet appears empty");
        return;
      }
      const cols = Object.keys(json[0]);
      setHeaders(cols);
      setRawRows(json);
      setFileName(file.name);
      // auto-map
      const next: Record<TrackerField, string> = { ...mapping };
      for (const f of TRACKER_FIELDS) {
        const match = cols.find((c) => autoMapHeader(String(c), f.key));
        if (match) next[f.key] = match;
      }
      setMapping(next);
    } catch (e: any) {
      toast.error(e?.message || "Could not parse spreadsheet");
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const mappedRows = useMemo(() => {
    if (!rawRows.length) return [];
    return rawRows.map((r) => {
      const out: Record<string, any> = {};
      for (const f of TRACKER_FIELDS) {
        const col = mapping[f.key];
        out[f.key] = col ? r[col] ?? null : null;
      }
      return out;
    });
  }, [rawRows, mapping]);

  const handleSave = async () => {
    if (!mappedRows.length) {
      toast.error("Upload a tracker first");
      return;
    }
    setSaving(true);
    try {
      // 1. Store parsed data
      const { error: mErr } = await supabase
        .from("missions")
        .update({
          assignment_tracker_data: mappedRows as any,
          wizard_step: 5,
        } as never)
        .eq("id", missionId);
      if (mErr) throw mErr;

      // 2. Auto-seed mission_team_members
      const nameRoles = new Map<string, Set<TrackerField>>();
      for (const row of mappedRows) {
        for (const field of PERSON_FIELDS) {
          const raw = row[field];
          if (raw == null) continue;
          const cell = String(raw).trim();
          if (!cell) continue;
          // allow comma-separated multi names
          for (const piece of cell.split(/[,;/]/)) {
            const name = piece.trim();
            if (!name) continue;
            if (!nameRoles.has(name)) nameRoles.set(name, new Set());
            nameRoles.get(name)!.add(field);
          }
        }
      }

      const inferRole = (fields: Set<TrackerField>): string => {
        if (fields.size > 1) {
          const onlySmes = Array.from(fields).every(
            (f) => f === "athena_sme" || f === "client_sme",
          );
          if (onlySmes) return "SME";
          return "Multi-Role";
        }
        const [only] = Array.from(fields);
        switch (only) {
          case "writer":
            return "Writer";
          case "athena_sme":
          case "client_sme":
            return "SME";
          case "reviewer":
            return "Reviewer";
          case "copy_editor":
            return "Copy Editor";
          case "workstream_lead":
            return "Workstream Lead";
          default:
            return "Team Member";
        }
      };

      let added = 0;
      for (const [name, fields] of nameRoles) {
        const { error } = await supabase
          .from("mission_team_members")
          .upsert(
            {
              mission_id: missionId,
              name,
              role: inferRole(fields),
              source: "tracker_import",
              active: true,
            } as never,
            { onConflict: "mission_id,name" },
          );
        if (!error) added++;
      }

      toast.success(
        `Assignment tracker saved — ${mappedRows.length} rows loaded, ${added} team members added to roster`,
      );
      onAdvance();
    } catch (e: any) {
      toast.error(e?.message || "Could not save tracker");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await supabase
      .from("missions")
      .update({ wizard_step: 5 } as never)
      .eq("id", missionId);
    onAdvance();
  };

  const previewRows = mappedRows.slice(0, 10);
  const remainingRows = Math.max(0, mappedRows.length - previewRows.length);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Upload your Athena staffing spreadsheet — IRIS will map assignments to questions
      </p>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver ? "border-amber-400 bg-amber-50/5" : "border-border bg-surface"
        }`}
      >
        <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-3 text-sm font-semibold">Athena Assignment Tracker</div>
        <div className="mt-1 text-xs text-muted-foreground max-w-xl mx-auto">
          Your spreadsheet should include: Question Number, Writer, Athena SME, Client SME,
          Reviewer, Copy Editor, Workstream Lead, Internal Deadline, Notes
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover disabled:opacity-50"
          >
            {parsing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            Browse Files
          </button>
          {fileName && (
            <span className="text-xs text-muted-foreground">
              <Check className="inline h-3 w-3 text-emerald-500" /> {fileName}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
        <div className="mt-2 text-[11px] text-muted-foreground">
          Accepts .xlsx, .xls, .csv · or drag and drop
        </div>
      </div>

      {/* Column mapping */}
      {headers.length > 0 && (
        <div className="rounded-md border border-border bg-surface p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Column Mapping
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TRACKER_FIELDS.map((f) => (
              <label key={f.key} className="space-y-1">
                <div className="text-xs font-medium">{f.label}</div>
                <select
                  value={mapping[f.key]}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [f.key]: e.target.value }))
                  }
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {previewRows.length > 0 && (
        <div className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Preview ({mappedRows.length} row{mappedRows.length === 1 ? "" : "s"})
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-hover sticky top-0">
                <tr>
                  {TRACKER_FIELDS.map((f) => (
                    <th key={f.key} className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {TRACKER_FIELDS.map((f) => (
                      <td key={f.key} className="px-2 py-1.5 align-top whitespace-nowrap max-w-[200px] truncate">
                        {row[f.key] != null ? String(row[f.key]) : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {remainingRows > 0 && (
            <div className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
              + {remainingRows} more row{remainingRows === 1 ? "" : "s"} (scroll to view)
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="text-xs font-medium text-muted-foreground underline hover:text-foreground disabled:opacity-50"
        >
          Skip — assign manually →
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || mappedRows.length === 0}
          className="rounded-md px-5 py-2 text-sm font-bold uppercase tracking-wider shadow disabled:opacity-50"
          style={{ backgroundColor: GOLD, color: NAVY }}
        >
          {saving ? "Saving…" : "Save Assignment Data →"}
        </button>
      </div>
    </div>
  );
}


function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
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

/* ---------- Step 6: Readiness & GO LIVE ---------- */



type ReadinessRow = {
  id?: string;
  contracts_complete: boolean;
  talentdesk_active: boolean;
  required_forms_complete: boolean;
  client_access_requested: boolean;
  slack_channels_ready: boolean;
  folders_created: boolean;
  kickoff_materials_ready: boolean;
  assignments_reviewed: boolean;
  security_acknowledgments_complete: boolean;
};

const READINESS_ITEMS: {
  key: keyof Omit<ReadinessRow, "id">;
  title: string;
  desc: string;
}[] = [
  { key: "contracts_complete", title: "Contracts Complete", desc: "All team contracts are signed and on file" },
  { key: "talentdesk_active", title: "TalentDesk Active", desc: "All team members are active in TalentDesk" },
  { key: "required_forms_complete", title: "Required Forms", desc: "NDAs, BAAs, and required forms are signed" },
  { key: "client_access_requested", title: "Client Access Requested", desc: "Access requests submitted for all client systems" },
  { key: "slack_channels_ready", title: "Slack Channels Ready", desc: "Mission Slack channels created and members added" },
  { key: "folders_created", title: "Folders Created", desc: "Shared drive folders set up with correct permissions" },
  { key: "kickoff_materials_ready", title: "Kickoff Materials", desc: "Kickoff deck, agenda, and assignments are prepared" },
  { key: "assignments_reviewed", title: "Assignments Reviewed", desc: "Section assignments confirmed with leads" },
  { key: "security_acknowledgments_complete", title: "Security Acknowledgments", desc: "All team members signed security and confidentiality forms" },
];

const EMPTY_READINESS: ReadinessRow = {
  contracts_complete: false,
  talentdesk_active: false,
  required_forms_complete: false,
  client_access_requested: false,
  slack_channels_ready: false,
  folders_created: false,
  kickoff_materials_ready: false,
  assignments_reviewed: false,
  security_acknowledgments_complete: false,
};

function Step6Readiness({
  missionId,
  onClose,
  onSaveAndClose,
}: {
  missionId: string;
  onClose: () => void;
  onSaveAndClose: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<ReadinessRow>(EMPTY_READINESS);
  const [missionName, setMissionName] = useState("");
  const [openItems, setOpenItems] = useState({ contracts: 0, ndas: 0, talentdesk: 0, baas: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchStage, setLaunchStage] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: rd }, { data: mission }, { data: team }] = await Promise.all([
        supabase
          .from("mission_readiness")
          .select("*")
          .eq("mission_id", missionId)
          .maybeSingle(),
        supabase.from("missions").select("name").eq("id", missionId).maybeSingle(),
        supabase
          .from("mission_team_members")
          .select("contract_status, nda_status, talentdesk_status, baa_required, baa_status")
          .eq("mission_id", missionId),
      ]);
      if (!alive) return;
      if (rd) setRow({ ...EMPTY_READINESS, ...(rd as any) });
      setMissionName((mission as any)?.name ?? "this mission");
      const members = (team ?? []) as any[];
      setOpenItems({
        contracts: members.filter((m) => m.contract_status !== "signed").length,
        ndas: members.filter((m) => m.nda_status !== "signed" && m.nda_status !== "waived").length,
        talentdesk: members.filter((m) => m.talentdesk_status !== "active").length,
        baas: members.filter((m) => m.baa_required === true && m.baa_status !== "signed").length,
      });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [missionId]);

  const checkedCount = useMemo(
    () => READINESS_ITEMS.reduce((n, it) => n + (row[it.key] ? 1 : 0), 0),
    [row],
  );
  const allReady = checkedCount === 9;
  const barColor = checkedCount < 6 ? "#f43f5e" : checkedCount < 9 ? "#f59e0b" : "#10b981";

  const toggle = async (key: keyof Omit<ReadinessRow, "id">) => {
    const next = { ...row, [key]: !row[key] };
    setRow(next);
    const checkedNext = READINESS_ITEMS.reduce((n, it) => n + (next[it.key] ? 1 : 0), 0);
    const { error } = await supabase
      .from("mission_readiness")
      .upsert({ mission_id: missionId, ...next } as never, { onConflict: "mission_id" });
    if (error) {
      toast.error(error.message);
      setRow(row);
      return;
    }
    // Cascade mission_status based on readiness
    await supabase
      .from("missions")
      .update({
        mission_status: checkedNext === 9 ? "Ready to Go Live" : "Draft",
      } as never)
      .eq("id", missionId);
  };

  const goLive = async () => {
    setLaunching(true);
    try {
      setLaunchStage("Activating mission...");
      const now = new Date().toISOString();
      const { error: mErr } = await supabase
        .from("missions")
        .update({
          mission_status: "Live",
          status: "ACTIVE",
          wizard_step: 7,
          launched_at: now,
          atlas_synced_at: now,
        } as never)
        .eq("id", missionId);
      if (mErr) throw mErr;

      setLaunchStage("Cascading to Atlas...");
      const { data: intel } = await supabase
        .from("mission_intelligence")
        .select("content")
        .eq("mission_id", missionId)
        .eq("layer", "wizard_analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const content: any = (intel as any)?.content ?? {};

      const themes: string[] = Array.isArray(content.recommended_win_themes)
        ? content.recommended_win_themes
            .map((t: any) => (typeof t === "string" ? t : t?.title ?? t?.theme ?? ""))
            .filter(Boolean)
        : [];
      if (themes.length > 0) {
        await supabase.from("win_themes").insert(
          themes.map((t) => ({
            mission_id: missionId,
            title: t,
            created_by_system: true,
          })) as never,
        );
      }

      const items: string[] = Array.isArray(content.compliance_items)
        ? content.compliance_items
            .map((i: any) => (typeof i === "string" ? i : i?.requirement_text ?? i?.requirement ?? ""))
            .filter(Boolean)
        : [];
      if (items.length > 0) {
        await supabase.from("compliance_requirements").insert(
          items.map((i) => ({
            mission_id: missionId,
            requirement_text: i,
            source_document: "IRIS",
            source_kind: "iris_wizard",
          })) as never,
        );
      }

      setLaunchStage("Mission is LIVE ✓");
      toast.success("Mission is LIVE");
      await new Promise((r) => setTimeout(r, 700));
      onClose();
      navigate({ to: "/admin/missions/$missionId", params: { missionId } });
    } catch (e: any) {
      toast.error(e?.message || "Could not launch mission");
    } finally {
      setLaunching(false);
      setConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
        Loading readiness…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Nothing launches until you're ready — and you can always save and come back
      </p>

      {/* Score */}
      <div className="rounded-lg border border-border bg-background/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
            Readiness
          </span>
          <span className="text-sm font-bold" style={{ color: barColor }}>
            {checkedCount} of 9 Ready
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full transition-all"
            style={{ width: `${(checkedCount / 9) * 100}%`, backgroundColor: barColor }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {READINESS_ITEMS.map((it) => {
          const on = row[it.key];
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => toggle(it.key)}
              className="w-full flex items-start gap-4 rounded-lg border p-3 text-left transition hover:bg-surface-hover"
              style={{
                borderColor: on ? GOLD : "var(--border)",
                backgroundColor: on ? "rgba(201,168,76,0.06)" : "transparent",
              }}
            >
              <div className="pt-0.5">
                <Toggle on={on} onChange={() => toggle(it.key)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">{it.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{it.desc}</div>
              </div>
              {on && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-1" />}
            </button>
          );
        })}
      </div>

      {/* Open items */}
      <div className="rounded-lg border border-border bg-background/30 p-4">
        <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Open Items
        </h4>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {([
            ["contracts", openItems.contracts, "unsigned contracts"],
            ["ndas", openItems.ndas, "unsigned NDAs"],
            ["talentdesk", openItems.talentdesk, "not active in TalentDesk"],
            ["baas", openItems.baas, "unsigned BAAs"],
          ] as const).map(([k, n, label]) => (
            <span key={k} style={{ color: n > 0 ? "#f59e0b" : "var(--muted-foreground)" }}>
              <strong style={{ color: n > 0 ? "#f59e0b" : "var(--foreground)" }}>{n}</strong> {label}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => onSaveAndClose()}
          className="rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover"
        >
          Save & Come Back
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!allReady}
          className="rounded-lg px-8 py-3.5 text-sm font-bold uppercase tracking-[0.18em] shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: GOLD, color: NAVY }}
        >
          GO LIVE →
        </button>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
            {!launching ? (
              <>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  GO LIVE — {missionName}?
                </h3>
                <p className="text-sm text-muted-foreground mb-5">
                  This will activate the mission and cascade all approved content into Atlas.
                  You can still make controlled edits after launch.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={goLive}
                    className="rounded-md px-5 py-2 text-sm font-bold uppercase tracking-wider shadow"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    Confirm — GO LIVE
                  </button>
                </div>
              </>
            ) : (
              <div className="py-6 text-center">
                <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" style={{ color: GOLD }} />
                <p className="text-sm font-semibold text-foreground">{launchStage}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
