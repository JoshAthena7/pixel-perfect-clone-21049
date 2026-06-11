/**
 * Score Draft slide-up panel. Calls scoreDraft server fn; never persists
 * the draft text itself (we only log a metadata interaction).
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Sparkles, Loader2, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { scoreDraft, type ScoreResult } from "@/lib/v2-home.functions";

const GOLD = "#C9A55C";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
  onFixWithIris: (gaps: ScoreResult["gaps"]) => void;
};

const stages = [
  "IRIS is reading your draft…",
  "Checking requirements coverage…",
  "Evaluating win theme alignment…",
  "Assessing evidence and style…",
];

export function ScoreDraftPanel({
  open,
  onOpenChange,
  missionId,
  questionId,
  questionNumber,
  questionText,
  onFixWithIris,
}: Props) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const score = useServerFn(scoreDraft);

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  const reset = () => {
    setDraft("");
    setResult(null);
    setStage(0);
  };

  const runScore = async () => {
    if (!questionId || !missionId) {
      toast.error("Pick a question from your assignments first.");
      return;
    }
    if (draft.trim().length < 20) {
      toast.error("Draft is too short to score (min 20 chars).");
      return;
    }
    setLoading(true);
    setResult(null);
    const interval = window.setInterval(() => {
      setStage((s) => (s + 1) % stages.length);
    }, 1800);
    try {
      const r = await score({ data: { questionId, missionId, draftText: draft } });
      setResult(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scoring failed.");
    } finally {
      window.clearInterval(interval);
      setLoading(false);
    }
  };

  const scoreColor = (n: number) =>
    n >= 90 ? GOLD : n >= 75 ? "#7dcf7d" : n >= 60 ? "#f0b440" : "#f08080";

  const copyReport = async () => {
    if (!result) return;
    const text = `Score: ${result.overall}/100 — ${result.label}\n\n${result.breakdown
      .map((b) => `${b.category}: ${b.score}/${b.max}`)
      .join("\n")}\n\nGaps:\n${result.gaps
      .map((g) => `• [${g.severity.toUpperCase()}] ${g.description}\n  Fix: ${g.fix}`)
      .join("\n")}`;
    await navigator.clipboard.writeText(text);
    toast.success("Score report copied.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl p-0 gap-0 border-0"
        style={{ background: "#070f1c", borderTop: `2px solid ${GOLD}` }}
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-white/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-white text-base font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
                Score My Draft
              </DialogTitle>
              <p className="text-[13px] text-white/55 mt-1">
                Paste your draft. IRIS scores it against the actual RFP criteria.
              </p>
              {questionId ? (
                <p className="text-[12px] mt-2" style={{ color: GOLD }}>
                  Scoring against: {questionNumber ?? "?"} — {(questionText ?? "").slice(0, 80)}
                  {(questionText ?? "").length > 80 ? "…" : ""}
                </p>
              ) : (
                <p className="text-[12px] mt-2 text-amber-400">
                  No question selected — pick one from your assignments first.
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {!result && !loading && (
            <div className="space-y-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste your draft here..."
                rows={10}
                className="bg-white/5 border-white/10 text-white resize-none"
              />
              <div className="flex items-center justify-between text-[11px] text-white/40">
                <span>
                  {wordCount} words · {draft.length} chars
                </span>
                <span>Nothing is saved. Content stays in this session.</span>
              </div>
              <Button
                onClick={runScore}
                disabled={!questionId || draft.trim().length < 20}
                className="w-full font-medium"
                style={{ background: GOLD, color: "#070f1c" }}
              >
                Score This Draft
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: GOLD }} />
              <p className="text-white/70 text-sm animate-pulse">{stages[stage]}</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-5">
              <div className="text-center py-2">
                <div
                  className="text-5xl font-medium"
                  style={{ color: scoreColor(result.overall) }}
                >
                  {result.overall}{" "}
                  <span className="text-2xl text-white/40">/ 100</span>
                </div>
                <p className="text-white/70 text-sm mt-1">{result.label}</p>
              </div>

              <div className="space-y-2">
                {result.breakdown.map((b) => {
                  const pct = (b.score / b.max) * 100;
                  return (
                    <div key={b.category} className="space-y-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-white/80">{b.category}</span>
                        <span className="text-white/60 tabular-nums">
                          {b.score} / {b.max}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: scoreColor(result.overall),
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {result.gaps.length > 0 && (
                <div className="space-y-2 border-t border-white/5 pt-4">
                  <h4 className="text-[13px] text-white font-medium">
                    Specific gaps to fix
                  </h4>
                  {result.gaps.map((g, i) => (
                    <div key={i} className="flex gap-3">
                      <div
                        className="h-2 w-2 rounded-full mt-1.5 shrink-0"
                        style={{
                          background:
                            g.severity === "high" ? "#f08080" : "#f0b440",
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] text-white">{g.description}</p>
                        <p className="text-[12px] text-white/55 italic">
                          {g.fix}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onFixWithIris(result.gaps)}
                  style={{
                    borderColor: "rgba(127,119,221,0.3)",
                    color: "rgba(200,195,255,0.9)",
                    background: "rgba(127,119,221,0.12)",
                  }}
                >
                  Fix with IRIS
                </Button>
                <Button variant="outline" size="sm" onClick={reset}>
                  Score Again
                </Button>
                <Button variant="outline" size="sm" onClick={copyReport}>
                  <Copy className="h-3 w-3 mr-1.5" /> Copy Score Report
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
