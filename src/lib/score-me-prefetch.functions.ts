import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Pre-warms Oracle context for the Score Me modal so the writer sees
 * "Ready to coach" before they finish pasting their draft.
 * Returns counts so the UI can render a meaningful "loaded" state.
 */
const Input = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
});

export const prefetchScoreMeContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: q } = await supabase
      .from("mission_questions")
      .select("section_id")
      .eq("id", data.questionId)
      .maybeSingle();
    const sectionId = (q as any)?.section_id ?? null;

    const [winRes, complianceRes, insightsRes, evalRes] = await Promise.all([
      supabase
        .from("mission_win_strategy")
        .select("id")
        .eq("mission_id", data.missionId)
        .maybeSingle(),
      sectionId
        ? supabase
            .from("mission_compliance_requirements")
            .select("id", { head: true, count: "exact" })
            .eq("mission_id", data.missionId)
            .eq("section_id", sectionId)
        : Promise.resolve({ count: 0 } as any),
      sectionId
        ? supabase
            .from("athena_insights")
            .select("id", { head: true, count: "exact" })
            .eq("mission_id", data.missionId)
            .eq("section_id", sectionId)
        : Promise.resolve({ count: 0 } as any),
      supabase
        .from("evaluator_pictures")
        .select("id")
        .eq("mission_id", data.missionId)
        .maybeSingle(),
    ]);

    return {
      ready: true,
      hasWinStrategy: !!(winRes as any)?.data,
      complianceCount: (complianceRes as any)?.count ?? 0,
      insightCount: (insightsRes as any)?.count ?? 0,
      hasEvaluatorPicture: !!(evalRes as any)?.data,
    };
  });
