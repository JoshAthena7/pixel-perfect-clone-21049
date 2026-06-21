/**
 * FIVE-5 Step 6: Persistent role context bar.
 * Always-visible 24px strip showing: Role · Mission code · Days to submission.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMissionAccess } from "@/hooks/useAccess";
import { displayRole } from "@/lib/mission-landing";

export function MissionContextBar({ missionId }: { missionId: string }) {
  const { data: access } = useMissionAccess(missionId);
  const role = access?.isAdmin ? "admin" : (access?.role ?? null);

  const { data: mission } = useQuery({
    queryKey: ["mission-context-bar", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name, short_code, mission_code, submission_deadline")
        .eq("id", missionId)
        .maybeSingle();
      return data as {
        name?: string | null;
        short_code?: string | null;
        mission_code?: string | null;
        submission_deadline?: string | null;
      } | null;
    },
    staleTime: 5 * 60_000,
  });

  const code = mission?.short_code || mission?.mission_code || mission?.name || "Mission";
  const deadline = mission?.submission_deadline;
  let right: React.ReactNode;
  if (!deadline) {
    right = <span style={{ color: "#fbbf24" }}>Submission date not set</span>;
  } else {
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400_000);
    right = days < 0
      ? `${Math.abs(days)} days overdue`
      : `${days} day${days === 1 ? "" : "s"} to submission`;
  }

  return (
    <div
      style={{
        height: 24,
        display: "flex", alignItems: "center",
        padding: "0 16px",
        background: "transparent",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        fontFamily: "'Courier New', monospace",
        fontSize: 9,
        color: "rgba(255,255,255,0.35)",
        letterSpacing: "0.04em",
      }}
    >
      <span>{displayRole(role)} · {code} · {right}</span>
    </div>
  );
}
