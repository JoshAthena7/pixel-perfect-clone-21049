import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge } from "lucide-react";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CountUp } from "@/components/v2/effects";


type Props = {
  missionId?: string | "all";
  variant?: "header" | "compact";
  className?: string;
};

const FORMULA: { key: keyof Breakdown; label: string; weight: number }[] = [
  // F-7: `escalations` table dropped — real escalations now arrive as critical signals (SOS).
  { key: "criticalSignals", label: "Critical signals (SOS)", weight: 25 },
  { key: "lowScores", label: "Questions below 3.0", weight: 5 },
  { key: "conflicts", label: "Unresolved conflicts", weight: 8 },
  { key: "atRiskAssumptions", label: "Assumptions at risk", weight: 6 },
  { key: "highRisks", label: "High-severity risks", weight: 7 },
];

type Breakdown = {
  escalations: number; // deprecated, always 0 — kept for API back-compat
  criticalSignals: number;
  lowScores: number;
  conflicts: number;
  atRiskAssumptions: number;
  highRisks: number;
};

export function AttentionBadge({ missionId = "all", variant = "header", className = "" }: Props) {
  const attentionFn = useServerFn(irisLeadershipAttention);
  const { data } = useQuery({
    queryKey: ["leadership-attention"],
    queryFn: async () => {
      try {
        return await attentionFn();
      } catch {
        return null;
      }
    },
    refetchInterval: 60_000,
    retry: false,
    throwOnError: false,
  });

  const { score, breakdown, scope } = (() => {
    if (!data) return { score: 0, breakdown: emptyBreakdown(), scope: "All missions" };
    if (missionId === "all") {
      const b = data.missions.reduce<Breakdown>((acc, m) => {
        (Object.keys(acc) as (keyof Breakdown)[]).forEach((k) => (acc[k] += m.breakdown[k]));
        return acc;
      }, emptyBreakdown());
      const s = data.missions.reduce((sum, m) => sum + m.attention_score, 0);
      return { score: s, breakdown: b, scope: `All missions (${data.missions.length})` };
    }
    const m = data.missions.find((m) => m.mission_id === missionId);
    return {
      score: m?.attention_score ?? 0,
      breakdown: m?.breakdown ?? emptyBreakdown(),
      scope: m?.name ?? "Mission",
    };
  })();

  const toneCls =
    score >= 50
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : score >= 20
      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
      : "border-primary/30 bg-primary/5 text-primary";

  const tip = (
    <div className="w-72 space-y-2 text-xs">
      <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
        <span className="font-semibold text-foreground">Leadership Attention</span>
        <span className="tabular-nums text-muted-foreground">{scope}</span>
      </div>
      <div className="space-y-1">
        {FORMULA.map((row) => {
          const count = breakdown[row.key];
          const sub = count * row.weight;
          return (
            <div key={row.key} className="flex items-center justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-foreground">
                {count} × {row.weight}
                <span className="ml-2 text-muted-foreground">= {sub}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-1.5 font-semibold tabular-nums">
        <span>Total score</span>
        <span>{score}</span>
      </div>
      <div className="pt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Thresholds — calm &lt;20 · watch ≥20 · critical ≥50
      </div>
    </div>
  );

  const tone: "alert" | "calm" = score > 0 ? "alert" : "calm";

  const trigger =
    variant === "compact" ? (
      <span
        className={`inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${toneCls} ${className}`}
      >
        <Gauge className="h-3 w-3" /> <CountUp value={score} tone={tone} />
      </span>
    ) : (
      <div
        className={`flex cursor-help items-center gap-3 rounded-[10px] border px-4 py-3 ${toneCls} ${className}`}
      >
        <Gauge className="h-5 w-5" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Leadership Attention</div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            <CountUp value={score} tone={tone} />
          </div>
        </div>
      </div>
    );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          className="border border-border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function emptyBreakdown(): Breakdown {
  return { escalations: 0, criticalSignals: 0, lowScores: 0, conflicts: 0, atRiskAssumptions: 0, highRisks: 0 };
}
