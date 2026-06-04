// Manual mock score entry by leads.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid().nullable().optional(),
  sectionName: z.string().max(120).nullable().optional(),
  stage: z.enum(["red_team", "gold_team", "pink_team", "other"]),
  score: z.number().min(0).max(100),
  evaluatorNote: z.string().max(2000).nullable().optional(),
});

export const recordMockScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { error } = await supabase.from("mock_scores").insert({
      mission_id: data.missionId,
      question_id: data.questionId ?? null,
      section_name: data.sectionName ?? null,
      stage: data.stage,
      score: data.score,
      evaluator_note: data.evaluatorNote ?? null,
      recorded_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
