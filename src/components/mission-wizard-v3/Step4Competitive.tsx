/**
 * Step 4 — Competitive. Confirmed competitor list + ORACLE monitoring mode.
 * Staged to sessionStorage; persisted at launch.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { analyzeMissionStep } from "@/lib/iris-mission-analysis.functions";
import { loadStaged, saveStaged } from "@/lib/oracle/wizard-stage";
import type { OracleMonitoringMode } from "@/lib/oracle/types";
import { WizardStepHeading, WizardFooter } from "./WizardShellV3";

const STEP4_FIELDS = [
  { key: "competitor_1", label: "Competitor 1", hint: "Likely or known bidder" },
  { key: "competitor_2", label: "Competitor 2" },
  { key: "competitor_3", label: "Competitor 3" },
  { key: "competitor_4", label: "Competitor 4" },
  { key: "competitor_5", label: "Competitor 5" },
];

type ExtractionRow = {
  id: string;
  extracted_field: string;
  extracted_value: string | null;
  source_file_name: string | null;
  confidence_score: number | null;
  confirmed_by_user: boolean;
  overridden_by_user: boolean;
};

const MODES: { value: OracleMonitoringMode; label: string; threshold: number; desc: string; recommended?: boolean }[] = [
  { value: "conservative", label: "Conservative", threshold: 65, desc: "Curated only. High bar." },
  { value: "balanced", label: "Balanced", threshold: 40, desc: "Moderate signal volume. Admin reviews all signals.", recommended: true },
  { value: "aggressive", label: "Aggressive", threshold: 25, desc: "High volume. You review everything." },
];

export function Step4Competitive({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeMissionStep);

  const staged = loadStaged(missionId);
  const [competitors, setCompetitors] = useState<string[]>(staged.competitors ?? []);
  const [mode, setMode] = useState<OracleMonitoringMode>(staged.monitoring_mode ?? "balanced");
  const [draft, setDraft] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  // Hydrate from missions.known_competitors when sessionStorage is empty.
  useEffect(() => {
    if ((staged.competitors ?? []).length > 0) return;
    let cancelled = false;
    void supabase
      .from("missions")
      .select("known_competitors")
      .eq("id", missionId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const existing = (data?.known_competitors ?? []) as string[];
        if (existing.length) setCompetitors(existing);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  useEffect(() => {
    const threshold = MODES.find((m) => m.value === mode)?.threshold ?? 40;
    saveStaged(missionId, { competitors, monitoring_mode: mode, signal_threshold: threshold });
    // Also persist competitors directly to the mission so they survive a wizard reload
    // and become visible to ORACLE/other surfaces even before launch.
    const t = setTimeout(() => {
      void supabase
        .from("missions")
        .update({ known_competitors: competitors })
        .eq("id", missionId)
        .then(({ error }) => {
          if (error) console.error("[Step4Competitive] save competitors failed:", error.message);
        });
    }, 400);
    return () => clearTimeout(t);
  }, [missionId, competitors, mode]);

  const queryKey = ["mission-iris-extractions", missionId, 4] as const;
  const { data: extractions } = useQuery({
    queryKey,
    queryFn: async (): Promise<ExtractionRow[]> => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("id, extracted_field, extracted_value, source_file_name, confidence_score, confirmed_by_user, overridden_by_user")
        .eq("mission_id", missionId)
        .in("extracted_field", STEP4_FIELDS.map((f) => f.key));
      return (data ?? []) as ExtractionRow[];
    },
  });

  useEffect(() => {
    if (extractions === undefined) return;
    if (extractions.length > 0) return;
    let cancelled = false;
    setAnalyzing(true);
    const t = setTimeout(() => {
      if (!cancelled) setAnalyzing(false);
    }, 30000);
    analyzeFn({
      data: {
        missionId,
        wizardStep: 4,
        fields: STEP4_FIELDS.map((f) => ({ key: f.key, label: f.label, hint: f.hint })),
      },
    })
      .then(() => {
        if (!cancelled) qc.invalidateQueries({ queryKey });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setAnalyzing(false);
          clearTimeout(t);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractions === undefined ? "loading" : extractions.length === 0 ? "empty" : "loaded"]);

  const suggestions = (extractions ?? []).filter(
    (e) =>
      !e.confirmed_by_user &&
      !e.overridden_by_user &&
      e.extracted_value &&
      !competitors.some((c) => c.toLowerCase() === e.extracted_value!.toLowerCase()),
  );

  function addCompetitor(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (competitors.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    setCompetitors([...competitors, trimmed]);
  }
  function removeCompetitor(name: string) {
    setCompetitors(competitors.filter((c) => c !== name));
  }
  async function saveAndContinue() {
    const threshold = MODES.find((m) => m.value === mode)?.threshold ?? 40;
    const cleanCompetitors = Array.from(new Set([...competitors, draft].map((c) => c.trim()).filter(Boolean)));
    const [missionSave, oracleSave] = await Promise.all([
      supabase.from("missions").update({ known_competitors: cleanCompetitors }).eq("id", missionId),
      supabase.from("oracle_engagement_config").upsert(
        {
          mission_id: missionId,
          competitors: cleanCompetitors as never,
          monitoring_mode: mode,
          signal_threshold: threshold,
          status: "active",
        } as never,
        { onConflict: "mission_id" },
      ),
    ]);
    if (missionSave.error || oracleSave.error) {
      console.error("[Step4Competitive] save failed", missionSave.error ?? oracleSave.error);
      toast.error("Could not save competitive context.");
      return;
    }
    setCompetitors(cleanCompetitors);
    setDraft("");
    saveStaged(missionId, { competitors: cleanCompetitors, monitoring_mode: mode, signal_threshold: threshold });
    onAdvance();
  }
  async function markExtraction(id: string, patch: { confirmed_by_user?: boolean; overridden_by_user?: boolean }) {
    await supabase.from("mission_iris_extractions").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey });
  }

  return (
    <div>
      <WizardStepHeading
        title="Who are we up against, and how aggressive should ORACLE be?"
        subtitle="Each confirmed competitor enters ORACLE's monitoring queue automatically."
      />

      {/* Competitors */}
      <div className="mb-6">
        <h3 className="text-white text-[16px] font-medium">Who are we competing against?</h3>
        <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">
          ORACLE will monitor each confirmed competitor automatically.
        </p>
        <div
          className="rounded-lg p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex flex-wrap gap-2 mb-3">
            {competitors.length === 0 && (
              <span className="text-[11.5px] italic text-white/30">No competitors added yet.</span>
            )}
            {competitors.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12.5px] text-white"
                style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)" }}
              >
                {c}
                <button onClick={() => removeCompetitor(c)} className="text-white/40 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <input
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              if (v.endsWith(",")) {
                addCompetitor(v.slice(0, -1));
                setDraft("");
              } else {
                setDraft(v);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                e.preventDefault();
                addCompetitor(draft);
                setDraft("");
              }
            }}
            placeholder="Type a competitor — press Enter or comma to add."
            className="w-full text-[13px] px-3 py-2 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30"
          />
        </div>
      </div>

      {analyzing && (
        <div className="mb-4 inline-flex items-center gap-2 text-[12px] text-white/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> IRIS is reading your documents…
        </div>
      )}

      {suggestions.length > 0 && (
        <div
          className="rounded-lg p-4 mb-6"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderLeft: "2px solid rgba(196,154,43,0.3)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="h-3.5 w-3.5" style={{ color: "#C49A2B" }} />
            <span className="text-[12.5px] uppercase tracking-[0.1em] text-white/70">IRIS Suggestions</span>
          </div>
          <div className="space-y-3">
            {suggestions.map((r) => {
              const pct = Math.max(0, Math.min(100, Math.round((r.confidence_score ?? 0) * 100)));
              return (
                <div key={r.id} className="rounded p-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <p className="text-[13px] text-white">{r.extracted_value}</p>
                  <div className="mt-1.5 h-[3px] rounded bg-white/5 overflow-hidden">
                    <div className="h-full" style={{ width: `${pct}%`, background: "#C49A2B" }} />
                  </div>
                  {r.source_file_name && (
                    <p className="text-[11px] text-white/40 mt-1">Source: {r.source_file_name}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => {
                        addCompetitor(r.extracted_value ?? "");
                        void markExtraction(r.id, { confirmed_by_user: true });
                      }}
                      className="px-2 py-1 rounded text-[11.5px] text-white"
                      style={{ border: "1px solid rgba(196,154,43,0.5)", background: "rgba(196,154,43,0.08)" }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => void markExtraction(r.id, { overridden_by_user: true })}
                      className="ml-auto text-white/40 hover:text-white text-[11.5px]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monitoring Mode */}
      <div className="mb-2">
        <h3 className="text-white text-[16px] font-medium mb-3">How should ORACLE monitor this mission?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODES.map((m) => {
            const selected = mode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className="text-left rounded-lg p-3 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: selected ? "1px solid #C49A2B" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-[14px] font-medium"
                    style={{ color: selected ? "#C49A2B" : "rgba(255,255,255,0.85)" }}
                  >
                    {selected ? "◉ " : ""}{m.label}
                  </span>
                  {m.recommended && (
                    <span className="text-[10px] uppercase tracking-[0.1em] text-white/45">Recommended</span>
                  )}
                </div>
                <div className="text-[11.5px] text-white/45 mb-2">Threshold: {m.threshold}</div>
                <p className="text-[12px] text-white/55">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <WizardFooter step={4} onBack={onBack} onContinue={saveAndContinue} />
    </div>
  );
}
