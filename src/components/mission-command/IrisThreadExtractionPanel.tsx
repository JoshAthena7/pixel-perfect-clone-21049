import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { batchExtractMissionThreads } from "@/lib/iris-extract-thread-intelligence.functions";
import { batchExtractMissionScoreGaps } from "@/lib/iris-score-gap-analysis.functions";

/**
 * Admin/lead-only panel that runs IRIS thread intelligence extraction across
 * every unprocessed question in the mission. Surfaces signals captured to
 * the global IRIS Memory (insights + signals tables).
 */
export function IrisThreadExtractionPanel({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const batch = useServerFn(batchExtractMissionThreads);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    total_questions: number;
    processed: number;
    signals_extracted: number;
    errors: string[];
  } | null>(null);

  const counts = useQuery({
    queryKey: ["thread-extraction-counts", missionId],
    queryFn: async () => {
      const [pending, done] = await Promise.all([
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .eq("is_withdrawn", false)
          .eq("iris_extracted", false),
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .eq("iris_extracted", true),
      ]);
      return { pending: pending.count ?? 0, done: done.count ?? 0 };
    },
  });

  const pendingLabel = useMemo(() => {
    const p = counts.data?.pending ?? 0;
    const d = counts.data?.done ?? 0;
    return `${p} thread${p === 1 ? "" : "s"} pending · ${d} already analyzed`;
  }, [counts.data]);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await batch({ data: { mission_id: missionId } });
      setResult(res);
      toast.success(
        `IRIS captured ${res.signals_extracted} signal${
          res.signals_extracted === 1 ? "" : "s"
        } across ${res.processed} thread${res.processed === 1 ? "" : "s"}.`,
      );
      await qc.invalidateQueries({ queryKey: ["thread-extraction-counts", missionId] });
      await qc.invalidateQueries({ queryKey: ["mission-insights", missionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="rounded-md p-4"
      style={{
        background: "rgba(196,154,43,0.04)",
        border: "1px solid rgba(196,154,43,0.18)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Zap className="h-4 w-4 mt-0.5" style={{ color: "#C49A2B" }} />
          <div>
            <div className="text-sm text-white">IRIS Thread Intelligence</div>
            <div className="text-xs text-white/55 mt-0.5">
              Scan question threads for proposal intelligence and add captured signals to
              IRIS Memory so future missions can benefit.
            </div>
            <div className="text-[11px] text-white/45 mt-1.5">{pendingLabel}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || (counts.data?.pending ?? 0) === 0}
          className="inline-flex items-center gap-2 rounded border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5 disabled:opacity-50 whitespace-nowrap"
        >
          {running ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Analyzing threads…
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" /> Extract Intelligence from All Threads
            </>
          )}
        </button>
      </div>
      {result && (
        <div className="mt-3 text-xs text-white/70 space-y-1 border-t border-white/5 pt-3">
          <div>
            <span className="text-white">{result.signals_extracted}</span> intelligence signal
            {result.signals_extracted === 1 ? "" : "s"} added to IRIS Memory across{" "}
            <span className="text-white">{result.processed}</span> of {result.total_questions} thread
            {result.total_questions === 1 ? "" : "s"}.
          </div>
          {result.errors.length > 0 && (
            <ul className="text-amber-400/80 text-[11px] list-disc pl-4">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && (
        <div className="mt-3 text-xs text-white/70 space-y-1 border-t border-white/5 pt-3">
          <div>
            <span className="text-white">{result.signals_extracted}</span> intelligence signal
            {result.signals_extracted === 1 ? "" : "s"} added to IRIS Memory across{" "}
            <span className="text-white">{result.processed}</span> of {result.total_questions} thread
            {result.total_questions === 1 ? "" : "s"}.
          </div>
          {result.errors.length > 0 && (
            <ul className="text-amber-400/80 text-[11px] list-disc pl-4">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ScoreGapsSection missionId={missionId} />
    </div>
  );
}

function ScoreGapsSection({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const batch = useServerFn(batchExtractMissionScoreGaps);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    total_questions: number;
    processed: number;
    gaps_written: number;
    errors: string[];
  } | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await batch({ data: { mission_id: missionId } });
      setResult(res);
      toast.success(
        `IRIS logged ${res.gaps_written} gap${res.gaps_written === 1 ? "" : "s"} across ${res.processed} scored question${res.processed === 1 ? "" : "s"}.`,
      );
      await qc.invalidateQueries({ queryKey: ["mission-insights", missionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Score-gap extraction failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Zap className="h-4 w-4 mt-0.5" style={{ color: "#C49A2B" }} />
          <div>
            <div className="text-sm text-white">Re-Score All Answered Questions</div>
            <div className="text-xs text-white/55 mt-0.5">
              Replay every Score Me result for this mission and log gaps, weak dimensions,
              and low-score risks back into IRIS Memory.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5 disabled:opacity-50 whitespace-nowrap"
        >
          {running ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Extracting gaps…
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" /> Extract Gaps from Scores
            </>
          )}
        </button>
      </div>
      {result && (
        <div className="mt-3 text-xs text-white/70 space-y-1">
          <div>
            <span className="text-white">{result.gaps_written}</span> gap
            {result.gaps_written === 1 ? "" : "s"} captured across{" "}
            <span className="text-white">{result.processed}</span> of {result.total_questions} scored question
            {result.total_questions === 1 ? "" : "s"}.
          </div>
          {result.errors.length > 0 && (
            <ul className="text-amber-400/80 text-[11px] list-disc pl-4">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
