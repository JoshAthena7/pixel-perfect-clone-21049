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

/* ─────────── Three-state user model ─────────── */

export const loadUser = createServerFn({ method: "POST" })
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
    const email = data.email.toLowerCase();
    const { data: row, error } = await supabaseAdmin
      .from("atlas_invites")
      .insert({
        email,
        display_name: data.displayName ?? null,
        role_hint: data.roleHint ?? null,
        notes: data.notes ?? null,
        invited_by: userId,
        contract_signed: true, // skip legacy contract gate
        contract_signed_at: new Date().toISOString(),
        contract_signed_by: userId,
        status: "ready_to_invite",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const sendOfficialInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        redirectTo: z.string().url().optional(),
      })
      .parse(input),
  )
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

    let acceptedUserId: string | null = invite.accepted_user_id;
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id,has_onboarded")
      .eq("email", invite.email)
      .maybeSingle();
    if (existing?.id) acceptedUserId = existing.id;

    if (!acceptedUserId) {
      const inviteOpts = data.redirectTo ? { redirectTo: data.redirectTo } : undefined;
      const { data: invited, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(invite.email, inviteOpts);
      if (inviteErr) {
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
    } else if (!existing?.has_onboarded) {
      // Re-trigger the magic link for an existing not-yet-onboarded user.
      const inviteOpts = data.redirectTo ? { redirectTo: data.redirectTo } : undefined;
      await supabaseAdmin.auth.admin
        .inviteUserByEmail(invite.email, inviteOpts)
        .catch(() => undefined);
    }

    const onboarded = existing?.has_onboarded === true;
    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .update({
        invite_sent_at: new Date().toISOString(),
        invite_sent_by: userId,
        accepted_user_id: acceptedUserId,
        status: onboarded ? "accepted" : "invite_sent",
        accepted_at: onboarded ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, userId: acceptedUserId, alreadyActive: onboarded };
  });

type RosterEntry = {
  key: string;
  state: "loaded" | "invited" | "active";
  email: string;
  display_name: string | null;
  role_hint: string | null;
  invite_id: string | null;
  invite_sent_at: string | null;
  user_id: string | null;
  last_login_at: string | null;
  has_onboarded: boolean;
  active_missions: number;
  created_at: string;
};

export const listTeamRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: invites }, { data: profiles }, { data: memberships }] = await Promise.all([
      supabaseAdmin
        .from("atlas_invites")
        .select(
          "id,email,display_name,role_hint,invite_sent_at,accepted_user_id,created_at",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("profiles")
        .select("id,display_name,email,has_onboarded,last_login_at,created_at"),
      supabaseAdmin.from("mission_members").select("user_id,mission_id"),
    ]);

    const missionsByUser = new Map<string, number>();
    for (const m of memberships ?? []) {
      if (!m.user_id) continue;
      missionsByUser.set(m.user_id, (missionsByUser.get(m.user_id) ?? 0) + 1);
    }

    const profileByEmail = new Map<string, any>();
    const profileById = new Map<string, any>();
    for (const p of profiles ?? []) {
      if (p.email) profileByEmail.set(p.email.toLowerCase(), p);
      profileById.set(p.id, p);
    }

    const entries: RosterEntry[] = [];
    const claimedProfileIds = new Set<string>();

    for (const inv of invites ?? []) {
      const emailLower = inv.email.toLowerCase();
      const linked =
        (inv.accepted_user_id ? profileById.get(inv.accepted_user_id) : null) ??
        profileByEmail.get(emailLower) ??
        null;
      if (linked?.id) claimedProfileIds.add(linked.id);

      let state: RosterEntry["state"];
      if (linked?.has_onboarded) state = "active";
      else if (inv.invite_sent_at) state = "invited";
      else state = "loaded";

      entries.push({
        key: `inv:${inv.id}`,
        state,
        email: inv.email,
        display_name: linked?.display_name ?? inv.display_name ?? null,
        role_hint: inv.role_hint ?? null,
        invite_id: inv.id,
        invite_sent_at: inv.invite_sent_at,
        user_id: linked?.id ?? null,
        last_login_at: linked?.last_login_at ?? null,
        has_onboarded: linked?.has_onboarded === true,
        active_missions: linked?.id ? (missionsByUser.get(linked.id) ?? 0) : 0,
        created_at: inv.created_at,
      });
    }

    // Legacy profiles with no invite row → treat as ACTIVE.
    for (const p of profiles ?? []) {
      if (claimedProfileIds.has(p.id)) continue;
      entries.push({
        key: `prof:${p.id}`,
        state: p.has_onboarded ? "active" : "invited",
        email: p.email ?? "",
        display_name: p.display_name ?? null,
        role_hint: null,
        invite_id: null,
        invite_sent_at: null,
        user_id: p.id,
        last_login_at: p.last_login_at ?? null,
        has_onboarded: p.has_onboarded === true,
        active_missions: missionsByUser.get(p.id) ?? 0,
        created_at: p.created_at ?? new Date(0).toISOString(),
      });
    }

    entries.sort((a, b) => {
      const order = { loaded: 0, invited: 1, active: 2 } as const;
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return b.created_at.localeCompare(a.created_at);
    });

    return entries;
  });

export const markOnboardingComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ has_onboarded: true, onboarded_at: nowIso })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("atlas_invites")
      .update({
        accepted_user_id: userId,
        accepted_at: nowIso,
        status: "accepted",
      })
      .eq("accepted_user_id", userId);

    return { ok: true };
  });
