import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Criteria = z.object({
  id: z.string().uuid().optional(),
  category: z.string().min(1).max(200),
  points: z.number().int().min(0).max(10000),
  sections_covered: z.array(z.string().min(1).max(50)).max(50),
  competitive_risk: z.enum(["low", "medium", "high"]),
});

export const saveEvaluationCriteria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid(), criteria: z.array(Criteria).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Replace-all semantics for simplicity.
    await supabase.from("mission_evaluation_criteria").delete().eq("mission_id", data.missionId);
    if (data.criteria.length === 0) return { count: 0 };
    const rows = data.criteria.map((c, i) => ({
      mission_id: data.missionId,
      category: c.category,
      points: c.points,
      sections_covered: c.sections_covered,
      competitive_risk: c.competitive_risk,
      display_order: i,
    }));
    const { error } = await supabase.from("mission_evaluation_criteria").insert(rows);
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });

export const saveExpertiseTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    userId: z.string().uuid(),
    tag: z.string().min(1).max(60),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mission_member_expertise")
      .insert({ mission_id: data.missionId, user_id: data.userId, tag: data.tag.trim() });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const removeExpertiseTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("mission_member_expertise").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
