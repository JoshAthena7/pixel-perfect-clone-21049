import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only platform admins can manage Atlas invites.");
}

export const listAtlasInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("atlas_invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(254),
        displayName: z.string().min(1).max(120).optional(),
        roleHint: z.string().max(60).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("atlas_invites")
      .insert({
        email: data.email.toLowerCase(),
        display_name: data.displayName ?? null,
        role_hint: data.roleHint ?? null,
        notes: data.notes ?? null,
        invited_by: userId,
        status: "awaiting_contract",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        displayName: z.string().max(120).nullable().optional(),
        roleHint: z.string().max(60).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      display_name?: string | null;
      role_hint?: string | null;
      notes?: string | null;
    } = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.roleHint !== undefined) patch.role_hint = data.roleHint;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setContractSigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), signed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readErr } = await supabaseAdmin
      .from("atlas_invites")
      .select("status, invite_sent_at, accepted_at")
      .eq("id", data.id)
      .single();
    if (readErr) throw new Error(readErr.message);
    const nextStatus = data.signed
      ? current.accepted_at
        ? "accepted"
        : current.invite_sent_at
          ? "invite_sent"
          : "ready_to_invite"
      : "awaiting_contract";
    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .update({
        contract_signed: data.signed,
        contract_signed_at: data.signed ? new Date().toISOString() : null,
        contract_signed_by: data.signed ? userId : null,
        status: nextStatus,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: readErr } = await supabaseAdmin
      .from("atlas_invites")
      .select("*")
      .eq("id", data.id)
      .single();
    if (readErr) throw new Error(readErr.message);
    if (!invite.contract_signed) {
      throw new Error("Contract must be marked signed before sending an invite.");
    }

    // If they already have an Atlas profile, link it and mark accepted.
    let acceptedUserId: string | null = invite.accepted_user_id;
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", invite.email)
      .maybeSingle();
    if (existing?.id) acceptedUserId = existing.id;

    if (!acceptedUserId) {
      const { data: invited, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(invite.email);
      if (inviteErr) {
        // User already exists in auth.users without a profile row — find them.
        const target = invite.email.toLowerCase();
        let found: string | null = null;
        for (let page = 1; page <= 20 && !found; page++) {
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: 200,
          });
          if (listErr) break;
          const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === target);
          if (hit) found = hit.id;
          if (list.users.length < 200) break;
        }
        if (!found) throw new Error(inviteErr.message);
        acceptedUserId = found;
      } else {
        acceptedUserId = invited.user?.id ?? null;
      }
    }

    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .update({
        invite_sent_at: new Date().toISOString(),
        invite_sent_by: userId,
        accepted_user_id: acceptedUserId,
        status: existing?.id ? "accepted" : "invite_sent",
        accepted_at: existing?.id ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, userId: acceptedUserId };
  });

export const deleteAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
