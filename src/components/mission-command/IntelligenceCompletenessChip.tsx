/**
 * Intelligence Completeness indicator. Subscribes to the mission row so the
 * value updates in real time as the graph fills out.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  missionId: string;
  initial?: number | null;
  compact?: boolean; // small chip variant for mission cards
};

export function IntelligenceCompletenessChip({ missionId, initial = null, compact = false }: Props) {
  const navigate = useNavigate();
  const [pct, setPct] = useState<number | null>(initial);

  useEffect(() => {
    let cancelled = false;
    if (initial == null) {
      (async () => {
        const { data } = await supabase
          .from("missions")
          .select("intelligence_graph_completeness")
          .eq("id", missionId)
          .maybeSingle();
        if (cancelled) return;
        const v = (data as { intelligence_graph_completeness: number | null } | null)?.intelligence_graph_completeness;
        if (typeof v === "number") setPct(v);
      })();
    }
    const channel = supabase
      .channel(`mission-intel-${missionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "missions", filter: `id=eq.${missionId}` }, (payload) => {
        const v = (payload.new as { intelligence_graph_completeness?: number | null }).intelligence_graph_completeness;
        if (typeof v === "number") setPct(v);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [missionId, initial]);

  if (pct == null) return null;

  const tone = pct >= 90 ? "gold" : pct >= 70 ? "green" : pct >= 40 ? "amber" : "red";
  const cls = {
    red: "text-red-400 border-red-500/40 bg-red-500/10",
    amber: "text-amber-400 border-amber-500/40 bg-amber-500/10",
    green: "text-green-400 border-green-500/40 bg-green-500/10",
    gold: "text-[var(--athena-gold)] border-[var(--athena-gold)]/40 bg-[var(--athena-gold)]/10",
  }[tone];

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate({ to: "/olympus/missions/$missionId", params: { missionId }, search: { tab: "oracle" } as never });
  };

  return (
    <button
      onClick={handleClick}
      title="Mission Intelligence Graph completeness. Click to view the Oracle."
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium transition-colors hover:brightness-110",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        cls,
      )}
    >
      {tone === "red" && <AlertTriangle className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      <span>Intel: {pct}%</span>
      {tone === "gold" && <Sparkles className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />}
    </button>
  );
}
