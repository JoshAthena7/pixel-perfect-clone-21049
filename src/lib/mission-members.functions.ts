import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inviteSchema = z.object({
  missionId: z.string().uuid(),
  email: z.string().email().max(254),
  role: z.enum(["admin", "lead", "writer", "sme", "viewer"]),
  displayName: z.string().min(1).max(120).optional(),
});

export const inviteMissionMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Caller must be admin/lead on this mission
    const { data: roleCheck } = await supabase.rpc("has_mission_role", {
      _mission_id: data.missionId,
      _user_id: userId,
      _roles: ["admin", "lead"],
    });
    if (!roleCheck) throw new Error("Only mission admins or leads can invite members.");

    // Find an existing auth user with this email
    let inviteeId: string | null = null;
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (existing?.id) inviteeId = existing.id;

    // If no profile exists, send a magic-link invite to create the account
    if (!inviteeId) {
      const { data: invited, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
      if (inviteErr) throw new Error(inviteErr.message);
      inviteeId = invited.user?.id ?? null;
      if (!inviteeId) throw new Error("Invite did not produce a user.");
    }

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
