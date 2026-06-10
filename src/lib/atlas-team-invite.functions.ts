import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_ROLES = ["admin", "engagement_lead", "writer", "sme", "reviewer", "unassigned"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

async function assertAdmin(supabase: any, userId: string) {
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) throw new Error("Only platform admins can manage the Atlas team.");
}

const UpdateRoleInput = z.object({
  id: z.string().uuid(),
  atlas_role: z.enum(ALLOWED_ROLES),
});

export const updateAtlasTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateRoleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("atlas_team_members")
      .update({ atlas_role: data.atlas_role, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("atlas_activity_log").insert({
      member_id: data.id,
      action: `Role set to ${data.atlas_role}`,
      performed_by: userId,
      metadata: { atlas_role: data.atlas_role },
    });
    return { ok: true, atlas_role: data.atlas_role as Role };
  });

const InviteInput = z.object({ id: z.string().uuid() });

export const sendAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InviteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const { data: member, error: mErr } = await supabase
      .from("atlas_team_members")
      .select("id,email,first_name,last_name,atlas_role,atlas_invite_status")
      .eq("id", data.id)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!member) throw new Error("Team member not found.");

    const email = String(member.email).toLowerCase();
    const displayName = [member.first_name, member.last_name].filter(Boolean).join(" ") || null;

    // Upsert invite row keyed by email
    const { data: existing } = await supabase
      .from("atlas_invites")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    const inviteRow = {
      email,
      display_name: displayName,
      role: member.atlas_role || null,
      role_hint: member.atlas_role || null,
      status: "invited",
      invite_sent_at: new Date().toISOString(),
      invite_sent_by: userId,
      invited_by: userId,
      updated_at: new Date().toISOString(),
    };

    let inviteId: string;
    if (existing?.id) {
      const { error } = await supabase.from("atlas_invites").update(inviteRow).eq("id", existing.id);
      if (error) throw new Error(error.message);
      inviteId = existing.id;
    } else {
      const { data: ins, error } = await supabase
        .from("atlas_invites")
        .insert(inviteRow)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      inviteId = ins.id;
    }

    // Issue a fresh token (14-day expiry); invalidate prior unused tokens
    await supabase
      .from("atlas_invite_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("invite_id", inviteId)
      .is("used_at", null);

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { error: tErr } = await supabase.from("atlas_invite_tokens").insert({
      invite_id: inviteId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: userId,
    });
    if (tErr) throw new Error(tErr.message);

    // Mark member as invited
    await supabase
      .from("atlas_team_members")
      .update({ atlas_invite_status: "invited", updated_at: new Date().toISOString() })
      .eq("id", member.id);

    await supabase.from("atlas_activity_log").insert({
      member_id: member.id,
      action: "Invite issued",
      performed_by: userId,
      metadata: { email, invite_id: inviteId },
    });

    return {
      ok: true,
      inviteId,
      email,
      token: rawToken,
      expiresAt,
    };
  });
