import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_PHASES = [
  "RFP upload",
  "Compliance",
  "Strategy",
  "Writing",
  "SME review",
  "Exec review",
  "Submission",
];

export type CommandBarData = {
  missionId: string;
  health: { score: number | null; color: "green" | "amber" | "red"; label: string; blockers: number; atRisk: number };
  confidence: { score: number | null; trend: number; previous: number | null; updatedAt: string | null };
  focus: { text: string; href: string | null } | null;
  risk: { id: string; title: string; severity: number; action: string | null } | null;
  iris: { unread: number; items: Array<{ id: string; type: string; message: string; created_at: string; metadata: any }> };
  countdown: { submissionAt: string | null; daysRemaining: number | null };
  questions: { complete: number; total: number };
  milestone: { title: string; date: string; ownerName: string | null } | null;
  phases: Array<{ name: string; order: number; status: "done" | "active" | "pending"; owner: string | null }>;
};

function colorFromScore(score: number | null): "green" | "amber" | "red" {
  if (score == null) return "amber";
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}
function labelFromScore(score: number | null): string {
  if (score == null) return "Calibrating";
  if (score >= 70) return "On track";
  if (score >= 40) return "At risk";
  return "Critical";
}

export const getMissionCommandBar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ missionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const missionId = data.missionId;

    const [
      missionRes,
      phasesRes,
      notifRes,
      unreadCountRes,
      riskRes,
      qaRes,
      qaProgressRes,
      milestoneRes,
      myQRes,
      complianceRes,
      approvedHighRiskRes,
    ] = await Promise.all([
      supabase
        .from("missions")
        .select("id, submission_deadline, health_score, confidence_score, confidence_score_trend, confidence_score_updated_at, today_focus, created_at")
        .eq("id", missionId)
        .maybeSingle(),
      supabase
        .from("mission_phases")
        .select("phase_name, phase_order, status, owner")
        .eq("mission_id", missionId)
        .order("phase_order", { ascending: true }),
      supabase
        .from("atlas_notifications")
        .select("id, type, message, created_at, metadata, is_read")
        .eq("metadata->>mission_id", missionId)
        .order("is_read", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("atlas_notifications")
        .select("id", { count: "exact", head: true })
        .eq("metadata->>mission_id", missionId)
        .eq("is_read", false),
      supabase
        .from("oracle_signals")
        .select("id, title, recommended_action, oracle_score, impact_score, urgency_score, status")
        .eq("mission_id", missionId)
        .eq("status", "approved")
        .order("oracle_score", { ascending: false })
        .limit(1),
      supabase
        .from("question_assignments")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId),
      supabase
        .from("question_progress")
        .select("status", { count: "exact" })
        .eq("mission_id", missionId),
      supabase
        .from("mission_milestones")
        .select("title, milestone_type, milestone_date, owner_id")
        .eq("mission_id", missionId)
        .eq("is_active", true)
        .gte("milestone_date", new Date().toISOString().slice(0, 10))
        .order("milestone_date", { ascending: true })
        .limit(1),
      supabase
        .from("question_progress")
        .select("question_id, status")
        .eq("mission_id", missionId)
        .eq("assignee_id", userId)
        .neq("status", "finalized")
        .order("last_activity_at", { ascending: false })
        .limit(1),
      supabase
        .from("compliance_requirements")
        .select("id, status")
        .eq("mission_id", missionId),
      supabase
        .from("oracle_signals")
        .select("id, impact_score", { count: "exact", head: true })
        .eq("mission_id", missionId)
        .eq("status", "approved")
        .gte("impact_score", 70),
    ]);

    const mission = missionRes.data;
    if (!mission) {
      throw new Error("Mission not found");
    }

    // Seed phases if missing
    let phaseRows = phasesRes.data ?? [];
    if (phaseRows.length === 0) {
      const seed = DEFAULT_PHASES.map((name, i) => ({
        mission_id: missionId,
        phase_name: name,
        phase_order: i + 1,
        status: i === 0 ? "active" : "pending",
      }));
      await supabase.from("mission_phases").insert(seed);
      phaseRows = seed.map((s) => ({ phase_name: s.phase_name, phase_order: s.phase_order, status: s.status, owner: null }));
    }

    // Question totals
    const totalQs = qaRes.count ?? 0;
    const progressRows = (qaProgressRes.data as Array<{ status: string }> | null) ?? [];
    const completeQs = progressRows.filter((r) => ["briefed", "finalized", "submitted", "approved"].includes(r.status)).length;
    const totalProgress = qaProgressRes.count ?? progressRows.length;

    // Compliance %
    const compRows = (complianceRes.data as Array<{ status: string }> | null) ?? [];
    const compTotal = compRows.length;
    const compDone = compRows.filter((r) => ["complete", "met", "verified"].includes(r.status)).length;
    const compPct = compTotal > 0 ? compDone / compTotal : 0;

    // Writing %
    const writingPct = totalProgress > 0 ? completeQs / totalProgress : 0;

    // SME %
    const smeAssigned = progressRows.length > 0 ? progressRows.filter((r) => (r as any).sme_assigned).length / progressRows.length : 0;

    // Signal coverage
    const { count: approvedSignalCount } = await supabase
      .from("oracle_signals")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("status", "approved");
    const signalCoverage = Math.min((approvedSignalCount ?? 0) / 20, 1);

    // Timeline health
    let timelineHealth = 0.5;
    if (mission.submission_deadline) {
      const totalMs = new Date(mission.submission_deadline).getTime() - new Date(mission.created_at).getTime();
      const remainingMs = new Date(mission.submission_deadline).getTime() - Date.now();
      if (totalMs > 0) timelineHealth = Math.max(0, Math.min(1, remainingMs / totalMs));
    }

    // Risk penalty
    const highRiskCount = approvedHighRiskRes.count ?? 0;
    const riskPenaltyPct = Math.min(highRiskCount * 2, 10);

    const dataPoints = [compTotal > 0, totalProgress > 0, (approvedSignalCount ?? 0) > 0].filter(Boolean).length;
    let confidenceScore: number | null = null;
    if (dataPoints >= 3) {
      const base =
        compPct * 20 +
        writingPct * 25 +
        smeAssigned * 20 +
        signalCoverage * 15 +
        timelineHealth * 10 +
        10;
      confidenceScore = Math.max(0, Math.min(100, base - riskPenaltyPct));
    }

    // Trend: compare to stored value; if updated >7d ago, recompute trend.
    let trend = Number(mission.confidence_score_trend ?? 0);
    let previous: number | null = mission.confidence_score != null ? Number(mission.confidence_score) : null;
    if (confidenceScore != null) {
      const updatedAt = mission.confidence_score_updated_at ? new Date(mission.confidence_score_updated_at).getTime() : 0;
      const ageDays = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
      if (ageDays >= 7 && previous != null) {
        trend = confidenceScore - previous;
        await supabase
          .from("missions")
          .update({
            confidence_score: confidenceScore,
            confidence_score_trend: trend,
            confidence_score_updated_at: new Date().toISOString(),
          })
          .eq("id", missionId);
      } else if (previous == null) {
        await supabase
          .from("missions")
          .update({
            confidence_score: confidenceScore,
            confidence_score_trend: 0,
            confidence_score_updated_at: new Date().toISOString(),
          })
          .eq("id", missionId);
        trend = 0;
      }
    }

    // Health
    const healthScore = mission.health_score != null ? Number(mission.health_score) : confidenceScore;
    const blockers = highRiskCount;
    const atRisk = (approvedSignalCount ?? 0) - highRiskCount;

    // Focus
    let focus: CommandBarData["focus"] = null;
    const myQRow = (myQRes.data as Array<{ question_id: string }> | null)?.[0];
    if (myQRow) {
      focus = { text: "Continue your next assigned question", href: `/missions/${missionId}/qa` };
    } else if (mission.today_focus) {
      focus = { text: mission.today_focus, href: null };
    } else if ((notifRes.data ?? [])[0]) {
      focus = { text: notifRes.data![0].message, href: `/missions/${missionId}/intelligence` };
    } else if (compTotal === 0 && totalQs === 0) {
      focus = { text: "Building mission intelligence...", href: null };
    }

    // Risk
    let risk: CommandBarData["risk"] = null;
    const riskRow = (riskRes.data as any[] | null)?.[0];
    if (riskRow) {
      risk = {
        id: riskRow.id,
        title: riskRow.title,
        severity: riskRow.oracle_score ?? 0,
        action: riskRow.recommended_action ?? null,
      };
    }

    // Milestone
    let milestone: CommandBarData["milestone"] = null;
    const msRow = (milestoneRes.data as any[] | null)?.[0];
    if (msRow) {
      let ownerName: string | null = null;
      if (msRow.owner_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", msRow.owner_id)
          .maybeSingle();
        ownerName = (prof?.full_name as string) ?? (prof?.email as string) ?? null;
      }
      milestone = {
        title: msRow.title ?? msRow.milestone_type,
        date: msRow.milestone_date,
        ownerName,
      };
    }

    // Countdown
    let daysRemaining: number | null = null;
    if (mission.submission_deadline) {
      const ms = new Date(mission.submission_deadline).getTime() - Date.now();
      daysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
    }

    const result: CommandBarData = {
      missionId,
      health: {
        score: healthScore,
        color: colorFromScore(healthScore),
        label: labelFromScore(healthScore),
        blockers,
        atRisk: Math.max(0, atRisk),
      },
      confidence: {
        score: confidenceScore,
        trend,
        previous: previous != null && confidenceScore != null ? previous : null,
        updatedAt: mission.confidence_score_updated_at,
      },
      focus,
      risk,
      iris: {
        unread: unreadCountRes.count ?? 0,
        items: (notifRes.data ?? []).map((n: any) => ({
          id: n.id,
          type: n.type,
          message: n.message,
          created_at: n.created_at,
          metadata: n.metadata,
        })),
      },
      countdown: { submissionAt: mission.submission_deadline, daysRemaining },
      questions: { complete: completeQs, total: totalQs || totalProgress },
      milestone,
      phases: phaseRows
        .sort((a: any, b: any) => a.phase_order - b.phase_order)
        .map((p: any) => ({
          name: p.phase_name,
          order: p.phase_order,
          status: p.status as "done" | "active" | "pending",
          owner: p.owner,
        })),
    };

    return result;
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ notificationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("atlas_notifications")
      .update({ is_read: true })
      .eq("id", data.notificationId);
    return { ok: true };
  });
