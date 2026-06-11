import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MissionMeta = {
  id: string;
  name: string;
  status: string | null;
  submission_deadline: string | null;
  intelligence_graph_completeness: number | null;
};

export function useMissionMeta(missionId: string | undefined) {
  return useQuery({
    queryKey: ["mission-meta", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    queryFn: async (): Promise<MissionMeta | null> => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,status,submission_deadline,intelligence_graph_completeness")
        .eq("id", missionId!)
        .maybeSingle();
      return (data as MissionMeta | null) ?? null;
    },
  });
}

export function useMissionAtRiskCount(missionId: string | undefined) {
  return useQuery({
    queryKey: ["mission-at-risk", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("mission_questions")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId!)
        .eq("health_status", "at_risk");
      return count ?? 0;
    },
  });
}
