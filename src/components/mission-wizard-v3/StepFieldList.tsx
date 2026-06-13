/**
 * Generic IRIS-confirm step body — used by Steps 2–6.
 * Loads extractions for a set of field keys, renders an IrisFieldRow for each,
 * and provides a "Generate with IRIS" button for lazy extraction (steps 3–6).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeMissionStep } from "@/lib/iris-mission-analysis.functions";
import { IrisFieldRow, type ExtractionRow } from "./IrisFieldRow";

export type StepField = {
  key: string;
  label: string;
  hint?: string;
  multiline?: boolean;
};

export function StepFieldList({
  missionId,
  wizardStep,
  fields,
  autoRun = false,
}: {
  missionId: string;
  wizardStep: number;
  fields: StepField[];
  autoRun?: boolean;
}) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeMissionStep);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ["mission-iris-extractions", missionId, wizardStep] as const;

  const { data: extractions } = useQuery({
    queryKey,
    queryFn: async (): Promise<ExtractionRow[]> => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select(
          "id, extracted_field, extracted_value, source_file_name, confidence_score, confirmed_by_user, overridden_by_user, user_override_value",
        )
        .eq("mission_id", missionId)
        .in("extracted_field", fields.map((f) => f.key));
      return (data ?? []) as ExtractionRow[];
    },
  });

  const byField = useMemo(() => {
    const m = new Map<string, ExtractionRow>();
    (extractions ?? []).forEach((e) => m.set(e.extracted_field, e));
    return m;
  }, [extractions]);

  const hasAny = (extractions?.length ?? 0) > 0;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await analyzeFn({
        data: {
          missionId,
          wizardStep,
          fields: fields.map((f) => ({ key: f.key, label: f.label, hint: f.hint })),
        },
      });
      qc.invalidateQueries({ queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (autoRun && !hasAny && !generating) {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  async function confirmAll() {
    const unconfirmed = (extractions ?? []).filter((e) => !e.confirmed_by_user && e.extracted_value);
    if (unconfirmed.length === 0) return;
    await supabase
      .from("mission_iris_extractions")
      .update({ confirmed_by_user: true, confirmed_at: new Date().toISOString() })
      .in(
        "id",
        unconfirmed.map((e) => e.id),
      );
    qc.invalidateQueries({ queryKey });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-2 text-[12.5px] px-3 py-1.5 rounded border border-amber-400/30 text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generating ? "IRIS is thinking…" : hasAny ? "Re-run IRIS" : "Generate with IRIS"}
        </button>
        {hasAny && (
          <button
            onClick={confirmAll}
            className="inline-flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
          >
            <Check className="h-3.5 w-3.5" /> Confirm all IRIS findings
          </button>
        )}
      </div>

      {error && <div className="text-[13px] text-red-400">{error}</div>}

      <div className="space-y-5">
        {fields.map((f) => (
          <IrisFieldRow
            key={f.key}
            missionId={missionId}
            fieldKey={f.key}
            label={f.label}
            hint={f.hint}
            multiline={f.multiline}
            extraction={byField.get(f.key) ?? null}
            onChange={() => qc.invalidateQueries({ queryKey })}
          />
        ))}
      </div>
    </div>
  );
}
