import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Check, Sparkles, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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
          {step >= 4 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {STEP_NAMES[step - 1]}
              </h2>
              <p>This step will be available soon.</p>
            </div>
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
          {step !== 3 && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={saving}
              className="rounded-md px-5 py-2 text-sm font-bold uppercase tracking-wider shadow disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              {saving ? "Saving…" : step === 6 ? "Finish" : "Save & Continue →"}
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
