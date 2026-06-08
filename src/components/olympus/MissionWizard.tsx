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
  4: { name: "Team", subtitle: "Coming soon" },
  5: { name: "Readiness", subtitle: "Coming soon" },
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

type Props = {
  open: boolean;
  onClose: () => void;
  missionId?: string;
  startStep?: number;
};

export default function MissionWizard({ open, onClose, missionId: initialMissionId, startStep = 1 }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(startStep);
  const [missionId, setMissionId] = useState<string | null>(initialMissionId ?? null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  useEffect(() => {
    if (open) {
      setStep(startStep);
      setErr(null);
    }
  }, [open, startStep]);

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
      status: "DRAFT",
      wizard_step: 1,
    };
    for (const k of [
      "prime_contractor",
      "state",
      "program_type",
      "engagement_type",
      "internal_lead",
      "operations_lead",
      "engagement_lead",
    ] as const) {
      if (s1[k].trim()) payload[k] = s1[k].trim();
    }
    if (s1.submission_date) payload.submission_date = s1.submission_date;

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

  const handleContinue = async () => {
    let ok = true;
    if (step === 1) ok = await saveStep1();
    else if (step === 2) ok = await saveStep2();
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

          {step >= 3 && (
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
