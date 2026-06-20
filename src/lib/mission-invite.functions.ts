import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { getRequestHost } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  missionId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export const sendMissionInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Load team member
    const { data: member, error: mErr } = await supabase
      .from("atlas_team_members")
      .select("id, email, first_name, last_name, atlas_role")
      .eq("id", data.memberId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!member?.email) throw new Error("Team member is missing an email address.");

    // Load mission + role on this mission
    const [{ data: mission }, { data: mtm }] = await Promise.all([
      supabase
        .from("missions")
        .select("id, name, client_name, submission_deadline")
        .eq("id", data.missionId)
        .maybeSingle(),
      supabase
        .from("mission_team_members")
        .select("mission_role")
        .eq("mission_id", data.missionId)
        .eq("member_id", data.memberId)
        .maybeSingle(),
    ]);
    if (!mission) throw new Error("Mission not found.");

    // Engagement lead name
    const { data: leadMtm } = await supabase
      .from("mission_team_members")
      .select("atlas_team_members(first_name, last_name)")
      .eq("mission_id", data.missionId)
      .eq("mission_role", "engagement_lead")
      .limit(1)
      .maybeSingle();
    const lead = (leadMtm as any)?.atlas_team_members;
    const engagementLeadName = lead
      ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Your Engagement Lead"
      : "Your Engagement Lead";

    const email = String(member.email).toLowerCase();
    const recipientName = [member.first_name, member.last_name].filter(Boolean).join(" ") || "there";
    const missionRole = mtm?.mission_role || member.atlas_role || "Team Member";
    const displayName = [member.first_name, member.last_name].filter(Boolean).join(" ") || null;

    // Upsert atlas_invites with mission_id
    const inviteRow = {
      email,
      display_name: displayName,
      role: missionRole,
      role_hint: missionRole,
      status: "invited",
      mission_id: data.missionId,
      invite_sent_at: new Date().toISOString(),
      invite_sent_by: userId,
      invited_by: userId,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("atlas_invites")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

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

    // Invalidate prior unused tokens, mint a fresh one
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

    // Mark invite-sent
    await supabase
      .from("atlas_team_members")
      .update({
        atlas_invite_status: "invite_sent",
        atlas_invite_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id);

    // Build accept URL — prefer custom domain in prod, else current host
    let acceptOrigin = "https://athenacommandcenter.com";
    try {
      const host = getRequestHost();
      if (host && !host.includes("lovable.app")) acceptOrigin = `https://${host}`;
    } catch {}
    const acceptUrl = `${acceptOrigin}/welcome/${rawToken}`;

    const expectedStartDate = mission.submission_deadline
      ? new Date(mission.submission_deadline).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "TBD";

    // Send the email by calling the existing transactional/send route
    // We need to forward the caller's bearer token (auth required on that route).
    const authHeader = (() => {
      try {
        const req = (globalThis as any).__lovableRequest as Request | undefined;
        return req?.headers.get("authorization") ?? null;
      } catch {
        return null;
      }
    })();

    // Use the auth header from the current server-fn request
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const bearer = authHeader || getRequestHeader("authorization");

    const siteUrl = `${acceptOrigin}`;
    const sendResp = await fetch(`${siteUrl}/lovable/email/transactional/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: bearer } : {}),
      },
      body: JSON.stringify({
        templateName: "mission-invite",
        recipientEmail: email,
        idempotencyKey: `mission-invite-${inviteId}-${tokenHash.slice(0, 16)}`,
        templateData: {
          recipientName,
          missionName: mission.name,
          role: missionRole,
          engagementLeadName,
          expectedStartDate,
          acceptUrl,
        },
      }),
    });

    if (!sendResp.ok) {
      const text = await sendResp.text();
      throw new Error(`Email send failed (${sendResp.status}): ${text.slice(0, 200)}`);
    }

    await supabase.from("atlas_activity_log").insert({
      member_id: member.id,
      action: "Mission invite emailed",
      performed_by: userId,
      metadata: { email, invite_id: inviteId, mission_id: data.missionId, mission_name: mission.name },
    });

    return { ok: true, email, inviteId };
  });
