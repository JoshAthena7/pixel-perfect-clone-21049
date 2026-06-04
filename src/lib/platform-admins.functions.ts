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
  if (!data) throw new Error("Forbidden: platform admin required");
}

/** List every profile + a flag for whether they hold the platform admin role. */
export const listPlatformAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, avatar_color, created_at")
      .order("created_at", { ascending: true });

    const { data: adminRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, granted_at, granted_by")
      .eq("role", "admin");

    const adminMap = new Map(
      (adminRows ?? []).map((r) => [r.user_id, r] as const),
    );

    return (profiles ?? []).map((p) => ({
      id: p.id as string,
      displayName: (p.display_name as string | null) ?? null,
      email: (p.email as string | null) ?? null,
      avatarColor: (p.avatar_color as string | null) ?? null,
      isAdmin: adminMap.has(p.id as string),
      grantedAt:
        (adminMap.get(p.id as string)?.granted_at as string | undefined) ??
        null,
    }));
  });

/** Grant the platform admin role to a user. */
export const grantPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: data.userId, role: "admin", granted_by: userId },
      { onConflict: "user_id,role" },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("olympus_audit_log").insert({
      user_id: userId,
      action: "admin_role_granted",
      target_type: "user",
      target_id: data.userId,
      metadata: { role: "admin" },
    });

    return { ok: true };
  });

/** Revoke the platform admin role. Cannot revoke yourself. */
export const revokePlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    if (data.userId === userId) {
      throw new Error("You can't revoke your own admin access.");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Spec: minimum of two admins per organization.
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 2) {
      throw new Error(
        "Atlas requires at least two platform admins. Promote another admin before revoking this one.",
      );
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "admin");
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("olympus_audit_log").insert({
      user_id: userId,
      action: "admin_role_revoked",
      target_type: "user",
      target_id: data.userId,
      metadata: { role: "admin" },
    });

    return { ok: true };
  });
