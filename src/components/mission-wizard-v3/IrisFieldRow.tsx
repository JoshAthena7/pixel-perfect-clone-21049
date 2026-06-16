/**
 * Shared IRIS-suggestion field row used across wizard steps 2–6.
 *
 * Displays the IRIS-extracted value in a gold-tinted block with
 * Confirm / Edit / Write My Own controls. Persists user actions to
 * mission_iris_extractions (confirmed_by_user / overridden_by_user).
 */
import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ExtractionRow = {
  id: string;
  extracted_field: string;
  extracted_value: string | null;
  source_file_name: string | null;
  confidence_score: number | null;
  confirmed_by_user: boolean;
  overridden_by_user: boolean;
  user_override_value: string | null;
};

export function IrisFieldRow({
  missionId,
  wizardStep,
  fieldKey,
  label,
  hint,
  multiline = false,
  extraction,
  onChange,
}: {
  missionId: string;
  wizardStep: number;
  fieldKey: string;
  label: string;
  hint?: string;
  multiline?: boolean;
  extraction: ExtractionRow | null;
  onChange?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    extraction?.user_override_value ?? extraction?.extracted_value ?? "",
  );
  const [saving, setSaving] = useState(false);

  const currentValue =
    extraction?.user_override_value ?? extraction?.extracted_value ?? "";
  const isConfirmed = extraction?.confirmed_by_user ?? false;
  const isOverridden = extraction?.overridden_by_user ?? false;
  const hasIrisValue = !!extraction?.extracted_value;
  const lastSavedRef = useRef(currentValue);

  useEffect(() => {
    if (!editing) setDraft(currentValue);
    lastSavedRef.current = currentValue;
  }, [currentValue, editing]);

  async function upsertOverride(value: string, closeEditor = true) {
    setSaving(true);
    try {
      let rowId = extraction?.id;
      if (!rowId) {
        const { data: existing } = await supabase
          .from("mission_iris_extractions")
          .select("id")
          .eq("mission_id", missionId)
          .eq("extracted_field", fieldKey)
          .limit(1)
          .maybeSingle();
        rowId = existing?.id;
      }

      if (rowId) {
        await supabase
          .from("mission_iris_extractions")
          .update({
            wizard_step: wizardStep,
            user_override_value: value,
            overridden_by_user: true,
            confirmed_by_user: true,
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", rowId);
      } else {
        await supabase.from("mission_iris_extractions").insert({
          mission_id: missionId,
          wizard_step: wizardStep,
          extracted_field: fieldKey,
          extracted_value: null,
          user_override_value: value,
          overridden_by_user: true,
          confirmed_by_user: true,
          confirmed_at: new Date().toISOString(),
        });
      }
      lastSavedRef.current = value;
      await propagateToMission(value);
      onChange?.();
    } finally {
      setSaving(false);
      if (closeEditor) setEditing(false);
    }
  }

  // Mirror a small set of canonical fields onto the missions row so older
  // code paths (pre-launch checklist, briefs) that read from missions.* see
  // the same value the wizard saved into mission_iris_extractions.
  async function propagateToMission(value: string) {
    const map: Record<string, string> = {
      mission_type: "procurement_type",
      program_type: "program_type",
      client_agency: "agency_name",
      state_location: "state",
    };
    const col = map[fieldKey];
    if (!col) return;
    try {
      await supabase
        .from("missions")
        .update({ [col]: value || null } as any)
        .eq("id", missionId);
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    if (!editing || draft === lastSavedRef.current || (!draft.trim() && !currentValue)) return;
    const timer = window.setTimeout(() => {
      void upsertOverride(draft, false);
    }, 650);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editing, currentValue]);

  async function confirm() {
    if (!extraction) return;
    setSaving(true);
    try {
      await supabase
        .from("mission_iris_extractions")
        .update({
          confirmed_by_user: true,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", extraction.id);
      onChange?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-[13px] uppercase tracking-[0.14em] text-white/55">
          {label}
        </label>
        {hint && <span className="text-[11px] text-white/35">{hint}</span>}
      </div>

      {editing ? (
        <div className="space-y-2">
          {multiline ? (
            <Textarea
              autoFocus
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="bg-white/5 border-white/15 text-white"
            />
          ) : (
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="bg-white/5 border-white/15 text-white"
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={saving}
              onClick={() => upsertOverride(draft)}
              style={{ background: "#C49A2B", color: "#0D1B3E" }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(currentValue);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "rounded-lg p-3 border transition-all",
            isConfirmed
              ? "bg-emerald-500/5 border-emerald-500/30"
              : hasIrisValue
                ? "border-amber-400/30"
                : "border-white/10 bg-white/5",
          )}
          style={
            !isConfirmed && hasIrisValue
              ? { background: "rgba(196,154,43,0.06)" }
              : undefined
          }
        >
          {hasIrisValue && !isOverridden && (
            <div className="flex items-center gap-1.5 mb-1.5 text-[10.5px] uppercase tracking-[0.18em]" style={{ color: "#C49A2B" }}>
              <Sparkles className="h-3 w-3" />
              IRIS · {extraction?.source_file_name ?? "extracted"}
              {typeof extraction?.confidence_score === "number" && (
                <span className="text-white/40 ml-1">
                  ({Math.round(extraction.confidence_score * 100)}%)
                </span>
              )}
            </div>
          )}
          <div className="text-[14px] text-white whitespace-pre-wrap min-h-[1.25rem]">
            {currentValue || <span className="text-white/40 italic">No value — enter manually</span>}
          </div>
          <div className="mt-2 flex gap-2 flex-wrap">
            {!isConfirmed && hasIrisValue && (
              <button
                disabled={saving}
                onClick={confirm}
                className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
              >
                <Check className="h-3 w-3" /> Confirm
              </button>
            )}
            <button
              disabled={saving}
              onClick={() => {
                setDraft(currentValue);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded border border-white/15 text-white/70 hover:bg-white/5"
            >
              <Pencil className="h-3 w-3" /> {currentValue ? "Edit" : "Enter"}
            </button>
            {isConfirmed && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/80">
                <Check className="h-3 w-3" /> Confirmed
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
