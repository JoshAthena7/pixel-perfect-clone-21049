/**
 * Hook + banner for locking Mission Canvas inputs whenever the mission's
 * Mission Brief has been approved. Use this anywhere the nine canvas
 * fields (north_star, why_win, why_lose, biggest_concerns,
 * known_competitors, state_priorities, win_themes_text, reinforce, avoid)
 * are presented as editable controls.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Lock, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function useBriefLocked(missionId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["mission-brief-lock", missionId],
    enabled: !!missionId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("brief_status")
        .eq("id", missionId as string)
        .maybeSingle();
      return (data as { brief_status?: string } | null)?.brief_status ?? "draft";
    },
  });
  return { isLocked: data === "approved", briefStatus: data ?? "draft" };
}

export function MissionCanvasLockBanner({
  missionId,
  isLocked,
}: {
  missionId: string;
  isLocked: boolean;
}) {
  if (!isLocked) return null;
  return (
    <div
      className="rounded-lg p-4 flex items-start gap-3 mb-2"
      style={{
        background: "rgba(34,197,94,0.08)",
        border: "1px solid rgba(34,197,94,0.35)",
        color: "rgba(255,255,255,0.92)",
      }}
    >
      <Lock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "rgb(74,222,128)" }} />
      <div className="text-[14px] leading-relaxed">
        <div className="font-medium mb-1" style={{ color: "rgb(134,239,172)" }}>
          Mission Brief is approved.
        </div>
        <div className="text-white/70">
          These fields are locked. Un-approve the brief in the{" "}
          <Link
            to="/missions/$missionId/briefing"
            params={{ missionId }}
            className="inline-flex items-center gap-1 underline"
            style={{ color: "rgb(134,239,172)" }}
          >
            Mission Briefing Room
            <ExternalLink className="h-3 w-3" />
          </Link>{" "}
          to make changes.
        </div>
      </div>
    </div>
  );
}
