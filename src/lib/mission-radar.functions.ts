import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RadarCategory =
  | "risk"
  | "opportunity"
  | "intelligence"
  | "readiness"
  | "stakeholder"
  | "competitive"
  | "schedule";

export type RadarSignal = {
  id: string;
  category: RadarCategory;
  headline: string;
  body: string | null;
  impact: number;
  urgency: number;
  confidence: number;
  proximity: number;
  score: number;
  ring: "inner" | "mid" | "outer";
  severity: "critical" | "high" | "medium" | "ambient";
  deep_link: string | null;
  iris_rationale: string | null;
  created_at: string;
};

export type MissionRadarData = {
  missionId: string;
  northStar: { title: string; winProbability: number | null };
  counts: { critical: number; high: number; medium: number; ambient: number };
  signals: RadarSignal[];
};

export const getMissionRadar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { missionId: string }) =>
    z.object({ missionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<MissionRadarData> => {
    const { supabase } = context;
    const { missionId } = data;

    const [missionRes, signalsRes] = await Promise.all([
      supabase
        .from("missions")
        .select("id, name, confidence_score")
        .eq("id", missionId)
        .maybeSingle(),
      supabase
        .from("mission_radar_signals")
        .select(
          "id, category, headline, body, impact, urgency, confidence, proximity, score, ring, severity, deep_link, iris_rationale, created_at",
        )
        .eq("mission_id", missionId)
        .is("resolved_at", null)
        .order("score", { ascending: false })
        .limit(80),
    ]);

    const mission = missionRes.data;
    const signals = (signalsRes.data ?? []) as RadarSignal[];

    const counts = signals.reduce(
      (acc, s) => {
        acc[s.severity] = (acc[s.severity] ?? 0) + 1;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, ambient: 0 } as MissionRadarData["counts"],
    );

    return {
      missionId,
      northStar: {
        title: mission?.name ?? "Mission",
        winProbability: (mission?.confidence_score as number | null) ?? null,
      },
      counts,
      signals,
    };
  });
