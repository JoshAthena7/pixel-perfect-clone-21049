// Metadata-only interaction logging for Score Me. NEVER persists draft content
// or suggestion text — only writer/question/dimension/action triples.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Action = z.enum(["viewed", "copied", "expanded", "dismissed"]);

export const logScoreMeInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        questionId: z.string().uuid(),
        missionId: z.string().uuid(),
        dimension: z.string().min(1).max(64),
        action: Action,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("score_me_interactions").insert({
      writer_id: userId,
      question_id: data.questionId,
      mission_id: data.missionId,
      dimension: data.dimension,
      action: data.action,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acknowledgeScoreMeDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ score_me_disclosure_acknowledged_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getScoreMeDisclosureStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("score_me_disclosure_acknowledged_at")
      .eq("id", userId)
      .maybeSingle();
    return {
      acknowledged: !!(data as any)?.score_me_disclosure_acknowledged_at,
      acknowledgedAt: (data as any)?.score_me_disclosure_acknowledged_at ?? null,
    };
  });
