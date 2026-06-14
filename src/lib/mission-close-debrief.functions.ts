import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  mission_id: z.string().uuid(),
  outcome: z.enum(["won", "lost", "no_award", "cancelled"]),
  outcome_factor: z.string().max(8000).optional().nullable(),
  win_theme_notes: z.string().max(8000).optional().nullable(),
  competitor_observations: z.string().max(8000).optional().nullable(),
  top_lesson: z.string().max(8000).optional().nullable(),
});

export const saveMissionCloseDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error: insertErr } = await supabase
      .from("oracle_mission_outcomes")
      .insert({
        mission_id: data.mission_id,
        outcome: data.outcome,
        outcome_factor: data.outcome_factor ?? null,
        win_theme_notes: data.win_theme_notes ?? null,
        competitor_observations: data.competitor_observations ?? null,
        top_lesson: data.top_lesson ?? null,
        completed_by: userId,
      });
    if (insertErr) {
      console.error("[mission-close-debrief] insert failed", insertErr);
      throw new Error(insertErr.message);
    }

    const { error: updErr } = await supabase
      .from("missions")
      .update({ debrief_completed: true })
      .eq("id", data.mission_id);
    if (updErr) {
      console.error("[mission-close-debrief] mark complete failed", updErr);
    }

    return { ok: true };
  });
