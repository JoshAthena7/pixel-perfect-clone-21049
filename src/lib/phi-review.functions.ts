import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["unreviewed", "reviewed", "escalated", "resolved"]),
  resolution_type: z
    .enum(["no_action", "document_removed", "user_notified", "escalated_compliance"])
    .nullable()
    .optional(),
  review_note: z.string().max(4000).nullable().optional(),
});

export const reviewPhiRejection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin role required");

    const { error } = await supabase
      .from("phi_rejection_log")
      .update({
        status: data.status,
        resolution_type: data.resolution_type ?? null,
        review_note: data.review_note ?? null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
