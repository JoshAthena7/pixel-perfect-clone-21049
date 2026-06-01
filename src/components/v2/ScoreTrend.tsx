import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shows a small ↑/↓ delta indicator for a question's score trend.
 * Compares the two most recent entries in question_scores.
 */
export function ScoreTrend({ questionId, className = "" }: { questionId: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ["score-trend", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_scores")
        .select("score,scored_at")
        .eq("question_id", questionId)
        .order("scored_at", { ascending: false })
        .limit(2);
      return (data ?? []) as { score: number; scored_at: string }[];
    },
  });

  if (!data || data.length < 2) return null;
  const delta = Number(data[0].score) - Number(data[1].score);
  if (Math.abs(delta) < 0.05) return null;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${up ? "text-green" : "text-red"} ${className}`}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}
