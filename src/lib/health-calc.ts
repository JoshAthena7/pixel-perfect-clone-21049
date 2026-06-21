import { supabase } from "@/integrations/supabase/client";
import { differenceInHours, differenceInDays } from "date-fns";

export type HealthStatus = "healthy" | "watch" | "at_risk";

type QRow = {
  id: string;
  due_date: string | null;
  health_status: string | null;
  is_withdrawn: boolean | null;
  question_number: string;
  updated_at: string | null;
};

type ARow = {
  question_id: string;
  acceptance_status: string | null;
  writer_confidence: string | null;
  assigned_at: string | null;
  assigned_writer_id: string | null;
};

type Transition = {
  questionId: string;
  questionNumber: string;
  writerId: string | null;
  from: HealthStatus | null;
  to: HealthStatus;
  daysToDue: number | null;
};

function calc(q: QRow, a: ARow | undefined, hasSme: boolean): HealthStatus {
  let h: HealthStatus = "healthy";
  const now = new Date();
  const due = q.due_date ? new Date(q.due_date) : null;
  const days = due ? differenceInDays(due, now) : null;
  const updated = q.updated_at ? new Date(q.updated_at) : null;
  const hoursSinceUpdate = updated ? differenceInHours(now, updated) : null;

  // Due date
  if (!due) h = worst(h, "watch");
  else if (days !== null && days < 0) h = worst(h, "at_risk");
  else if (days !== null && days <= 7) {
    if (!a?.writer_confidence || a.writer_confidence !== "high") h = worst(h, "at_risk");
  } else if (days !== null && days <= 14) {
    if (a?.acceptance_status === "pending") h = worst(h, "watch");
  }

  // Assignment
  // Unassigned questions are NOT at_risk — they're just unstarted. Only
  // genuinely flagged assignments (need_help / need_sme / capacity_concern /
  // long-pending acceptance) earn an at_risk / watch escalation.
  if (a) {
    if (a.acceptance_status === "capacity_concern") h = worst(h, "watch");
    else if (a.acceptance_status === "need_help" && !hasSme) h = worst(h, "at_risk");
    else if ((a as any).acceptance_status === "need_sme" && !hasSme) h = worst(h, "at_risk");
    else if (
      a.acceptance_status === "pending" &&
      a.assigned_at &&
      differenceInHours(now, new Date(a.assigned_at)) > 48
    )
      h = worst(h, "at_risk");
  }

  // Activity
  if (
    hoursSinceUpdate !== null &&
    hoursSinceUpdate > 72 &&
    days !== null &&
    days <= 14 &&
    h === "healthy"
  )
    h = "watch";

  return h;
}

function rank(s: HealthStatus): number {
  return s === "at_risk" ? 2 : s === "watch" ? 1 : 0;
}
function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  return rank(a) >= rank(b) ? a : b;
}

export async function runHealthCalculation(missionId: string): Promise<{
  updated: number;
  transitions: Transition[];
}> {
  const [{ data: qs }, { data: asgs }, { data: smes }] = await Promise.all([
    supabase
      .from("mission_questions")
      .select("id, due_date, health_status, is_withdrawn, question_number, updated_at")
      .eq("mission_id", missionId)
      .eq("is_withdrawn", false),
    supabase
      .from("mission_assignments")
      .select("id, question_id, acceptance_status, writer_confidence, assigned_at, assigned_writer_id")
      .eq("mission_id", missionId),
    supabase.from("mission_assignment_smes").select("assignment_id"),
  ]);

  const questions = (qs ?? []) as QRow[];
  const assignments = (asgs ?? []) as (ARow & { id: string })[];
  const smeSet = new Set((smes ?? []).map((s: any) => s.assignment_id));

  const transitions: Transition[] = [];
  let updated = 0;
  for (const q of questions) {
    const a = assignments.find((x) => x.question_id === q.id);
    const hasSme = a ? smeSet.has(a.id) : false;
    const next = calc(q, a, hasSme);
    const due = q.due_date ? new Date(q.due_date) : null;
    const days = due ? differenceInDays(due, new Date()) : null;

    if (next !== q.health_status) {
      await supabase
        .from("mission_questions")
        .update({ health_status: next, health_calculated_at: new Date().toISOString() })
        .eq("id", q.id);
      updated++;
      const from = (q.health_status as HealthStatus | null) ?? null;
      // Escalation triggers
      if (
        (from === "healthy" && next === "watch") ||
        (from === "watch" && next === "at_risk") ||
        (from === null && next !== "healthy")
      ) {
        transitions.push({
          questionId: q.id,
          questionNumber: q.question_number,
          writerId: a?.assigned_writer_id ?? null,
          from,
          to: next,
          daysToDue: days,
        });
      }
    }
  }

  // Emit escalation notifications with duplicate prevention
  if (transitions.length) {
    const mission = await supabase
      .from("missions")
      .select("name")
      .eq("id", missionId)
      .single();
    const missionName = mission.data?.name ?? "this mission";

    // Engagement leads (atlas member ids)
    const leads = await supabase
      .from("mission_team_members")
      .select("member_id, mission_role")
      .eq("mission_id", missionId)
      .eq("mission_role", "engagement_lead");
    const leadIds = (leads.data ?? []).map((l: any) => l.member_id);

    for (const t of transitions) {
      const recipients: string[] = [];
      let message = "";
      const daysTxt = t.daysToDue === null ? "soon" : `${t.daysToDue} day${t.daysToDue === 1 ? "" : "s"}`;
      if (t.to === "watch") {
        if (t.writerId) recipients.push(t.writerId);
        message = `IRIS Alert: Your assignment ${t.questionNumber} is now Watch status. Due in ${daysTxt}. Review your progress.`;
      } else if (t.to === "at_risk") {
        if (t.writerId) recipients.push(t.writerId);
        recipients.push(...leadIds);
        message = `IRIS Alert: ${t.questionNumber} is At Risk. Immediate attention needed. Due in ${daysTxt}.`;
        // Trigger an at-risk Athena Insight (fire and forget).
        try {
          const { buildAthenaInsight } = await import("@/lib/athena-insights.functions");
          (buildAthenaInsight as any)({ data: { missionId, type: "at_risk", question_id: t.questionId } })
            .catch((e: unknown) => console.error("[at-risk insight] failed", t.questionId, e));
        } catch (e) {
          console.error("[at-risk insight] import failed", e);
        }
      }
      for (const rId of Array.from(new Set(recipients))) {
        // dup check
        const { data: existing } = await supabase
          .from("atlas_notifications")
          .select("id")
          .eq("type", "iris_alert")
          .eq("recipient_id", rId)
          .eq("is_read", false)
          .contains("metadata", { question_id: t.questionId })
          .limit(1);
        if (existing && existing.length > 0) continue;
        await supabase.from("atlas_notifications").insert({
          recipient_id: rId,
          recipient_role: "specific_user",
          type: "iris_alert",
          message,
          metadata: { mission_id: missionId, question_id: t.questionId },
        });
      }
    }
  }

  return { updated, transitions };
}
