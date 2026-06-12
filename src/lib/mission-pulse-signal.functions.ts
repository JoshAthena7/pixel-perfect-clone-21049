import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const SIGNAL_TYPES = [
  "risk_alert",
  "new_intelligence",
  "client_signal",
  "blocker",
  "opportunity",
  "resource_concern",
  "decision_needed",
  "observation",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

const SubmitInput = z.object({
  missionId: z.string().uuid(),
  signalType: z.enum(SIGNAL_TYPES),
  body: z.string().trim().min(1).max(4000),
});

const ListInput = z.object({ missionId: z.string().uuid() });

export type TeamUpdateRow = {
  id: string;
  mission_id: string;
  question_id: string | null;
  sender_id: string | null;
  sender_name: string;
  update_type: string;
  body: string;
  metadata: unknown;
  created_at: string;
};


const IRIS_TYPES = new Set([
  "iris_response",
  "oracle_finding",
  "deadline_reminder",
  "health_change",
  "emerging_risk",
  "mission_announcement",
]);

export const listMissionPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("team_updates" as never)
      .select("*")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const all = (rows ?? []) as unknown as TeamUpdateRow[];
    const iris = all.filter((r) => IRIS_TYPES.has(r.update_type) || r.sender_name === "IRIS");
    const team = all.filter((r) => !iris.includes(r));

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const todayCount = all.filter((r) => r.created_at >= since).length;

    return { iris, team, todayCount };
  });

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "been", "will",
  "about", "into", "they", "them", "their", "there", "what", "when", "where",
  "which", "would", "should", "could", "after", "before", "while", "team",
  "mission", "iris", "need", "needs", "really", "very", "just", "also",
  "some", "more", "than", "then", "your", "ours", "able",
]);

function extractTopic(body: string): string | null {
  const words = body
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best: string | null = null;
  let bestC = 0;
  for (const [w, c] of counts) if (c > bestC) { best = w; bestC = c; }
  return best;
}

const SIGNAL_TO_TYPE: Record<SignalType, string> = {
  risk_alert: "risk_alert",
  new_intelligence: "new_intelligence",
  client_signal: "client_signal",
  blocker: "blocker",
  opportunity: "opportunity",
  resource_concern: "resource_concern",
  decision_needed: "decision_needed",
  observation: "observation",
};

export const submitMissionSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SubmitInput.parse(i))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name,email")
      .eq("id", userId)
      .maybeSingle();
    const senderName = prof?.display_name || prof?.email || "Team member";

    const { data: mission } = await supabaseAdmin
      .from("missions")
      .select("name")
      .eq("id", data.missionId)
      .maybeSingle();
    const missionName = mission?.name ?? "this mission";

    const updateType = SIGNAL_TO_TYPE[data.signalType];

    const { data: inserted, error } = await supabaseAdmin
      .from("team_updates" as never)
      .insert({
        mission_id: data.missionId,
        question_id: null,
        sender_id: userId,
        sender_name: senderName,
        update_type: updateType,
        body: data.body,
        metadata: { signal_type: data.signalType },
      })
      .select("*")
      .single();
    if (error) throw error;

    // Log to signal_patterns
    const topic = extractTopic(data.body);
    await supabaseAdmin.from("signal_patterns" as never).insert({
      mission_id: data.missionId,
      signal_type: updateType,
      signal_topic: topic,
    });

    // Always notify leadership for risk/blocker
    const leadershipRoles = ["admin", "engagement_lead"];
    const forceLeadership =
      data.signalType === "risk_alert" || data.signalType === "blocker";

    // Call AI gateway for routing classification
    let notifyRoles: string[] = [];
    let publicResponse: string | null = null;
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "raw",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "You are IRIS. A team member just submitted a mission-level signal. Classify it, determine who needs to know, and decide if you should respond publicly in the Mission Pulse feed. Return ONLY valid JSON, no markdown.",
              },
              {
                role: "user",
                content: `Mission: ${missionName}. Signal type: ${data.signalType}. Signal body: ${data.body}. Sender: ${senderName}. Return JSON: { "priority": "high|medium|low", "notify_roles": ["admin"|"engagement_lead"|"pm"|"all"], "should_respond_publicly": boolean, "public_response": "max 200 chars if should_respond_publicly", "internal_note": "for logging" }`,
              },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (aiRes.ok) {
          const j = await aiRes.json();
          const txt = j.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(txt);
          if (Array.isArray(parsed.notify_roles)) notifyRoles = parsed.notify_roles;
          if (parsed.should_respond_publicly && typeof parsed.public_response === "string") {
            publicResponse = parsed.public_response.slice(0, 200);
          }
        }
      }
    } catch (e) {
      console.error("[mission-pulse] AI routing failed", e);
    }

    const rolesToNotify = new Set<string>(notifyRoles);
    if (forceLeadership) leadershipRoles.forEach((r) => rolesToNotify.add(r));

    if (rolesToNotify.size > 0) {
      // Look up mission team members
      const { data: members } = await supabaseAdmin
        .from("mission_team_members")
        .select("member_id, mission_role")
        .eq("mission_id", data.missionId);

      const recipients = (members ?? []).filter((m) => {
        if (rolesToNotify.has("all")) return true;
        return rolesToNotify.has(m.mission_role);
      });

      if (recipients.length > 0) {
        await supabaseAdmin.from("atlas_notifications").insert(
          recipients.map((r) => ({
            recipient_id: r.member_id,
            recipient_role: r.mission_role ?? "member",
            type: "mission_pulse_signal",
            message: `${senderName}: ${data.body.slice(0, 160)}`,
            metadata: {
              mission_id: data.missionId,
              signal_type: data.signalType,
              update_id: (inserted as { id?: string })?.id,
            },
          })),
        );
      }
    }

    if (publicResponse) {
      await supabaseAdmin.from("team_updates" as never).insert({
        mission_id: data.missionId,
        sender_id: null,
        sender_name: "IRIS",
        update_type: "iris_response",
        body: publicResponse,
        metadata: { in_response_to: (inserted as { id?: string })?.id },
      });
    }

    // Pattern detection
    const since48 = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("team_updates" as never)
      .select("update_type, body")
      .eq("mission_id", data.missionId)
      .gte("created_at", since48);

    const recentRows = (recent ?? []) as unknown as Array<{ update_type: string; body: string }>;
    const typeCounts = new Map<string, number>();
    for (const r of recentRows) typeCounts.set(r.update_type, (typeCounts.get(r.update_type) ?? 0) + 1);

    const topicCounts = new Map<string, number>();
    for (const r of recentRows) {
      const t = extractTopic(r.body);
      if (t) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
    let trendingTopic: string | null = null;
    for (const [t, c] of topicCounts) if (c >= 3) { trendingTopic = t; break; }

    const triggerEmerging =
      (typeCounts.get("risk_alert") ?? 0) >= 3 ||
      (typeCounts.get("blocker") ?? 0) >= 2 ||
      trendingTopic !== null;

    if (triggerEmerging) {
      // Throttle: only one emerging_risk in the last 6h
      const since6 = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabaseAdmin
        .from("team_updates" as never)
        .select("id")
        .eq("mission_id", data.missionId)
        .eq("update_type", "emerging_risk")
        .gte("created_at", since6)
        .limit(1);

      if (!existing || existing.length === 0) {
        const topic = trendingTopic ?? (typeCounts.get("blocker") ?? 0) >= 2 ? "blockers" : "risk areas";
        const count = trendingTopic
          ? topicCounts.get(trendingTopic)
          : Math.max(typeCounts.get("risk_alert") ?? 0, typeCounts.get("blocker") ?? 0);
        const bodyText = `Emerging pattern detected: ${count} team members have flagged concerns about ${topic} in the past 48 hours. Leadership review recommended.`;

        await supabaseAdmin.from("team_updates" as never).insert({
          mission_id: data.missionId,
          sender_id: null,
          sender_name: "IRIS",
          update_type: "emerging_risk",
          body: bodyText,
          metadata: { topic, count },
        });

        const { data: leads } = await supabaseAdmin
          .from("mission_team_members")
          .select("member_id, mission_role")
          .eq("mission_id", data.missionId)
          .in("mission_role", leadershipRoles);

        if (leads && leads.length > 0) {
          await supabaseAdmin.from("atlas_notifications").insert(
            leads.map((l) => ({
              recipient_id: l.member_id,
              recipient_role: l.mission_role ?? "admin",
              type: "emerging_risk",
              message: bodyText,
              metadata: { mission_id: data.missionId, topic },
            })),
          );
        }

        await supabaseAdmin.from("intelligence_feed_items").insert({
          mission_id: data.missionId,
          category: "mission_risk",
          headline: `Emerging pattern: ${topic}`,
          summary: bodyText,
          iris_relevance_score: 90,
          iris_assessment: "Multiple mission signals converging on the same concern.",
        });
      }
    }

    return { ok: true };
  });
