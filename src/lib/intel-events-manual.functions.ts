import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  mission_id: z.string().uuid(),
  title: z.string().min(1).max(280),
  content: z.string().min(1).max(4000),
  source_type: z.enum(["atrium", "manual", "document", "thread", "external"]),
  event_type: z.string().min(1).max(80).default("manual"),
  confidence: z.enum(["high", "medium", "low"]).optional().nullable(),
});

export const addManualIntelEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error, data: row } = await supabase
      .from("intel_events")
      .insert({
        mission_id: data.mission_id,
        event_type: data.event_type,
        title: data.title,
        content: data.content,
        confidence: data.confidence ?? null,
        generated_by: "human",
        source_type: data.source_type,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
