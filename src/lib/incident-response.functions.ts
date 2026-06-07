import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getIncidentResponsePlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("incident_response_plan")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const planSchema = z.object({
  id: z.string().uuid().optional(),
  classification: z.string().max(20000),
  immediate_response: z.string().max(20000),
  notification_obligations: z.string().max(20000),
  evidence_preservation: z.string().max(20000),
  recovery_checklist: z.string().max(20000),
});

export const saveIncidentResponsePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => planSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin role required");

    const payload = {
      classification: data.classification,
      immediate_response: data.immediate_response,
      notification_obligations: data.notification_obligations,
      evidence_preservation: data.evidence_preservation,
      recovery_checklist: data.recovery_checklist,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };

    if (data.id) {
      const { error } = await supabase
        .from("incident_response_plan")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("incident_response_plan")
        .insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
