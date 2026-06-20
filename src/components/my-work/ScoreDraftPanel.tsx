/**
 * Score Draft modal. Phase 3 rebuild — centered overlay with Input,
 * Loading, and Results states (Full Score + Quick Check).
 *
 * Used by:
 *   - My Work header
 *   - Mission Command Center header
 *   - My Work right-column Intelligence Panel
 *   - (Future) Work tab question row 3-dot menu
 *
 * Never stores the draft text itself — only the score + gaps land in
 * draft_scores via the server function.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Target,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  scoreDraft,
  type ScoreResult,
  type ScoreGap,
} from "@/lib/v2-home.functions";

const GOLD = "#C49A2B";
const NAVY = "#0D1B3E";
const IRIS_PURPLE = "#A78BFA";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  /** When provided, locks the question — user cannot change it. */
  questionId?: string | null;
  questionNumber?: string | null;
  questionText?: string | null;
  lockQuestion?: boolean;
  /** Pre-loaded result to show directly in Results state (history view). */
  initialResult?: ScoreResult | null;
  /** Pre-loaded question metadata to display alongside initialResult. */
  initialQuestion?: { number?: string | null; text?: string | null } | null;
  /** Optional callback when user clicks "Fix with IRIS". */
  onFixWithIris?: (
    gaps: ScoreGap[],
    draftText: string,
    score: number,
    qLabel: string,
  ) => void;
};

const fullStages = [
  "Reading your draft...",
  "Checking requirements coverage...",
  "Evaluating evidence quality...",
  "Checking win theme alignment...",
  "Reviewing style compliance...",
  "Calculating your score...",
];
const quickStages = ["Reading your draft...", "Checking requirements..."];

function scoreColor(n: number): string {
  if (n >= 90) return GOLD;
  if (n >= 75) return "#7dcf7d";
  if (n >= 60) return "#EF9F27";
  return "#f08080";
}

function impactColor(impact: ScoreGap["impact"]): string {
  return impact === "high" ? "#f08080" : impact === "medium" ? "#EF9F27" : "rgba(255,255,255,0.3)";
}

type MissionQuestionRow = {
  id: string;
  question_number: string | null;
  question_text: string;
  section_id: string | null;
  mission_sections?: { id: string; section_number: string | null; title: string } | null;
};

export function ScoreDraftPanel({
  open,
  onOpenChange,
  missionId,
  questionId: lockedQuestionId,
  questionNumber: lockedNumber,
  questionText: lockedText,
  lockQuestion,
  initialResult,
  initialQuestion,
  onFixWithIris,
}: Props) {
  const [mode, setMode] = useState<"full" | "quick">("full");
  const [draft, setDraft] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    lockedQuestionId ?? null,
  );
  const [contextOpen, setContextOpen] = useState(false);
  const [incWinStrat, setIncWinStrat] = useState(true);
  const [incStyle, setIncStyle] = useState(true);
  const [incEvalPri, setIncEvalPri] = useState(true);

  const [status, setStatus] = useState<"input" | "loading" | "results" | "error">(
    initialResult ? "results" : "input",
  );
  const [stageIdx, setStageIdx] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(initialResult ?? null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Cache by draft+question+mode hash to avoid duplicate scoring of the same content.
  const cacheRef = useRef<Map<string, ScoreResult>>(new Map());

  const score = useServerFn(scoreDraft);

  // Reset when modal closes or when the lockedQuestionId changes
  useEffect(() => {
    if (!open) return;
    setSelectedQuestionId(lockedQuestionId ?? null);
  }, [open, lockedQuestionId]);

  useEffect(() => {
    if (!open) {
      setDraft("");
      setResult(initialResult ?? null);
      setStatus(initialResult ? "results" : "input");
      setErrorMsg(null);
      setStageIdx(0);
    }
  }, [open, initialResult]);

  // Rotating loading messages
  useEffect(() => {
    if (status !== "loading") return;
    const stages = mode === "quick" ? quickStages : fullStages;
    const id = window.setInterval(() => {
      setStageIdx((i) => (i + 1) % stages.length);
    }, 2300);
    return () => window.clearInterval(id);
  }, [status, mode]);

  // Esc to close handled by Dialog. Word count.
  const wordCount = useMemo(
    () => (draft.trim() ? draft.trim().split(/\s+/).filter(Boolean).length : 0),
    [draft],
  );

  // Question dropdown source — only fetched when no question is locked and user hasn't picked one.
  const { data: questionsData } = useQuery({
    queryKey: ["score-draft-mission-questions", missionId],
    queryFn: async (): Promise<MissionQuestionRow[]> => {
      if (!missionId) return [];
      const { data } = await supabase
        .from("mission_questions")
        .select(
          "id, question_number, question_text, section_id, mission_sections!inner(id, section_number, title)",
        )
        .eq("mission_id", missionId)
        .order("question_number", { ascending: true });
      return (data ?? []) as unknown as MissionQuestionRow[];
    },
    enabled: open && !!missionId && !lockQuestion,
    staleTime: 60_000,
  });

  const allQuestions = questionsData ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, { sectionLabel: string; questions: MissionQuestionRow[] }>();
    for (const q of allQuestions) {
      const sec = q.mission_sections;
      const label = sec
        ? `${sec.section_number ? `Sec ${sec.section_number}` : ""} ${sec.title ?? ""}`.trim()
        : "Other";
      const key = sec?.id ?? "other";
      if (!map.has(key)) map.set(key, { sectionLabel: label || "Other", questions: [] });
      map.get(key)!.questions.push(q);
    }
    return Array.from(map.values());
  }, [allQuestions]);

  const activeQuestion = useMemo(() => {
    if (lockedQuestionId) {
      return {
        id: lockedQuestionId,
        number: lockedNumber ?? "",
        text: lockedText ?? "",
      };
    }
    if (initialQuestion && status === "results") {
      return {
        id: selectedQuestionId ?? "",
        number: initialQuestion.number ?? "",
        text: initialQuestion.text ?? "",
      };
    }
    const found = allQuestions.find((q) => q.id === selectedQuestionId);
    if (!found) return null;
    return {
      id: found.id,
      number: found.question_number ?? "",
      text: found.question_text,
    };
  }, [
    lockedQuestionId,
    lockedNumber,
    lockedText,
    initialQuestion,
    status,
    selectedQuestionId,
    allQuestions,
  ]);

  const canScore =
    !!missionId && !!activeQuestion?.id && draft.trim().length >= 20 && status === "input";

  const handleScore = async () => {
    if (!missionId || !activeQuestion?.id) {
      toast.error("Pick a question to score against.");
      return;
    }
    if (draft.trim().length < 20) {
      toast.error("Draft is too short to score (min 20 chars).");
      return;
    }
    const cacheKey = `${activeQuestion.id}|${mode}|${draft.trim()}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResult(cached);
      setStatus("results");
      return;
    }
    setStatus("loading");
    setStageIdx(0);
    setErrorMsg(null);
    try {
      const r = await score({
        data: {
          questionId: activeQuestion.id,
          missionId,
          draftText: draft,
          mode,
          includeWinStrategy: incWinStrat,
          includeStyleGuide: incStyle,
          includeEvaluatorPriorities: incEvalPri,
        },
      });
      cacheRef.current.set(cacheKey, r);
      setResult(r);
      setStatus("results");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "IRIS was unable to score your draft.");
      setStatus("error");
    }
  };

  const handleScoreAgain = () => {
    setResult(null);
    setStatus("input");
    setErrorMsg(null);
  };

  const handleFix = () => {
    if (!result || !onFixWithIris) return;
    onFixWithIris(
      result.gaps,
      draft,
      result.overall,
      activeQuestion ? `${activeQuestion.number} — ${activeQuestion.text.slice(0, 80)}` : "this question",
    );
    onOpenChange(false);
  };

  const handleSave = () => {
    // The server fn already inserts on every successful score; this is a UX confirmation.
    if (result?.saved_id) {
      toast.success("Score saved to your work history");
    } else {
      toast.success("Score recorded");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border-0 overflow-hidden"
        style={{
          maxWidth: 680,
          background: NAVY,
          borderTop: `3px solid ${GOLD}`,
          borderRadius: 12,
          boxShadow: `0 0 0 1px rgba(196,154,43,0.2), 0 20px 60px rgba(0,0,0,0.5)`,
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-white/5">
          <div className="flex items-start gap-3">
            <div
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: 32,
                height: 32,
                background: "rgba(167,139,250,0.15)",
                border: "1px solid rgba(167,139,250,0.3)",
              }}
            >
              <Eye className="h-4 w-4" style={{ color: IRIS_PURPLE }} />
            </div>
            <div>
              <DialogTitle className="text-white text-[20px] font-medium leading-tight">
                {status === "results" ? "Your Score" : "Score My Draft"}
              </DialogTitle>
              {status === "input" && (
                <p className="text-[12px] text-white/55 mt-0.5">
                  Score your draft against the actual RFP criteria.
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-white/40 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "calc(85vh - 80px)" }}>
          {/* INPUT STATE */}
          {status === "input" && (
            <div className="p-6 space-y-5">
              {/* Question selector */}
              <div>
                <label className="block text-[12px] text-white/55 mb-2">Scoring against:</label>
                {lockQuestion && activeQuestion ? (
                  <div
                    className="rounded-md px-3 py-2"
                    style={{
                      background: "rgba(196,154,43,0.1)",
                      border: "1px solid rgba(196,154,43,0.3)",
                      color: GOLD,
                      fontSize: 13,
                    }}
                  >
                    {activeQuestion.number ? `${activeQuestion.number} — ` : ""}
                    {activeQuestion.text.slice(0, 70)}
                    {activeQuestion.text.length > 70 ? "…" : ""}
                  </div>
                ) : (
                  <select
                    value={selectedQuestionId ?? ""}
                    onChange={(e) => setSelectedQuestionId(e.target.value || null)}
                    className="w-full rounded-md px-3 py-2 text-[14px] text-white"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "0.5px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <option value="" className="bg-[#0D1B3E]">
                      Select a question…
                    </option>
                    {grouped.map((g, gi) => (
                      <optgroup key={gi} label={g.sectionLabel} className="bg-[#0D1B3E]">
                        {g.questions.map((q) => (
                          <option key={q.id} value={q.id} className="bg-[#0D1B3E]">
                            {q.question_number ? `${q.question_number} — ` : ""}
                            {q.question_text.slice(0, 80)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>

              {/* Mode selector */}
              <div>
                <div
                  className="inline-flex items-center rounded-md"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    padding: 3,
                  }}
                >
                  {(["full", "quick"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className="rounded transition-colors"
                      style={{
                        background: mode === m ? "rgba(255,255,255,0.1)" : "transparent",
                        color: mode === m ? "white" : "rgba(255,255,255,0.55)",
                        fontSize: 12,
                        padding: "5px 14px",
                        fontWeight: mode === m ? 500 : 400,
                      }}
                    >
                      {m === "full" ? "Full Score" : "Quick Check"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Draft textarea */}
              <div>
                <div className="relative">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Paste your draft response here..."
                    rows={10}
                    className="w-full rounded-lg p-3 text-white text-[14px] resize-y"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "0.5px solid rgba(255,255,255,0.1)",
                      minHeight: 200,
                      maxHeight: 400,
                    }}
                  />
                  <div
                    className="absolute right-3 bottom-2 text-[12px]"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    {wordCount} words
                    {wordCount > 0 ? ` · ~${Math.max(1, Math.round(wordCount / 250))} page${wordCount / 250 >= 2 ? "s" : ""}` : ""}
                  </div>
                </div>
              </div>

              {/* Context toggles */}
              <div>
                <button
                  type="button"
                  onClick={() => setContextOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white/80"
                >
                  {contextOpen ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  Scoring context — optional
                </button>
                {contextOpen && (
                  <div className="mt-3 space-y-2 text-[12px] text-white/70">
                    <Toggle
                      label="Include Win Strategy"
                      sub="Check alignment to Win Themes and North Star."
                      value={incWinStrat}
                      onChange={setIncWinStrat}
                    />
                    <Toggle
                      label="Include Style Guide"
                      sub="Check voice, tone, and sensitivities."
                      value={incStyle}
                      onChange={setIncStyle}
                    />
                    <Toggle
                      label="Include Evaluator Priorities"
                      sub="Check against known stakeholder priorities."
                      value={incEvalPri}
                      onChange={setIncEvalPri}
                    />
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={handleScore}
                  disabled={!canScore}
                  className="w-full rounded-lg transition-opacity disabled:opacity-40"
                  style={{
                    background: GOLD,
                    color: NAVY,
                    height: 48,
                    fontSize: 15,
                    fontWeight: 500,
                  }}
                >
                  {mode === "full" ? "Score This Draft" : "Quick Check"}
                </button>
                <p
                  className="text-center mt-2 text-[12px]"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  IRIS reads your draft against the RFP. Content is never saved.
                </p>
              </div>
            </div>
          )}

          {/* LOADING STATE */}
          {status === "loading" && (
            <div className="px-6 py-16 flex flex-col items-center gap-6">
              <PulsingEye />
              <p className="text-white/75 text-[14px] animate-pulse">
                {(mode === "quick" ? quickStages : fullStages)[stageIdx]}
              </p>
              <div
                className="w-full max-w-[420px] rounded-full overflow-hidden"
                style={{ height: 4, background: "rgba(255,255,255,0.06)" }}
              >
                <div
                  className="rounded-full transition-all duration-[1800ms] ease-out"
                  style={{
                    height: 4,
                    width: `${20 + stageIdx * 12}%`,
                    background: GOLD,
                  }}
                />
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {status === "error" && (
            <div className="p-8 flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-10 w-10" style={{ color: "#EF9F27" }} />
              <div className="text-white text-[14px]">
                IRIS was unable to score your draft.
              </div>
              <div className="text-white/55 text-[12px] max-w-[420px]">
                {errorMsg ?? "You can try again or continue writing."}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    setStatus("input");
                    setErrorMsg(null);
                  }}
                  className="rounded-md px-4 py-2 text-[14px] text-white/70 border border-white/15"
                >
                  Back
                </button>
                <button
                  onClick={handleScore}
                  className="rounded-md px-4 py-2 text-[14px] font-medium"
                  style={{ background: GOLD, color: NAVY }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* RESULTS STATE */}
          {status === "results" && result && (
            <div className="p-6 space-y-5">
              {/* Overall */}
              <div className="text-center py-2">
                <div
                  className="font-medium"
                  style={{ color: scoreColor(result.overall), fontSize: 48, lineHeight: 1 }}
                >
                  {result.overall}{" "}
                  <span className="text-[24px] text-white/40">/ 100</span>
                </div>
                <div
                  className="mt-2"
                  style={{ color: scoreColor(result.overall), fontSize: 14 }}
                >
                  {result.label}
                </div>
                {activeQuestion?.text && (
                  <div className="mt-2 text-[12px] text-white/45">
                    Scored against: {activeQuestion.number}{" "}
                    {activeQuestion.text.slice(0, 60)}
                    {activeQuestion.text.length > 60 ? "…" : ""}
                  </div>
                )}
              </div>

              {result.mode === "quick" ? (
                <QuickResults
                  checklist={result.requirements_checklist ?? []}
                  score={result.breakdown[0]?.score ?? 0}
                  onFullScore={() => {
                    setMode("full");
                    setResult(null);
                    setStatus("input");
                  }}
                />
              ) : (
                <>
                  {/* Breakdown */}
                  <div className="space-y-3">
                    {result.breakdown.map((b) => {
                      const pct = (b.score / b.max) * 100;
                      return (
                        <div key={b.category}>
                          <div className="flex items-center justify-between text-[14px]">
                            <span className="text-white">{b.category}</span>
                            <span className="text-white font-medium tabular-nums">
                              {b.score} / {b.max}
                            </span>
                          </div>
                          <div
                            className="mt-1 rounded-full overflow-hidden"
                            style={{ height: 8, background: "rgba(255,255,255,0.08)" }}
                          >
                            <div
                              className="rounded-full transition-all"
                              style={{
                                height: 8,
                                width: `${pct}%`,
                                background: scoreColor(result.overall),
                              }}
                            />
                          </div>
                          {b.explanation && (
                            <p
                              className="mt-1 text-[12px] italic"
                              style={{ color: "rgba(255,255,255,0.5)" }}
                            >
                              {b.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Gaps */}
                  <div>
                    <h3 className="text-white text-[14px] font-medium mb-2">What to fix</h3>
                    {result.gaps.length === 0 || result.overall >= 85 ? (
                      <div
                        className="rounded-md px-3 py-3 flex items-center gap-2 text-[14px] text-white/80"
                        style={{
                          background: "rgba(125,207,125,0.07)",
                          border: "1px solid rgba(125,207,125,0.2)",
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" style={{ color: "#7dcf7d" }} />
                        No significant gaps found. This is a strong draft.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {result.gaps.map((g, i) => (
                          <div
                            key={i}
                            className="rounded-md px-3 py-2.5"
                            style={{
                              background: "rgba(255,255,255,0.025)",
                              borderLeft: `3px solid ${impactColor(g.impact)}`,
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-white text-[14px] font-medium">
                                {g.description}
                              </div>
                              <span
                                className="shrink-0 rounded"
                                style={{
                                  background: `${impactColor(g.impact)}22`,
                                  color: impactColor(g.impact),
                                  fontSize: 9,
                                  padding: "2px 6px",
                                  fontWeight: 600,
                                }}
                              >
                                {g.impact === "high" ? "High Impact" : g.impact}
                              </span>
                            </div>
                            {g.potential_points > 0 && (
                              <div
                                className="mt-1 text-[12px]"
                                style={{ color: "rgba(255,255,255,0.45)" }}
                              >
                                Fixing this could add ~{g.potential_points} points
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* IRIS Recommendation */}
                  {result.iris_recommendation && (
                    <div
                      className="rounded-md p-3"
                      style={{
                        background: "rgba(196,154,43,0.05)",
                        borderLeft: `3px solid ${GOLD}`,
                      }}
                    >
                      <div
                        className="mb-1"
                        style={{ color: GOLD, fontSize: 10, fontWeight: 600 }}
                      >
                        IRIS recommends
                      </div>
                      <p className="text-white text-[14px] leading-relaxed">
                        {result.iris_recommendation}
                      </p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {onFixWithIris && (
                      <button
                        onClick={handleFix}
                        className="rounded-md px-3 py-2 text-[14px] font-medium"
                        style={{
                          background: "rgba(196,154,43,0.12)",
                          border: "1px solid rgba(196,154,43,0.4)",
                          color: GOLD,
                        }}
                      >
                        Fix with IRIS
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      className="rounded-md px-3 py-2 text-[14px] text-white/70 border border-white/15"
                    >
                      Save Score
                    </button>
                    <button
                      onClick={handleScoreAgain}
                      className="rounded-md px-3 py-2 text-[14px] text-white/70 border border-white/15"
                    >
                      Score Again
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- subcomponents ---------- */

function Toggle({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[#C49A2B]"
      />
      <div>
        <div className="text-white text-[12px]">{label}</div>
        <div className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          {sub}
        </div>
      </div>
    </label>
  );
}

function PulsingEye() {
  return (
    <div className="relative" style={{ width: 64, height: 64 }}>
      <div
        className="absolute inset-0 rounded-full animate-ping"
        style={{ background: "rgba(167,139,250,0.15)" }}
      />
      <div
        className="absolute inset-2 rounded-full flex items-center justify-center"
        style={{
          background: "rgba(167,139,250,0.18)",
          border: "1px solid rgba(167,139,250,0.4)",
        }}
      >
        <Eye className="h-6 w-6" style={{ color: IRIS_PURPLE }} />
      </div>
    </div>
  );
}

function QuickResults({
  checklist,
  score,
  onFullScore,
}: {
  checklist: Array<{ requirement: string; covered: boolean }>;
  score: number;
  onFullScore: () => void;
}) {
  const covered = checklist.filter((c) => c.covered).length;
  const missing = checklist.length - covered;
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-[36px] font-medium text-white">
          {score} <span className="text-[18px] text-white/40">/ 30</span>
        </div>
        <div className="text-[14px] text-white/60 mt-1">
          {missing > 0 ? `${missing} requirement${missing === 1 ? "" : "s"} missing` : "All requirements covered"}
        </div>
      </div>
      <div className="space-y-1.5">
        {checklist.map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-[14px]">
            {c.covered ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#7dcf7d" }} />
            ) : (
              <X className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#f08080" }} />
            )}
            <span className={c.covered ? "text-white/80" : "text-white"}>{c.requirement}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onFullScore}
        className="w-full rounded-md py-2.5 text-[14px] font-medium"
        style={{
          background: "rgba(196,154,43,0.12)",
          border: "1px solid rgba(196,154,43,0.4)",
          color: GOLD,
        }}
      >
        <Target className="h-3.5 w-3.5 inline mr-1.5" />
        Full Score for deeper analysis
      </button>
    </div>
  );
}
