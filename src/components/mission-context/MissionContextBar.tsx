/**
 * Persistent role context bar.
 * Always-visible 24px strip showing: Role · Mission code.
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
        .select("name, short_code, mission_code")
        .eq("id", missionId)
        .maybeSingle();
      return data as {
        name?: string | null;
        short_code?: string | null;
        mission_code?: string | null;
      } | null;
    },
    staleTime: 5 * 60_000,
  });

  const code = mission?.short_code || mission?.mission_code || mission?.name || "Mission";

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
      <span>{displayRole(role)} · {code}</span>
    </div>
  );
}

