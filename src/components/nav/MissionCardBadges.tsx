import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Eye, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

async function fetchCounts(missionId: string) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [atRisk, intel, pending] = await Promise.all([
    supabase
      .from("mission_questions")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("health_status", "at_risk"),
    supabase
      .from("intelligence_feed_items")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .gte("iris_relevance_score", 70)
      .eq("is_reviewed", false),
    supabase
      .from("mission_assignments")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("acceptance_status", "pending")
      .lt("assigned_at", dayAgo),
  ]);
  return {
    atRisk: atRisk.count ?? 0,
    intel: intel.count ?? 0,
    pending: pending.count ?? 0,
  };
}

export function MissionCardBadges({ missionId }: { missionId: string }) {
  const { data } = useQuery({
    queryKey: ["mission-card-badges", missionId],
    queryFn: () => fetchCounts(missionId),
    staleTime: 60_000,
  });
  if (!data) return null;
  const allClear = data.atRisk === 0 && data.intel === 0 && data.pending === 0;
  if (allClear) {
    return (
      <div className="flex flex-wrap gap-1.5 pt-2">
        <Chip
          icon={<CheckCircle2 className="h-3 w-3" />}
          label="All clear"
          tone="green"
          title="No at-risk questions, unreviewed high-relevance intel, or stale pending acceptances."
        />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 pt-2">
      {data.atRisk > 0 && (
        <Chip
          icon={<AlertCircle className="h-3 w-3" />}
          label={String(data.atRisk)}
          tone="red"
          title={`${data.atRisk} at-risk question${data.atRisk === 1 ? "" : "s"}`}
        />
      )}
      {data.intel > 0 && (
        <Chip
          icon={<Eye className="h-3 w-3" />}
          label={String(data.intel)}
          tone="amber"
          title={`${data.intel} unreviewed high-relevance intelligence item${data.intel === 1 ? "" : "s"}`}
        />
      )}
      {data.pending > 0 && (
        <Chip
          icon={<Clock className="h-3 w-3" />}
          label={String(data.pending)}
          tone="amber"
          title={`${data.pending} assignment${data.pending === 1 ? "" : "s"} pending acceptance over 24h`}
        />
      )}
    </div>
  );
}

function Chip({
  icon, label, tone, title,
}: { icon: React.ReactNode; label: string; tone: "red" | "amber" | "green"; title: string }) {
  const tones = {
    red: "bg-red-500/15 text-red-400 border-red-500/30",
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    green: "bg-green-500/15 text-green-400 border-green-500/30",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${tones[tone]}`}
    >
      {icon} {label}
    </span>
  );
}
