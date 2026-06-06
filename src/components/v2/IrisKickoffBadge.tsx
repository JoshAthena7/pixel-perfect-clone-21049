import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

type KickoffSummary = {
  briefs?: { generated?: number; skipped?: number; total?: number };
  error?: string;
} | null;

type MissionKickoff = {
  iris_kickoff_status: "idle" | "running" | "complete" | "failed" | null;
  iris_kickoff_at: string | null;
  iris_kickoff_summary: KickoffSummary;
};

/**
 * Small inline badge that shows the live state of the auto-IRIS pipeline for
 * a mission. Renders nothing when IRIS has never been kicked off (idle/null)
 * so it stays out of the way on pre-activation missions.
 *
 * Polls every 4s while running; otherwise refreshes on window focus.
 */
export function IrisKickoffBadge({
  missionId,
  className = "",
}: {
  missionId: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["iris-kickoff-badge", missionId],
    queryFn: async (): Promise<MissionKickoff | null> => {
      const { data } = await supabase
        .from("missions")
        .select("iris_kickoff_status, iris_kickoff_at, iris_kickoff_summary")
        .eq("id", missionId)
        .maybeSingle();
      return (data as MissionKickoff | null) ?? null;
    },
    refetchInterval: (q) =>
      (q.state.data as MissionKickoff | null)?.iris_kickoff_status === "running"
        ? 4000
        : false,
    refetchOnWindowFocus: true,
  });

  const status = data?.iris_kickoff_status ?? null;
  if (!status || status === "idle") return null;

  if (status === "running") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}
        style={{
          background: "rgba(167,139,250,0.10)",
          borderColor: "rgba(167,139,250,0.35)",
          color: "#c4b5fd",
        }}
        title="IRIS is parsing the RFP and scoring win-theme alignment"
      >
        <Loader2 size={11} className="animate-spin" />
        IRIS is reading your RFP…
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}
        style={{
          background: "rgba(239,68,68,0.10)",
          borderColor: "rgba(239,68,68,0.35)",
          color: "#fca5a5",
        }}
        title={data?.iris_kickoff_summary?.error ?? "IRIS kickoff failed"}
      >
        <AlertTriangle size={11} />
        IRIS kickoff failed
      </span>
    );
  }

  // complete
  const briefs = data?.iris_kickoff_summary?.briefs;
  const count = briefs?.generated ?? briefs?.total ?? null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}
      style={{
        background: "rgba(16,185,129,0.10)",
        borderColor: "rgba(16,185,129,0.35)",
        color: "#6ee7b7",
      }}
      title="IRIS finished the initial pass on this mission"
    >
      <CheckCircle2 size={11} />
      <Sparkles size={10} className="opacity-70" />
      IRIS ready{count != null ? ` · ${count} brief${count === 1 ? "" : "s"}` : ""}
    </span>
  );
}
