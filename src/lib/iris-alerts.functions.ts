/**
 * IRIS Alerts — actionable triage flags for the mission lead.
 *
 * Gathers current mission state and asks the Lovable AI gateway to surface
 * up to 6 specific, urgent flags. Returns structured alert objects ready to
 * render in the ATC right column.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PM_ROLES = ["admin", "lead", "engagement_lead", "project_manager"];

export type IrisAlert = {
  urgency: "critical" | "warning" | "info";
  text: string;
  action_label: string;
  action_target: string; // "flight_deck" | "checkin" | "question:<id>" | "writer:<id>"
};

async function assertPm(supabase: any, userId: string, missionId: string) {
  const { data: adminRow } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (adminRow) return;
  const { data: m } = await supabase
    .from("mission_team_members").select("mission_role")
    .eq("member_id", userId).eq("mission_id", missionId).maybeSingle();
  if (!m || !PM_ROLES.includes(m.mission_role)) {
    throw new Error("Forbidden: IRIS Alerts is admin / EL / PM only");
  }
}

export const generateIrisAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { missionId: string }) =>
    z.object({ missionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ alerts: IrisAlert[]; generatedAt: string; error?: string }> => {
    const { supabase, userId } = context;
    await assertPm(supabase, userId, data.missionId);
    const missionId = data.missionId;
    const now = Date.now();

    const [missionRes, questionsRes, progressRes, assignRes, teamRes, sosRes, briefExportRes] = await Promise.all([
      supabase.from("missions").select("id,name,submission_deadline").eq("id", missionId).maybeSingle(),
      supabase.from("mission_questions")
        .select("id,question_number,health_status,iris_brief_status,is_withdrawn")
        .eq("mission_id", missionId).eq("is_withdrawn", false),
      supabase.from("question_progress")
        .select("question_id,assignee_id,last_activity_at,updated_at")
        .eq("mission_id", missionId),
      supabase.from("mission_assignments")
        .select("question_id,assigned_writer_id")
        .eq("mission_id", missionId),
      supabase.from("mission_team_members")
        .select("member_id,mission_role").eq("mission_id", missionId)
        .in("mission_role", ["writer", "lead_writer", "sme", "reviewer"]),
      supabase.from("mission_assist_events")
        .select("question_id,created_at").eq("mission_id", missionId)
        .eq("event_type", "sos_raised")
        .gte("created_at", new Date(now - 4 * 3600_000).toISOString()),
      supabase.from("mission_assist_events")
        .select("id").eq("mission_id", missionId)
        .eq("event_type", "brief_exported"),
    ]);

    const mission = missionRes.data;
    const questions = questionsRes.data ?? [];
    const progress = progressRes.data ?? [];
    const assigns = assignRes.data ?? [];
    const team = teamRes.data ?? [];

    // Profiles
    const memberIds = team.map((t: any) => t.member_id);
    const { data: profiles } = await supabase.from("profiles")
      .select("id,display_name,email").in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const profById: Record<string, any> = {};
    for (const p of (profiles ?? []) as any[]) profById[p.id] = p;

    // Build per-writer last activity
    const lastByUser: Record<string, string> = {};
    for (const p of progress) {
      if (!p.assignee_id) continue;
      const t = p.last_activity_at || p.updated_at;
      if (!t) continue;
      if (!lastByUser[p.assignee_id] || t > lastByUser[p.assignee_id]) lastByUser[p.assignee_id] = t;
    }
    const writersNoActivity24h: { id: string; name: string }[] = [];
    for (const m of team) {
      const last = lastByUser[m.member_id];
      const hrs = last ? (now - new Date(last).getTime()) / 3600_000 : null;
      if (hrs == null || hrs > 24) {
        const p = profById[m.member_id];
        writersNoActivity24h.push({
          id: m.member_id,
          name: p?.display_name || p?.email?.split("@")[0] || "Team member",
        });
      }
    }

    // Questions with no writer assigned
    const assignedQids = new Set<string>();
    for (const p of progress) if (p.assignee_id) assignedQids.add(p.question_id);
    for (const a of assigns) if (a.assigned_writer_id) assignedQids.add(a.question_id);
    const unassignedCount = questions.filter((q: any) => !assignedQids.has(q.id)).length;

    // At-risk with no check-in in 48h
    const lastByQ: Record<string, string> = {};
    for (const p of progress) {
      const t = p.last_activity_at || p.updated_at;
      if (!t) continue;
      if (!lastByQ[p.question_id] || t > lastByQ[p.question_id]) lastByQ[p.question_id] = t;
    }
    const atRiskStaleQNums: string[] = [];
    for (const q of questions) {
      if (q.health_status !== "at_risk") continue;
      const last = lastByQ[q.id];
      const hrs = last ? (now - new Date(last).getTime()) / 3600_000 : null;
      if (hrs == null || hrs > 48) atRiskStaleQNums.push(q.question_number);
    }

    // SOS active
    const sosQids = Array.from(new Set((sosRes.data ?? []).map((r: any) => r.question_id).filter(Boolean)));
    const qNumById: Record<string, string> = {};
    for (const q of questions) qNumById[q.id] = q.question_number;
    const sosQNums = sosQids.map((id: any) => qNumById[id] ?? id);

    const totalQ = questions.length;
    const healthyCt = questions.filter((q: any) => q.health_status === "healthy").length;
    const watchCt = questions.filter((q: any) => q.health_status === "watch").length;
    const atRiskCt = questions.filter((q: any) => q.health_status === "at_risk").length;
    const briefsReady = questions.filter((q: any) =>
      ["ready", "complete", "completed"].includes((q.iris_brief_status ?? "").toLowerCase()),
    ).length;

    const deadline = mission?.submission_deadline as string | null | undefined;
    const daysToDeadline = deadline
      ? Math.ceil((new Date(deadline).getTime() - now) / 86400_000)
      : null;

    // Build allow-list of valid action_target values for grounding the model
    const validQIds = questions.map((q: any) => q.id);
    const validWriterIds = team.map((m: any) => m.member_id);

    const userPrompt =
`Mission: ${mission?.name ?? "(unnamed)"}
Submission deadline: ${deadline ?? "not set"} (${daysToDeadline ?? "?"} days)
Total questions: ${totalQ}
Question health: ${healthyCt} healthy, ${watchCt} watch, ${atRiskCt} at risk
Writers with no activity in 24h: ${writersNoActivity24h.length ? writersNoActivity24h.map(w => `${w.name} [id:${w.id}]`).join(", ") : "none"}
Questions with no writer assigned: ${unassignedCount}
Questions at risk with no Check-In in 48h: ${atRiskStaleQNums.length ? atRiskStaleQNums.join(", ") : "none"}
Questions with SOS active: ${sosQNums.length ? sosQNums.join(", ") : "none"}
Briefs ready: ${briefsReady} of ${totalQ}

Question IDs (use these exactly for action_target "question:<id>"): ${validQIds.slice(0, 50).join(", ")}
Writer IDs (use these exactly for action_target "writer:<id>"): ${validWriterIds.join(", ")}

Return a JSON array of up to 6 alert objects. Each object: { "urgency": "critical|warning|info", "text": "one sentence alert", "action_label": "short link label", "action_target": "checkin|question:<id>|writer:<id>|flight_deck" }. If nothing needs attention, return [].`;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { alerts: [], generatedAt: new Date().toISOString(), error: "AI gateway not configured" };
    }

    let alerts: IrisAlert[] = [];
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "raw",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are IRIS, the intelligence guide for an Athena Strategy Group Medicaid RFP mission. You are advising the mission lead. Your job is to surface specific, urgent, actionable flags — things that need a human decision right now. Be direct. Be specific. Name question numbers, people, and deadlines when you have them. Never use filler phrases. Never say 'I noticed' or 'It appears'. Just state the flag and what should be done. Return a JSON array only — no other text.",
            },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) {
        return { alerts: [], generatedAt: new Date().toISOString(), error: `AI gateway ${res.status}` };
      }
      const j = await res.json();
      let txt: string = j.choices?.[0]?.message?.content ?? "[]";
      // Strip optional markdown fences
      txt = txt.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) {
        alerts = parsed.slice(0, 6).map((a: any) => ({
          urgency: ["critical", "warning", "info"].includes(a?.urgency) ? a.urgency : "info",
          text: String(a?.text ?? "").slice(0, 240),
          action_label: String(a?.action_label ?? "Open").slice(0, 32),
          action_target: String(a?.action_target ?? "flight_deck"),
        })).filter(a => a.text);
      }
    } catch (e: any) {
      return { alerts: [], generatedAt: new Date().toISOString(), error: e?.message ?? "parse failed" };
    }

    return { alerts, generatedAt: new Date().toISOString() };
  });
