/**
 * Step 3 — Strategy. ORACLE strategic configuration: Win Themes, Top Risks,
 * and North Star, each tagged with a Signal Authority.
 *
 * Values are staged to sessionStorage (see oracle/wizard-stage). Persistence
 * to oracle_engagement_config + oracle_beliefs happens at launch.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, Diamond, Sparkles, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeMissionStep } from "@/lib/iris-mission-analysis.functions";
import { loadStaged, saveStaged } from "@/lib/oracle/wizard-stage";
import type { OracleTaggedItem, OracleSignalAuthority } from "@/lib/oracle/types";
import { WizardStepHeading, WizardFooter } from "./WizardShellV3";

const STEP3_FIELDS = [
  { key: "win_theme_1", label: "Win Theme 1", hint: "Primary competitive advantage or differentiator" },
  { key: "win_theme_2", label: "Win Theme 2" },
  { key: "win_theme_3", label: "Win Theme 3" },
  { key: "win_theme_4", label: "Win Theme 4" },
  { key: "win_theme_5", label: "Win Theme 5" },
  { key: "top_risk_1", label: "Top Risk 1", hint: "Incumbent advantages, political exposure, team gaps, or timeline risks" },
  { key: "top_risk_2", label: "Top Risk 2" },
  { key: "top_risk_3", label: "Top Risk 3" },
  { key: "top_risk_4", label: "Top Risk 4" },
  { key: "top_risk_5", label: "Top Risk 5" },
  { key: "north_star", label: "North Star", hint: "One sentence: what must the state believe for us to win?" },
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

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function AuthorityChip({
  item,
  onRemove,
  onUpdateReference,
}: {
  item: OracleTaggedItem;
  onRemove: () => void;
  onUpdateReference?: (ref: string) => void;
}) {
  const isClient = item.signal_authority === "client_stated";
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] text-white"
        style={{
          border: isClient ? "1px solid rgba(196,154,43,0.4)" : "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.03)",
          alignSelf: "flex-start",
          maxWidth: "100%",
        }}
      >
        {isClient ? (
          <Star className="h-3.5 w-3.5 shrink-0" fill="#C49A2B" color="#C49A2B" />
        ) : (
          <Diamond className="h-3.5 w-3.5 shrink-0 text-white" />
        )}
        <span className="break-words">{item.text}</span>
        <button onClick={onRemove} className="text-white/40 hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {isClient && onUpdateReference && (
        <input
          value={item.rfp_reference ?? ""}
          onChange={(e) => onUpdateReference(e.target.value.slice(0, 80))}
          placeholder="RFP Reference (optional) — e.g. Section 4.2, Criterion 3"
          maxLength={80}
          className="ml-6 max-w-md text-[11.5px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30"
        />
      )}
    </div>
  );
}

function TaggedListEditor({
  title,
  prompt,
  items,
  onChange,
  min,
  max,
  inputPlaceholder,
}: {
  title: string;
  prompt: string;
  items: OracleTaggedItem[];
  onChange: (next: OracleTaggedItem[]) => void;
  min: number;
  max: number;
  inputPlaceholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [pendingTag, setPendingTag] = useState<string | null>(null);

  const clientItems = items.filter((i) => i.signal_authority === "client_stated");
  const teamItems = items.filter((i) => i.signal_authority === "team_validated");
  const total = clientItems.length + teamItems.length;

  function addItem(authority: OracleSignalAuthority) {
    if (!pendingTag) return;
    if (total >= max) return;
    onChange([
      ...items,
      {
        id: uid(),
        text: pendingTag,
        signal_authority: authority,
        rfp_reference: null,
        confidence: 100,
        status: "confirmed",
      },
    ]);
    setPendingTag(null);
    setDraft("");
  }

  function removeItem(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }
  function updateRef(id: string, ref: string) {
    onChange(items.map((i) => (i.id === id ? { ...i, rfp_reference: ref || null } : i)));
  }

  return (
    <div className="mb-4">
      <h3 className="text-white text-[16px] font-medium">{title}</h3>
      <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">{prompt}</p>
      <div
        className="rounded-lg p-4"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Client-Stated */}
        <div className="flex items-center gap-1.5 mb-2">
          <Star className="h-3.5 w-3.5" fill="#C49A2B" color="#C49A2B" />
          <span className="text-[11.5px] uppercase tracking-[0.1em] text-white/70">Client-Stated</span>
        </div>
        <div className="flex flex-col gap-2">
          {clientItems.length === 0 && (
            <p className="text-[11.5px] italic text-white/30">No client-stated items yet.</p>
          )}
          {clientItems.map((i) => (
            <AuthorityChip
              key={i.id}
              item={i}
              onRemove={() => removeItem(i.id)}
              onUpdateReference={(ref) => updateRef(i.id, ref)}
            />
          ))}
        </div>

        <div className="my-4 border-t border-white/10" />

        {/* Team-Validated */}
        <div className="flex items-center gap-1.5 mb-2">
          <Diamond className="h-3.5 w-3.5 text-white" />
          <span className="text-[11.5px] uppercase tracking-[0.1em] text-white/70">Team-Validated</span>
        </div>
        <div className="flex flex-col gap-2">
          {teamItems.length === 0 && (
            <p className="text-[11.5px] italic text-white/30">No team-validated items yet.</p>
          )}
          {teamItems.map((i) => (
            <AuthorityChip key={i.id} item={i} onRemove={() => removeItem(i.id)} />
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-white/10">
          {pendingTag ? (
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-[12.5px] text-white/70">How should "{pendingTag}" be tagged?</span>
              <button
                onClick={() => addItem("client_stated")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[12px] text-white"
                style={{ border: "1px solid rgba(196,154,43,0.5)", background: "rgba(196,154,43,0.1)" }}
              >
                <Star className="h-3 w-3" fill="#C49A2B" color="#C49A2B" /> Client-Stated
              </button>
              <button
                onClick={() => addItem("team_validated")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[12px] text-white"
                style={{ border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <Diamond className="h-3 w-3" /> Team-Validated
              </button>
              <button
                onClick={() => {
                  setPendingTag(null);
                  setDraft("");
                }}
                className="text-[11.5px] text-white/40 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  e.preventDefault();
                  if (total >= max) return;
                  setPendingTag(draft.trim());
                }
              }}
              placeholder={inputPlaceholder}
              className="w-full text-[13px] px-3 py-2 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30"
            />
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11.5px]">
        <span className={total < min ? "text-amber-300" : "text-white/45"}>
          {total < min
            ? `Add at least ${min} ${min === 1 ? "item" : "items"} to continue.`
            : `${total} of ${max} added.`}
        </span>
      </div>
    </div>
  );
}

function IrisSuggestionsPanel({
  title,
  rows,
  onAccept,
  onMarkClient,
  onDismiss,
  showClientOption = true,
}: {
  title: string;
  rows: ExtractionRow[];
  onAccept: (row: ExtractionRow) => void;
  onMarkClient?: (row: ExtractionRow) => void;
  onDismiss: (row: ExtractionRow) => void;
  showClientOption?: boolean;
}) {
  if (rows.length === 0) return null;
  const avgConf = Math.round(
    (rows.reduce((s, r) => s + (r.confidence_score ?? 0), 0) / rows.length) * 100,
  );
  return (
    <div
      className="rounded-lg p-4 mb-6"
      style={{ background: "rgba(255,255,255,0.02)", borderLeft: "2px solid rgba(196,154,43,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" style={{ color: "#C49A2B" }} />
          <span className="text-[12.5px] uppercase tracking-[0.1em] text-white/70">{title}</span>
        </div>
        <span className="text-[11px] text-white/45">avg confidence {avgConf}%</span>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
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
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onAccept(r)}
                  className="px-2 py-1 rounded text-[11.5px] text-white"
                  style={{ border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  Accept as Team-Validated
                </button>
                {showClientOption && onMarkClient && (
                  <button
                    onClick={() => onMarkClient(r)}
                    className="px-2 py-1 rounded text-[11.5px] text-white"
                    style={{ border: "1px solid rgba(196,154,43,0.5)", background: "rgba(196,154,43,0.08)" }}
                  >
                    Mark as Client-Stated
                  </button>
                )}
                <button
                  onClick={() => onDismiss(r)}
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
  );
}

export function Step3Strategy({
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
  const [winThemes, setWinThemes] = useState<OracleTaggedItem[]>(staged.win_themes ?? []);
  const [topRisks, setTopRisks] = useState<OracleTaggedItem[]>(staged.top_risks ?? []);
  const [northStar, setNorthStar] = useState<string>(staged.north_star ?? "");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  // Persist on change
  useEffect(() => {
    saveStaged(missionId, { win_themes: winThemes, top_risks: topRisks, north_star: northStar || null });
  }, [missionId, winThemes, topRisks, northStar]);

  const queryKey = ["mission-iris-extractions", missionId, 3] as const;
  const { data: extractions } = useQuery({
    queryKey,
    queryFn: async (): Promise<ExtractionRow[]> => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("id, extracted_field, extracted_value, source_file_name, confidence_score, confirmed_by_user, overridden_by_user")
        .eq("mission_id", missionId)
        .in("extracted_field", STEP3_FIELDS.map((f) => f.key));
      return (data ?? []) as ExtractionRow[];
    },
  });

  // Trigger background extraction if none exist
  useEffect(() => {
    if (extractions === undefined) return;
    if (extractions.length > 0) return;
    let cancelled = false;
    setAnalyzing(true);
    setAnalyzeMsg("IRIS is reading your documents…");
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setAnalyzing(false);
        setAnalyzeMsg(null);
      }
    }, 30000);
    analyzeFn({
      data: {
        missionId,
        wizardStep: 3,
        fields: STEP3_FIELDS.map((f) => ({ key: f.key, label: f.label, hint: f.hint })),
      },
    })
      .then(() => {
        if (cancelled) return;
        qc.invalidateQueries({ queryKey });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setAnalyzing(false);
          setAnalyzeMsg(null);
          clearTimeout(timeout);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractions === undefined ? "loading" : extractions.length === 0 ? "empty" : "loaded"]);

  const visible = (extractions ?? []).filter(
    (e) => !e.confirmed_by_user && !e.overridden_by_user && e.extracted_value,
  );
  const winThemeSuggestions = visible.filter((e) => e.extracted_field.startsWith("win_theme_"));
  const topRiskSuggestions = visible.filter((e) => e.extracted_field.startsWith("top_risk_"));
  const northStarSuggestion = useMemo(
    () => visible.find((e) => e.extracted_field === "north_star"),
    [visible],
  );

  async function markExtraction(id: string, patch: { confirmed_by_user?: boolean; overridden_by_user?: boolean }) {
    await supabase.from("mission_iris_extractions").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey });
  }

  function acceptAs(row: ExtractionRow, list: OracleTaggedItem[], setList: (n: OracleTaggedItem[]) => void, authority: OracleSignalAuthority) {
    void markExtraction(row.id, { confirmed_by_user: true });
    setList([
      ...list,
      {
        id: uid(),
        text: row.extracted_value ?? "",
        signal_authority: authority,
        rfp_reference: null,
        confidence: Math.round((row.confidence_score ?? 1) * 100),
        status: "confirmed",
      },
    ]);
  }

  const winCount = winThemes.length;
  const riskCount = topRisks.length;
  const canAdvance = winCount >= 2 && riskCount >= 1;

  return (
    <div>
      <WizardStepHeading
        title="Lock in the strategic foundation."
        subtitle="Every win theme and risk carries a Signal Authority. Client-Stated items earn the highest weight in ORACLE."
      />

      {analyzing && analyzeMsg && (
        <div className="mb-4 inline-flex items-center gap-2 text-[12px] text-white/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {analyzeMsg}
        </div>
      )}

      {/* Win Themes */}
      <TaggedListEditor
        title="What wins this pursuit?"
        prompt="Tag each theme by source. Client-Stated themes carry the highest weight in ORACLE."
        items={winThemes}
        onChange={setWinThemes}
        min={2}
        max={5}
        inputPlaceholder="Add a win theme — press Enter to add."
      />
      <IrisSuggestionsPanel
        title="IRIS Suggestions"
        rows={winThemeSuggestions}
        onAccept={(r) => acceptAs(r, winThemes, setWinThemes, "team_validated")}
        onMarkClient={(r) => acceptAs(r, winThemes, setWinThemes, "client_stated")}
        onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
      />

      {/* Top Risks */}
      <TaggedListEditor
        title="What could cost us this pursuit?"
        prompt="Tag each risk by source. Client-Stated risks are surfaced as gates in the brief."
        items={topRisks}
        onChange={setTopRisks}
        min={1}
        max={5}
        inputPlaceholder="Add a top risk — press Enter to add."
      />
      <IrisSuggestionsPanel
        title="IRIS Suggestions"
        rows={topRiskSuggestions}
        onAccept={(r) => acceptAs(r, topRisks, setTopRisks, "team_validated")}
        onMarkClient={(r) => acceptAs(r, topRisks, setTopRisks, "client_stated")}
        onDismiss={(r) => void markExtraction(r.id, { overridden_by_user: true })}
      />

      {/* North Star */}
      <div className="mb-2">
        <h3 className="text-white text-[16px] font-medium">What must be true for us to win?</h3>
        <p className="text-[12.5px] text-white/55 mt-0.5 mb-3">
          Complete this sentence: We win this if we convince the state that…
        </p>
        <div
          className="rounded-lg p-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <textarea
            value={northStar}
            onChange={(e) => setNorthStar(e.target.value.slice(0, 200))}
            placeholder="…we are the only team that can deliver X without disrupting Y."
            rows={3}
            className="w-full text-[13px] px-2 py-2 rounded bg-white/5 border border-white/10 text-white placeholder:text-white/30 resize-none"
          />
          <div className="text-right text-[11px] text-white/40 mt-1">{northStar.length} / 200</div>
        </div>
        {!northStar && northStarSuggestion?.extracted_value && (
          <div className="mt-2 text-[12.5px] text-white/70 flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "#C49A2B" }} />
            <div>
              <span className="text-white/55">IRIS draft ({Math.round((northStarSuggestion.confidence_score ?? 0) * 100)}%):</span>{" "}
              <span className="text-white">{northStarSuggestion.extracted_value}</span>
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => {
                    setNorthStar(northStarSuggestion.extracted_value!.slice(0, 200));
                    void markExtraction(northStarSuggestion.id, { confirmed_by_user: true });
                  }}
                  className="px-2 py-0.5 rounded text-[11.5px]"
                  style={{ border: "1px solid rgba(196,154,43,0.5)", color: "#C49A2B" }}
                >
                  Use this
                </button>
                <button
                  onClick={() => void markExtraction(northStarSuggestion.id, { overridden_by_user: true })}
                  className="px-2 py-0.5 rounded text-[11.5px] text-white/55"
                  style={{ border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <WizardFooter
        step={3}
        onBack={onBack}
        onContinue={onAdvance}
        continueDisabled={!canAdvance}
        continueHint={
          !canAdvance ? "Need 2+ win themes and 1+ risk to continue." : undefined
        }
      />
    </div>
  );
}
