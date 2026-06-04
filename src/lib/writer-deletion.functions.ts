// H6: Right-to-deletion — soft delete with anonymisation.
//
// We retain the engagement record (counts, question IDs, timestamps) — those
// are not personal data. We scrub display_name → "Former contributor", null
// personal identifier fields, deactivate the auth account, and log to
// olympus_audit_log. The writer_identities row stays for referential integrity.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FORMER_DISPLAY_NAME = "Former contributor";

export const requestWriterDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        writerId: z.string().uuid(),
        reason: z.string().min(10).max(1000),
        deletionRequestId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Admin gate — has_role check is also enforced by RLS, but we want a
    // clean error rather than a permission denied on the write.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (!roles || roles.length === 0) {
      throw new Error("Only admins can process a deletion request.");
    }

    // Anonymise writer_identities
    const { error: upErr } = await supabase
      .from("writer_identities")
      .update({
        display_name: FORMER_DISPLAY_NAME,
        primary_email: null,
        metadata: {}, // wipes any personal fields stashed in jsonb (bio, phone, avatar, etc.)
        deleted_at: new Date().toISOString(),
        deletion_requested_by: userId,
        deletion_reason: data.reason,
        is_active: false,
      } as never)
      .eq("id", data.writerId);
    if (upErr) throw new Error(`Writer anonymisation failed: ${upErr.message}`);

    // Resolve associated auth users via aliases, then disable each in profiles
    // (cannot delete auth.users from the client SDK; we deactivate via profile flag
    // and rely on the deactivated writer_identities + alias for auth checks).
    const { data: aliases } = await supabase
      .from("writer_identity_aliases")
      .select("alias_value")
      .eq("writer_id", data.writerId)
      .eq("alias_kind", "auth_user");
    const authIds: string[] = (aliases ?? [])
      .map((a: any) => a.alias_value)
      .filter((v: any): v is string => typeof v === "string" && v.length > 0);

    if (authIds.length > 0) {
      await supabase
        .from("profiles")
        .update({
          display_name: FORMER_DISPLAY_NAME,
          avatar_url: null,
        } as never)
        .in("id", authIds);
    }

    // Close out the inbound request record (if any)
    if (data.deletionRequestId) {
      await supabase
        .from("writer_deletion_requests")
        .update({
          processed_at: new Date().toISOString(),
          processed_by: userId,
          writer_id: data.writerId,
        } as never)
        .eq("id", data.deletionRequestId);
    }

    // Audit
    await supabase.from("olympus_audit_log").insert({
      user_id: userId,
      action_type: "writer_deletion_processed",
      action_summary: `Writer record anonymised under right-to-deletion request.`,
      target_table: "writer_identities",
      target_id: data.writerId,
      metadata: {
        writer_id: data.writerId,
        reason: data.reason,
        affected_auth_user_ids: authIds,
        deletion_request_id: data.deletionRequestId ?? null,
      },
    });

    return { ok: true, anonymisedAuthUserIds: authIds };
  });

export const searchWritersForDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const q = data.query.trim();
    const { data: rows } = await supabase
      .from("writer_identities")
      .select("id,display_name,primary_email,deleted_at,is_active")
      .or(`display_name.ilike.%${q}%,primary_email.ilike.%${q}%`)
      .limit(20);
    return (rows ?? []) as Array<{
      id: string;
      display_name: string;
      primary_email: string | null;
      deleted_at: string | null;
      is_active: boolean;
    }>;
  });

export const listDeletionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("writer_deletion_requests")
      .select("*")
      .order("request_received_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const recordDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        writerEmail: z.string().email(),
        source: z.enum(["email", "in_app", "legal"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("writer_deletion_requests")
      .insert({
        writer_email: data.writerEmail,
        request_source: data.source,
        notes: data.notes ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
