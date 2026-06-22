import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { Eye, X, RefreshCcw, MessageSquare, Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  scoreMeCoach,
  postScoreMeToThread,
  type ScoreMeResult,
} from "@/lib/score-me-coach.functions";
import { prefetchScoreMeContext } from "@/lib/score-me-prefetch.functions";
import { irisScoreGapAnalysis } from "@/lib/iris-score-gap-analysis.functions";
import { irisEvaluatorPreview, type EvaluatorPreviewResult } from "@/lib/iris-evaluator-preview.functions";
import { runAssistTool } from "@/lib/atlas-assist.functions";
import { supabase } from "@/integrations/supabase/client";
import { triggerIrisBolt } from "@/lib/iris-bolt";


type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
};

const GOLD = "#C49A2B";
const IRIS_PURPLE = "#b7afff";

function scoreColor(n: number): string {
  if (n >= 8) return "#6fcf97";
  if (n >= 5) return "#EF9F27";
  return "#f08080";
}

export function ScoreMeDialog({
  open,
  onOpenChange,
  missionId,
  questionId,
  questionNumber,
  questionText,
}: Props) {
  const run = useServerFn(scoreMeCoach);
  const post = useServerFn(postScoreMeToThread);
  const prefetch = useServerFn(prefetchScoreMeContext);
  const gapAnalysis = useServerFn(irisScoreGapAnalysis);
  const evaluatorRun = useServerFn(irisEvaluatorPreview);
  const assistRun = useServerFn(runAssistTool);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreMeResult | null>(null);
  const [evaluator, setEvaluator] = useState<EvaluatorPreviewResult | null>(null);
  const [evaluatorLoading, setEvaluatorLoading] = useState(false);
  const [history, setHistory] = useState<{ score: number; created_at: string }[]>([]);
  const [posting, setPosting] = useState(false);
  const [contextStatus, setContextStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [stuckMode, setStuckMode] = useState(false);
  const [stuckPrompt, setStuckPrompt] = useState("");
  const [stuckLoading, setStuckLoading] = useState(false);
  const [stuckOpener, setStuckOpener] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<{
    items: { text: string; critical?: boolean }[];
    planned: number[];
  } | null>(null);
  // Scan-line pass counter — re-mounts the scan element so the CSS animation restarts.
  const [scanPass, setScanPass] = useState(0);
  useEffect(() => {
    if (!loading) {
      setScanPass(0);
      return;
    }
    setScanPass(1);
    const id = window.setInterval(() => setScanPass((p) => p + 1), 3000);
    return () => window.clearInterval(id);
  }, [loading]);

  // DevTools: atlas-dev-scan event — kick the scan animation without
  // needing a real scoreMeCoach call. Runs the scan-line for ~3.5s.
  useEffect(() => {
    const handler = () => {
      setScanPass((p) => p + 1);
      let pass = 1;
      const id = window.setInterval(() => {
        pass += 1;
        setScanPass(pass);
        if (pass >= 2) window.clearInterval(id);
      }, 1500);
      window.setTimeout(() => window.clearInterval(id), 4000);
    };
    window.addEventListener("atlas-dev-scan", handler);
    return () => window.removeEventListener("atlas-dev-scan", handler);
  }, []);

  // DevTools: atlas_dev_modal_state="results" — when the panel opens Score Me,
  // pre-populate a sample result so admins can preview the rubric UI.
  useEffect(() => {
    if (!open) return;
    let state: string | null = null;
    try { state = sessionStorage.getItem("atlas_dev_modal_state"); } catch {}
    if (state !== "results") return;
    setDraft(
      "PerformCare will develop a process within the Call Center to identify Youth involved with DCP&P and refer calls to appropriate staff. We will obtain CSOC approval prior to implementation and maintain documentation of all referrals.",
    );
    setResult({
      overall_score: 7,
      iris_verdict:
        "Solid draft with a clear process — strengthen the measurable outcomes and explicit DCP&P coordination.",
      what_lands: [
        "Direct response to the question prompt.",
        "Names the CSOC approval gate.",
        "Reads in a recognizable PerformCare voice.",
      ],
      what_needs_work: [
        "No measurable volume or cycle-time target.",
        "DCP&P liaison role is unnamed.",
        "Escalation SLA is implicit, not stated.",
      ],
      the_one_fix:
        "Name the DCP&P liaison role and add a measurable referral SLA (e.g. 'within 1 business day').",
      opportunities: [
        "Cite the latest NJ DCF guidance for credibility.",
        "Tie the process to the YouthLink case rate.",
      ],
      compliance_flags: [],
    } as ScoreMeResult);
    try { sessionStorage.removeItem("atlas_dev_modal_state"); } catch {}
  }, [open]);


  useEffect(() => {
    if (!open) {
      setDraft("");
      setResult(null);
      setEvaluator(null);
      setEvaluatorLoading(false);
      setHistory([]);
      setLoading(false);
      setPosting(false);
      setContextStatus("idle");
      setStuckMode(false);
      setStuckPrompt("");
      setStuckLoading(false);
      setStuckOpener(null);
      setChecklist(null);
      return;
    }
    if (!missionId || !questionId) return;
    let cancelled = false;
    setContextStatus("loading");
    prefetch({ data: { missionId, questionId } })
      .then(() => { if (!cancelled) setContextStatus("ready"); })
      .catch(() => { if (!cancelled) setContextStatus("error"); });

    // Load IRIS Score Predictor checklist + writer's planned indices
    (async () => {
      try {
        const [{ data: q }, { data: me }] = await Promise.all([
          supabase.from("mission_questions").select("iris_brief").eq("id", questionId).maybeSingle(),
          supabase.auth.getUser(),
        ]);
        const briefItems = (q as any)?.iris_brief?.score_predictor?.items;
        const predictorItems: { text: string; critical?: boolean }[] | null = Array.isArray(briefItems)
          ? briefItems
          : null;
        let planned: number[] = [];
        if (me?.user) {
          const { data: progress } = await supabase
            .from("question_progress")
            .select("metadata")
            .eq("question_id", questionId)
            .eq("assignee_id", me.user.id)
            .maybeSingle();
          const arr = (progress as any)?.metadata?.iris_checklist_state?.checked;
          if (Array.isArray(arr)) planned = arr.filter((n: any) => Number.isInteger(n));
        }
        if (!cancelled && predictorItems) {
          setChecklist({ items: predictorItems, planned });
        }
      } catch { /* non-blocking */ }
    })();

    // Load prior Score Me history for this question (current user).
    (async () => {
      try {
        const { data: rows } = await supabase
          .from("score_me_history")
          .select("score, created_at")
          .eq("mission_id", missionId)
          .eq("question_id", questionId)
          .order("created_at", { ascending: true })
          .limit(10);
        if (!cancelled && Array.isArray(rows)) {
          setHistory(rows.map((r: any) => ({ score: Number(r.score), created_at: String(r.created_at) })));
        }
      } catch { /* non-blocking */ }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, missionId, questionId]);

  const charCount = draft.length;
  const canScore = useMemo(
    () => !!missionId && !!questionId && draft.trim().length >= 20 && !loading,
    [missionId, questionId, draft, loading],
  );

  const handleScore = async () => {
    if (!missionId || !questionId) {
      toast.error("Open Score Me from a question to coach against its context.");
      return;
    }
    if (draft.trim().length < 20) {
      toast.error("Paste at least 20 characters to coach.");
      return;
    }
    setLoading(true);
    try {
      const r = await run({
        data: {
          missionId,
          questionId,
          draftText: draft,
          irisChecklist: checklist
            ? { items: checklist.items, planned_indices: checklist.planned }
            : undefined,
        },
      });
      setResult(r.result);
      triggerIrisBolt("score");
      // Fire-and-forget: feed gaps into IRIS Memory.

      void gapAnalysis({
        data: {
          mission_id: missionId,
          question_id: questionId,
          question_text: questionText ?? undefined,
          answer_text: draft,
          score_result: {
            overall_score: r.result.overall_score,
            feedback: r.result.iris_verdict,
            gaps: [...r.result.what_needs_work, ...r.result.compliance_flags, r.result.the_one_fix].filter(Boolean),
            strengths: r.result.what_lands,
          },
        },
      })
        .then((res) => {
          if (res && (res as { gaps_written?: number }).gaps_written) {
            toast(`IRIS logged ${(res as { gaps_written: number }).gaps_written} gap${(res as { gaps_written: number }).gaps_written === 1 ? "" : "s"} from this scoring.`);
          }
        })
        .catch((err) => console.error("[iris-score-gap] background extract failed", err));
    } catch (e: any) {
      toast.error("Coaching failed", { description: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  };

  const handleAgain = () => setResult(null);

  const handleGetOpening = async () => {
    if (!missionId || !questionId) {
      toast.error("Open Score Me from a question first.");
      return;
    }
    setStuckLoading(true);
    setStuckOpener(null);
    try {
      const { text } = await assistRun({
        data: {
          missionId,
          questionId,
          tool: "win_angle",
          mode: "initial",
          priorResponse: stuckPrompt.trim() || undefined,
        },
      });
      setStuckOpener(text);
    } catch (e: any) {
      toast.error("IRIS couldn't generate an opening", { description: e?.message ?? String(e) });
    } finally {
      setStuckLoading(false);
    }
  };


  const handleAddToThread = async () => {
    if (!missionId || !questionId || !result) return;
    setPosting(true);
    try {
      await post({
        data: {
          missionId,
          questionId,
          questionNumber: questionNumber ?? undefined,
          overallScore: result.overall_score,
          theOneFix: result.the_one_fix,
        },
      });
      toast.success("Posted to Notes");
    } catch (e: any) {
      toast.error("Could not post to Notes", { description: e?.message ?? String(e) });
    } finally {
      setPosting(false);
    }
  };

  const headerSub = useMemo(() => {
    if (!questionText) return "Coaching against this mission's context.";
    const num = questionNumber ? `${questionNumber} — ` : "";
    return `${num}${questionText.slice(0, 100)}${questionText.length > 100 ? "…" : ""}`;
  }, [questionNumber, questionText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl p-0 gap-0 border-0 overflow-hidden [&>button]:hidden"
        style={{ background: "#0a1320", color: "rgba(255,255,255,0.9)" }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 border-b"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div>
            <div className="text-white" style={{ fontSize: 14, fontWeight: 500 }}>
              Score Me
            </div>
            <div className="mt-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              {headerSub}
            </div>
            {contextStatus !== "idle" && (
              <div
                className="mt-1.5 inline-flex items-center gap-1.5"
                style={{ fontSize: 10, color: contextStatus === "ready" ? "#6fcf97" : contextStatus === "error" ? "#f08080" : "rgba(200,195,255,0.75)" }}
              >
                <span
                  style={{
                    width: 6, height: 6, borderRadius: 999,
                    background: contextStatus === "ready" ? "#6fcf97" : contextStatus === "error" ? "#f08080" : "#b7afff",
                    animation: contextStatus === "loading" ? "pulse 1.4s ease-in-out infinite" : undefined,
                  }}
                />
                {contextStatus === "loading" && "Loading mission context from IRIS..."}
                {contextStatus === "ready" && "Ready to coach"}
                {contextStatus === "error" && "Context unavailable — coaching will run anyway"}
              </div>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-white/40 hover:text-white/80"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[75vh] overflow-y-auto">
          {checklist && !result && (
            <div
              className="rounded-md px-3 py-2"
              style={{
                background: "rgba(196,154,43,0.06)",
                border: "1px solid rgba(196,154,43,0.25)",
                fontSize: 11,
                color: "rgba(255,255,255,0.75)",
              }}
            >
              <span style={{ color: GOLD, fontWeight: 600 }}>You planned for {checklist.planned.length} of {checklist.items.length} IRIS checklist items.</span>{" "}
              IRIS will check if your draft delivers on them.
            </div>
          )}
          {/* IRIS intro */}
          <div
            className="rounded-lg px-3 py-2"
            style={{
              background: "rgba(127,119,221,0.10)",
              border: "1px solid rgba(127,119,221,0.25)",
              color: "rgba(210,205,255,0.92)",
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            <span style={{ color: IRIS_PURPLE, fontWeight: 600 }}>IRIS · </span>
            Paste your draft from the client environment. I am not checking grammar. I am checking
            whether a risk-averse career program manager — under political pressure, reading this in
            ninety seconds — would feel confident enough to recommend an award. That is a different
            bar than writing well. It is a higher one. I have seen worse. I have also seen better.
            Paste it in.
          </div>

          {!result && !stuckMode && (
            <>
              <div className="relative overflow-hidden rounded-lg">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Paste your draft from Word, SharePoint, Loopio, or wherever you are working..."
                  disabled={loading}
                  className={`w-full rounded-lg p-3 text-white text-[14px] resize-y outline-none ${loading ? "iris-textarea-reading" : ""}`}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    minHeight: 220,
                  }}
                />
                {loading && scanPass > 0 && (
                  <div
                    key={scanPass}
                    className={`iris-scan-line ${scanPass > 1 ? "pass-2" : ""}`}
                    aria-hidden
                  />
                )}
                <div
                  className="absolute right-3 bottom-2"
                  style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}
                >
                  {charCount} chars
                </div>
              </div>


              <div className="text-center" style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                Not sure where to start?{" "}
                <button
                  type="button"
                  onClick={() => setStuckMode(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: IRIS_PURPLE,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 12,
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Let IRIS give you a first sentence →
                </button>
              </div>

              <button
                onClick={handleScore}
                disabled={!canScore}
                className="w-full rounded-lg transition-opacity disabled:opacity-40"
                style={{
                  background: GOLD,
                  color: "#0a1320",
                  height: 44,
                  fontSize: 14,
                  fontWeight: 600,
                  animation: loading ? "pulse 1.4s ease-in-out infinite" : undefined,
                }}
              >
                {loading ? "IRIS is coaching your draft…" : "Score My Draft"}
              </button>
            </>
          )}

          {!result && stuckMode && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => { setStuckMode(false); setStuckOpener(null); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "rgba(255,255,255,0.55)", fontSize: 11,
                  display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
                }}
              >
                <ArrowLeft size={12} /> Back to paste your draft
              </button>

              <div
                className="rounded-lg px-3 py-2"
                style={{
                  background: "rgba(127,119,221,0.10)",
                  border: "1px solid rgba(127,119,221,0.25)",
                  color: "rgba(210,205,255,0.92)",
                  fontSize: 12,
                  lineHeight: 1.55,
                }}
              >
                <span style={{ color: IRIS_PURPLE, fontWeight: 600 }}>IRIS · </span>
                Tell me what this question is asking you to prove. IRIS will give you an opening.
              </div>

              <textarea
                value={stuckPrompt}
                onChange={(e) => setStuckPrompt(e.target.value)}
                placeholder="In your own words: what is this question really asking?"
                disabled={stuckLoading}
                className="w-full rounded-lg p-3 text-white text-[14px] resize-y outline-none"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  minHeight: 100,
                }}
              />

              <button
                onClick={handleGetOpening}
                disabled={stuckLoading}
                className="w-full rounded-lg transition-opacity disabled:opacity-40"
                style={{
                  background: IRIS_PURPLE,
                  color: "#0a1320",
                  height: 40,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Sparkles size={14} style={{ display: "inline", marginRight: 6, marginTop: -2 }} />
                {stuckLoading ? "IRIS is thinking…" : "Get my opening"}
              </button>

              {stuckOpener && (
                <div
                  className="rounded-lg px-3 py-3"
                  style={{
                    background: "rgba(196,154,43,0.08)",
                    border: `1px solid ${GOLD}`,
                  }}
                >
                  <div style={{ fontSize: 9, color: GOLD, textTransform: "", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 6 }}>
                    IRIS · YOUR OPENING
                  </div>
                  <div className="whitespace-pre-wrap text-white" style={{ fontSize: 13, lineHeight: 1.6 }}>
                    {stuckOpener}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(stuckOpener).catch(() => {});
                        toast.success("Copied to clipboard");
                      }}
                      style={{ height: 28, fontSize: 11 }}
                    >
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDraft((d) => (d ? `${stuckOpener}\n\n${d}` : stuckOpener));
                        setStuckMode(false);
                      }}
                      style={{ height: 28, fontSize: 11 }}
                    >
                      Use as my draft start
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}


          {result && (
            <div className="space-y-3">
              {/* Score */}
              <div className="flex items-end gap-3">
                <div
                  style={{
                    fontSize: 56,
                    lineHeight: 1,
                    fontWeight: 700,
                    color: scoreColor(result.overall_score),
                  }}
                >
                  {result.overall_score}
                  <span style={{ fontSize: 22, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
                    /10
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.45)",
                    textTransform: "",
                    letterSpacing: "0.08em",
                    paddingBottom: 6,
                  }}
                >
                  coaching score
                </div>
              </div>

              {/* IRIS verdict */}
              <div
                className="rounded-lg px-3 py-3 flex items-start gap-2"
                style={{
                  background: "rgba(127,119,221,0.10)",
                  border: "1px solid rgba(127,119,221,0.28)",
                }}
              >
                <Eye size={14} style={{ color: IRIS_PURPLE, marginTop: 2 }} />
                <div
                  className="italic text-white"
                  style={{ fontSize: 13, lineHeight: 1.55 }}
                >
                  {result.iris_verdict}
                </div>
              </div>

              {/* What lands */}
              {result.what_lands.length > 0 && (
                <ResultCard
                  bg="rgba(111,207,151,0.08)"
                  border="rgba(111,207,151,0.28)"
                  label="WHAT LANDS"
                  labelColor="#6fcf97"
                  items={result.what_lands}
                  dotColor="#6fcf97"
                />
              )}

              {/* What needs work */}
              {result.what_needs_work.length > 0 && (
                <ResultCard
                  bg="rgba(239,159,39,0.08)"
                  border="rgba(239,159,39,0.28)"
                  label="WHAT NEEDS WORK"
                  labelColor="#EF9F27"
                  items={result.what_needs_work}
                  dotColor="#EF9F27"
                />
              )}

              {/* The one fix */}
              <div
                className="rounded-lg px-3 py-3"
                style={{
                  background: "rgba(196,154,43,0.10)",
                  border: `1px solid ${GOLD}`,
                  boxShadow: `0 0 0 1px rgba(196,154,43,0.15)`,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: GOLD,
                    textTransform: "",
                    letterSpacing: "0.12em",
                    fontWeight: 700,
                  }}
                >
                  THE ONE FIX
                </div>
                <div className="text-white mt-1" style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.5 }}>
                  {result.the_one_fix}
                </div>
              </div>

              {/* Opportunities */}
              {result.opportunities.length > 0 && (
                <ResultCard
                  bg="rgba(255,255,255,0.03)"
                  border="rgba(255,255,255,0.08)"
                  label="OPPORTUNITIES"
                  labelColor="rgba(255,255,255,0.55)"
                  items={result.opportunities}
                  dotColor="rgba(255,255,255,0.4)"
                />
              )}

              {/* Compliance flags */}
              {result.compliance_flags.length > 0 && (
                <ResultCard
                  bg="rgba(240,128,128,0.08)"
                  border="rgba(240,128,128,0.3)"
                  label="COMPLIANCE GAPS"
                  labelColor="#f08080"
                  items={result.compliance_flags}
                  dotColor="#f08080"
                />
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAgain}
                  style={{ height: 28, fontSize: 11 }}
                >
                  <RefreshCcw size={12} className="mr-1" />
                  Score again
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddToThread}
                  disabled={posting || !questionId}
                  style={{ height: 28, fontSize: 11 }}
                >
                  <MessageSquare size={12} className="mr-1" />
                  {posting ? "Adding…" : "Add to Notes"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultCard({
  bg,
  border,
  label,
  labelColor,
  items,
  dotColor,
}: {
  bg: string;
  border: string;
  label: string;
  labelColor: string;
  items: string[];
  dotColor: string;
}) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: bg, border: `1px solid ${border}` }}>
      <div
        style={{
          fontSize: 9,
          color: labelColor,
          textTransform: "",
          letterSpacing: "0.12em",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div className="mt-1.5 space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2" style={{ fontSize: 12, lineHeight: 1.5 }}>
            <span
              className="shrink-0 rounded-full"
              style={{ width: 5, height: 5, marginTop: 6, background: dotColor }}
            />
            <span className="text-white/85">{it}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
