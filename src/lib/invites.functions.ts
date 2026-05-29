import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const acceptSchema = z.object({
  token: z.string().min(8).max(128),
});

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => acceptSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Look up the user's email & display name from auth
    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr || !userRes.user) throw new Error("Could not load your account.");
    const userEmail = (userRes.user.email ?? "").toLowerCase();

    // Find the invite
    const { data: invite, error: invErr } = await supabaseAdmin
      .from("engagement_invites")
      .select(
        "id, engagement_id, email, display_name, role, title, accepted_at, revoked_at",
      )
      .eq("token", data.token)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!invite) throw new Error("This invitation link is invalid.");
    if (invite.revoked_at) throw new Error("This invitation has been revoked.");
    if (invite.accepted_at) throw new Error("This invitation was already used.");

    // Soft-check the email matches (case-insensitive)
    if (
      userEmail &&
      invite.email.toLowerCase() !== userEmail
    ) {
      throw new Error(
        `This invitation was sent to ${invite.email}. Sign in with that email to accept.`,
      );
    }

    // Upsert profile display_name if missing
    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, display_name: invite.display_name },
        { onConflict: "id", ignoreDuplicates: true },
      );

    // Insert engagement_members row (or update existing one tied to this user)
    const { data: existing } = await supabaseAdmin
      .from("engagement_members")
      .select("id")
      .eq("engagement_id", invite.engagement_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("engagement_members")
        .update({
          role: invite.role,
          display_name: invite.display_name,
          title: invite.title,
          email: userRes.user.email,
        })
        .eq("id", existing.id);
    } else {
      const { error: insErr } = await supabaseAdmin
        .from("engagement_members")
        .insert({
          engagement_id: invite.engagement_id,
          user_id: userId,
          role: invite.role,
          display_name: invite.display_name,
          title: invite.title,
          email: userRes.user.email,
        });
      if (insErr) throw new Error(insErr.message);
    }

    // Mark accepted
    await supabaseAdmin
      .from("engagement_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", invite.id);

    return { engagementId: invite.engagement_id };
  });
