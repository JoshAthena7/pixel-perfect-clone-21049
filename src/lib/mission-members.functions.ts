import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const missionRoleSchema = z.enum([
  "admin",
  "lead",
  "engagement_lead",
  "project_manager",
  "lead_writer",
  "lead_graphics",
  "writer",
  "sme",
  "viewer",
]);
const LEAD_ROLES = ["admin", "lead", "engagement_lead", "project_manager"] as const;

const inviteSchema = z.object({
  missionId: z.string().uuid(),
  email: z.string().email().max(254),
  role: missionRoleSchema,
  displayName: z.string().min(1).max(120).optional(),
});

const collectiveMemberSchema = z.object({
  missionId: z.string().uuid(),
  collectiveMemberId: z.string().uuid(),
  role: missionRoleSchema,
});

// Look up an existing auth.users row by email. Supabase's admin API doesn't
// expose a direct getUserByEmail, so we page through listUsers (capped) and
// match case-insensitively. Returns null if not found.
async function findAuthUserByEmail(
  admin: { auth: { admin: { listUsers: (opts: { page: number; perPage: number }) => Promise<{ data: { users: Array<{ id: string; email?: string | null }> }; error: unknown }> } } },
  email: string,
): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return { id: hit.id };
    if (data.users.length < 200) break;
  }
  return null;
}

export const inviteMissionMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Caller must be admin/lead on this mission
    const { data: roleCheck } = await supabase.rpc("has_mission_role", {
      _mission_id: data.missionId,
      _user_id: userId,
      _roles: [...LEAD_ROLES],
    });
    if (!roleCheck) throw new Error("Only mission admins or leads can invite members.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find an existing auth user with this email
    let inviteeId: string | null = null;
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (existing?.id) inviteeId = existing.id;

    // User may exist in auth.users without a profile row — look them up first.
    if (!inviteeId) {
      const authUser = await findAuthUserByEmail(supabaseAdmin, data.email);
      if (authUser) inviteeId = authUser.id;
    }

    // Still no user: send a magic-link invite to create the account.
    if (!inviteeId) {
      const { data: invited, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
      if (inviteErr) {
        // Race: someone created the account between checks — find and continue.
        const fallback = await findAuthUserByEmail(supabaseAdmin, data.email);
        if (!fallback) throw new Error(inviteErr.message);
        inviteeId = fallback.id;
      } else {
        inviteeId = invited.user?.id ?? null;
      }
      if (!inviteeId) throw new Error("Invite did not produce a user.");
    }
    const resolvedId: string = inviteeId;

    // Ensure a profile row exists for the invitee so future lookups are fast.
    await supabaseAdmin.from("profiles").upsert(
      { id: inviteeId, email: data.email, display_name: data.displayName ?? null },
      { onConflict: "id" },
    );

    // Add to mission_members (idempotent on (mission_id,user_id))
    const { error: memberErr } = await supabaseAdmin
      .from("mission_members")
      .upsert(
        {
          mission_id: data.missionId,
          user_id: inviteeId,
          role: data.role,
          display_name: data.displayName ?? null,
        },
        { onConflict: "mission_id,user_id" },
      );
    if (memberErr) throw new Error(memberErr.message);

    return { ok: true, userId: inviteeId };
  });

export const addCollectiveMemberToMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => collectiveMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roleCheck, error: roleErr } = await supabase.rpc("has_mission_role", {
      _mission_id: data.missionId,
      _user_id: userId,
      _roles: [...LEAD_ROLES],
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!roleCheck) throw new Error("Only mission admins or leads can add team members.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: collectiveMember, error: collectiveErr } = await supabaseAdmin
      .from("collective_members")
      .select("id,full_name,email,profile_id,is_active")
      .eq("id", data.collectiveMemberId)
      .eq("is_active", true)
      .maybeSingle();
    if (collectiveErr) throw new Error(collectiveErr.message);
    if (!collectiveMember) throw new Error("Collective member not found.");

    let inviteeId = collectiveMember.profile_id ?? null;
    let sentInvite = false;

    if (!inviteeId && collectiveMember.email) {
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", collectiveMember.email)
        .maybeSingle();
      inviteeId = existingProfile?.id ?? null;
    }

    if (!inviteeId && collectiveMember.email) {
      const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        collectiveMember.email,
      );
      if (inviteErr) throw new Error(inviteErr.message);
      inviteeId = invited.user?.id ?? null;
      sentInvite = true;
    }

    if (!inviteeId) {
      throw new Error("This collective member needs an email or linked account before they can be added.");
    }

    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      id: inviteeId,
      display_name: collectiveMember.full_name,
      email: collectiveMember.email,
    });
    if (profileErr) throw new Error(profileErr.message);

    if (collectiveMember.profile_id !== inviteeId) {
      await supabaseAdmin
        .from("collective_members")
        .update({ profile_id: inviteeId })
        .eq("id", collectiveMember.id);
    }

    const { error: memberErr } = await supabaseAdmin
      .from("mission_members")
      .upsert(
        {
          mission_id: data.missionId,
          user_id: inviteeId,
          role: data.role,
          display_name: collectiveMember.full_name,
        },
        { onConflict: "mission_id,user_id" },
      );
    if (memberErr) throw new Error(memberErr.message);

    return { ok: true, userId: inviteeId, sentInvite, displayName: collectiveMember.full_name };
  });
