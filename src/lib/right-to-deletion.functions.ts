import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export const listDeletionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("writer_deletion_requests")
      .select("*")
      .order("request_received_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const createSchema = z.object({
  subject_name: z.string().trim().min(1).max(200),
  subject_email: z.string().trim().email().max(255),
  notes: z.string().max(2000).optional().nullable(),
});

export const createDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await (supabase.from("writer_deletion_requests") as any).insert({
      writer_email: data.subject_email,
      subject_name: data.subject_name,
      notes: data.notes ?? null,
      request_source: "in_app",
      requested_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markDeletionFulfilled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        method: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await (supabase.from("writer_deletion_requests") as any)
      .update({
        processed_at: new Date().toISOString(),
        processed_by: userId,
        fulfillment_method: data.method ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
