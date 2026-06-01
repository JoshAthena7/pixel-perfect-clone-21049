import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge } from "lucide-react";
import { irisLeadershipAttention } from "@/lib/iris.functions";

type Props = {
  missionId?: string | "all";
  variant?: "header" | "compact";
  className?: string;
};

export function AttentionBadge({ missionId = "all", variant = "header", className = "" }: Props) {
  const attentionFn = useServerFn(irisLeadershipAttention);
  const { data } = useQuery({
    queryKey: ["leadership-attention"],
    queryFn: () => attentionFn(),
    refetchInterval: 60_000,
  });

  const score = !data
    ? 0
    : missionId === "all"
    ? data.missions.reduce((sum, m) => sum + m.attention_score, 0)
    : data.missions.find((m) => m.mission_id === missionId)?.attention_score ?? 0;

  const tone =
    score >= 50
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : score >= 20
      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
      : "border-primary/30 bg-primary/5 text-primary";

  if (variant === "compact") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${tone} ${className}`}
        title={`Leadership Attention Score: ${score}`}
      >
        <Gauge className="h-3 w-3" /> {score}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-[10px] border px-4 py-3 ${tone} ${className}`}>
      <Gauge className="h-5 w-5" />
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Leadership Attention</div>
        <div className="text-2xl font-semibold tabular-nums text-foreground">{score}</div>
      </div>
    </div>
  );
}
