// UX-3: Slim countdown banner shown below MissionNav on all mission sub-pages.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function daysUntil(d: string): number {
  const t = new Date(d).getTime();
  if (isNaN(t)) return NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function MissionCountdownBanner({ missionId }: { missionId: string }) {
  const { data } = useQuery({
    queryKey: ["mission-countdown-banner", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("submission_date")
        .eq("id", missionId)
        .maybeSingle();
      return (data?.submission_date as string | null) ?? null;
    },
    staleTime: 60_000,
  });

  if (!data) return null;
  const days = daysUntil(data);
  if (isNaN(days)) return null;
  if (days >= 15) return null;

  const past = days < 0;
  const red = past || days <= 7;
  const color = red ? "#EF4444" : "#F59E0B";
  const bg = red ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)";

  const label = past
    ? "Submission date passed"
    : days === 0
      ? "Submission today"
      : `Submission in ${days} day${days === 1 ? "" : "s"}`;

  return (
    <div
      role="status"
      className="w-full flex items-center px-6 text-[12px] font-medium uppercase tracking-wide"
      style={{
        height: 32,
        background: bg,
        borderLeft: `2px solid ${color}`,
        color,
      }}
    >
      {label}
    </div>
  );
}
