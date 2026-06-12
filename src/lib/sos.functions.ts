import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SEVERITIES = ["watch", "at_risk", "blocked"] as const;
export type SosSeverity = (typeof SEVERITIES)[number];

const SosInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid().nullable().optional(),
  severity: z.enum(SEVERITIES),
  body: z.string().trim().min(20).max(4000),
});

export const raiseSOS = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SosInput.parse(i))
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

    let questionTitle: string | null = null;
    if (data.questionId) {
      const { data: q } = await supabaseAdmin
        .from("mission_questions")
        .select("question_text,question_number")
        .eq("id", data.questionId)
        .maybeSingle();
      if (q) questionTitle = `Q${q.question_number ?? ""}: ${q.question_text ?? ""}`.trim();
    }

    // Step 1 — save SOS update
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("team_updates" as any)
      .insert({
        mission_id: data.missionId,
        question_id: data.questionId ?? null,
        sender_id: userId,
        sender_name: senderName,
        update_type: "sos",
        severity: data.severity,
        body: data.body,
        resolved: false,
        metadata: { question_title: questionTitle },
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    const sosId = (inserted as unknown as { id: string }).id;

    // Step 2 — escalate question health
    if (data.questionId && (data.severity === "at_risk" || data.severity === "blocked")) {
      await supabaseAdmin
        .from("mission_questions")
        .update({ health_status: "at_risk" } as never)
        .eq("id", data.questionId);
    }

    // Step 3 — notify leadership
    const { data: members } = await supabaseAdmin
      .from("mission_team_members")
      .select("member_id,mission_role")
      .eq("mission_id", data.missionId);

    const leaders = (members ?? []).filter((m) => {
      const role = (m.mission_role ?? "").toLowerCase();
      return role === "admin" || /engagement|lead|principal|administrator/.test(role);
    });
    const notifyMessage = `SOS from ${senderName} — ${data.severity.toUpperCase()}: ${data.body.slice(0, 100)}`;
    if (leaders.length) {
      await supabaseAdmin.from("atlas_notifications").insert(
        leaders.map((l) => ({
          recipient_id: l.member_id,
          recipient_role: l.mission_role ?? "admin",
          type: "sos",
          message: notifyMessage,
          metadata: {
            mission_id: data.missionId,
            question_id: data.questionId ?? null,
            severity: data.severity,
            sos_id: sosId,
            urgent: true,
          },
        })),
      );
    }

    // Step 4 — IRIS evaluation
    let irisAck = `IRIS is monitoring an SOS raised by ${senderName} (${data.severity.toUpperCase()}). Leadership has been alerted.`;
    let escalationPath = "Engagement Lead and Mission Administrators";
    let recommendedActions: string[] = [];
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                  "You are IRIS. A team member just raised an SOS escalation. Evaluate it, determine the recommended escalation path, and draft a brief acknowledgment to be posted in Mission Pulse. Return ONLY valid JSON, no markdown.",
              },
              {
                role: "user",
                content: `Mission: ${missionName}. Sender: ${senderName}. Severity: ${data.severity}. Description: ${data.body}. Question context: ${questionTitle ?? "Mission-level (no specific question)"}. Return JSON: { "escalation_path": "who needs to act", "recommended_actions": ["max 3 short strings"], "iris_acknowledgment": "max 200 chars for Mission Pulse" }`,
              },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (res.ok) {
          const j = await res.json();
          const txt = j.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(txt);
          if (typeof parsed.iris_acknowledgment === "string") irisAck = parsed.iris_acknowledgment.slice(0, 200);
          if (typeof parsed.escalation_path === "string") escalationPath = parsed.escalation_path;
          if (Array.isArray(parsed.recommended_actions)) {
            recommendedActions = parsed.recommended_actions.slice(0, 3).map(String);
          }
        }
      }
    } catch (e) {
      console.error("[sos] AI evaluation failed", e);
    }

    // Step 5 — Mission Pulse acknowledgment
    await supabaseAdmin.from("team_updates" as any).insert({
      mission_id: data.missionId,
      sender_id: null,
      sender_name: "IRIS",
      update_type: "sos_acknowledgment",
      body: irisAck,
      metadata: { sos_id: sosId, escalation_path: escalationPath, recommended_actions: recommendedActions },
    });

    // Oracle Intelligence Feed
    await supabaseAdmin.from("intelligence_feed_items").insert({
      mission_id: data.missionId,
      category: "mission_risk",
      headline: `SOS raised by ${senderName}: ${data.body.slice(0, 60)}`,
      summary: data.body,
      iris_relevance_score: 95,
      iris_assessment: `Immediate leadership attention required. Severity: ${data.severity}.`,
    });

    return { ok: true, irisAcknowledgment: irisAck, escalationPath, recommendedActions };
  });
