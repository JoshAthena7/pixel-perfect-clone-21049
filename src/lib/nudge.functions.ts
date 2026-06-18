/**
 * Mission Nudge — send a writer a direct message via Slack or Teams.
 *
 * Pipeline:
 *  1. Authorize sender (admin / lead / EL / PM on this mission)
 *  2. Look up sender, recipient, mission (with webhook URLs)
 *  3. POST to the chosen channel's incoming webhook
 *  4. Insert mission_nudges row (status = sent | failed)
 *  5. Fire mission_assist_events 'nudge_sent' so it shows up in Mission Radar
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PM_ROLES = ["admin", "lead", "engagement_lead", "project_manager"];

async function assertPm(supabase: any, userId: string, missionId: string) {
  const { data: adminRow } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (adminRow) return;
  const { data: m } = await supabase
    .from("mission_team_members").select("mission_role")
    .eq("member_id", userId).eq("mission_id", missionId).maybeSingle();
  if (!m || !PM_ROLES.includes(m.mission_role)) {
    throw new Error("Forbidden: nudge requires admin / EL / PM role");
  }
}

const ChannelSchema = z.enum(["slack", "teams"]);

// TODO: move Slack & Teams webhook URLs to Supabase secrets / env vars before production.
//       Today they live on missions.slack_webhook_url / missions.teams_webhook_url
//       so a single mission can be wired without redeploying.

export const sendMissionNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    missionId: string; recipientId: string; message: string; channel: "slack" | "teams";
  }) =>
    z.object({
      missionId: z.string().uuid(),
      recipientId: z.string().uuid(),
      message: z.string().min(1).max(2000),
      channel: ChannelSchema,
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPm(supabase, userId, data.missionId);

    const [missionRes, senderRes, recipientRes] = await Promise.all([
      supabase.from("missions")
        .select("id,name,slack_webhook_url,teams_webhook_url")
        .eq("id", data.missionId).maybeSingle(),
      supabase.from("profiles").select("id,display_name,email").eq("id", userId).maybeSingle(),
      supabase.from("profiles")
        .select("id,display_name,email,slack_user_id")
        .eq("id", data.recipientId).maybeSingle(),
    ]);

    const mission = missionRes.data as any;
    const sender = senderRes.data as any;
    const recipient = recipientRes.data as any;
    if (!mission) throw new Error("Mission not found");
    if (!recipient) throw new Error("Recipient not found");

    const recipientName = recipient.display_name || recipient.email?.split("@")[0] || "Team member";

    // Send via webhook
    let status: "sent" | "failed" = "sent";
    let errorMessage: string | null = null;
    try {
      if (data.channel === "slack") {
        const url = mission.slack_webhook_url as string | null;
        if (!url) throw new Error("Slack webhook URL not configured for this mission");
        if (!recipient.slack_user_id) {
          throw new Error(`Slack user ID not set for ${recipientName}. Ask them to connect Slack in their profile settings.`);
        }
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: recipient.slack_user_id,
            text: data.message,
            username: "IRIS",
            icon_emoji: ":bolt:",
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Slack webhook ${res.status}: ${txt.slice(0, 160)}`);
        }
      } else if (data.channel === "teams") {
        const url = mission.teams_webhook_url as string | null;
        if (!url) throw new Error("Teams webhook URL not configured for this mission");
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "message",
            attachments: [{
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                type: "AdaptiveCard",
                $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                version: "1.4",
                body: [{ type: "TextBlock", text: data.message, wrap: true }],
                actions: [{
                  type: "Action.OpenUrl",
                  title: "Open ATLAS",
                  url: "https://preview--pixel-perfect-clone-21049.lovable.app",
                }],
              },
            }],
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Teams webhook ${res.status}: ${txt.slice(0, 160)}`);
        }
      }
    } catch (e: any) {
      status = "failed";
      errorMessage = e?.message ?? "Send failed";
    }

    // Record the nudge
    const { data: inserted, error: insertErr } = await supabase
      .from("mission_nudges")
      .insert({
        mission_id: data.missionId,
        sender_id: userId,
        recipient_id: data.recipientId,
        message: data.message,
        channel: data.channel,
        status,
        error_message: errorMessage,
      })
      .select("id")
      .maybeSingle();
    if (insertErr) throw new Error(insertErr.message);

    // Mission Radar / assist event (only on success)
    if (status === "sent") {
      await supabase.from("mission_assist_events").insert({
        mission_id: data.missionId,
        question_id: null,
        user_id: userId,
        event_type: "nudge_sent",
        metadata: {
          nudge_id: inserted?.id ?? null,
          recipient_id: data.recipientId,
          recipient_name: recipientName,
          channel: data.channel,
          message: data.message.slice(0, 400),
        } as any,
      });
    }

    if (status === "failed") {
      throw new Error(errorMessage ?? "Send failed");
    }

    return {
      ok: true,
      nudgeId: inserted?.id ?? null,
      channel: data.channel,
      recipientName,
      missionName: mission.name as string,
      senderFirstName: (sender?.display_name || sender?.email || "Lead").split(/[\s@]/)[0],
    };
  });

export type MissionMessagingConfig = {
  slackConfigured: boolean;
  teamsConfigured: boolean;
};

export const getMissionMessagingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { missionId: string }) =>
    z.object({ missionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<MissionMessagingConfig> => {
    const { supabase } = context;
    const { data: m } = await supabase
      .from("missions")
      .select("slack_webhook_url,teams_webhook_url")
      .eq("id", data.missionId)
      .maybeSingle();
    return {
      slackConfigured: !!(m as any)?.slack_webhook_url,
      teamsConfigured: !!(m as any)?.teams_webhook_url,
    };
  });
