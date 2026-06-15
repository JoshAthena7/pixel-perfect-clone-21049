/**
 * Loads all signals for a mission's questions, runs the pure health engine,
 * and writes the resulting state + timestamp back to mission_questions.
 *
 * Shared by:
 *   - the on-demand server fn recalcMissionHealth (called by the UI hook)
 *   - the daily cron route /api/public/hooks/atlas-daily-health-recalc
 *
 * SECURITY: callers MUST authorize before invoking. This helper uses the
 * admin client so RLS doesn't block reads/writes — it is server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateQuestionHealth, type QuestionHealthInputs } from "./healthEngine";

const DAY_MS = 1000 * 60 * 60 * 24;

export interface RecalcOptions {
  /** Only recompute questions whose health_calculated_at IS NULL (set by triggers). */
  onlyStale?: boolean;
  /** Hard cap on number of questions touched per run (cron safety). */
  limit?: number;
}

export async function recalculateMissionHealth(
  supabase: SupabaseClient,
  missionId: string,
  opts: RecalcOptions = {},
): Promise<{ processed: number; states: Record<string, number>; errors: number }> {
  const states: Record<string, number> = { healthy: 0, watch: 0, at_risk: 0 };
  let processed = 0;
  let errors = 0;

  const { data: mission } = await supabase
    .from("missions")
    .select("id, submission_deadline, status")
    .eq("id", missionId)
    .maybeSingle();
  if (!mission) return { processed, states, errors };

  // Internal review milestone (first one of that type)
  const { data: milestone } = await supabase
    .from("mission_milestones")
    .select("milestone_date")
    .eq("mission_id", missionId)
    .ilike("milestone_type", "%internal%review%")
    .eq("is_active", true)
    .order("milestone_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Pulse domain staleness (>14 days since latest entry)
  const { data: pulseRows } = await supabase
    .from("mission_pulse_updates")
    .select("domain, created_at")
    .eq("mission_id", missionId);
  const now = Date.now();
  const latestByDomain = new Map<string, number>();
  for (const r of (pulseRows ?? []) as any[]) {
    const t = new Date(r.created_at).getTime();
    if (!latestByDomain.has(r.domain) || latestByDomain.get(r.domain)! < t) {
      latestByDomain.set(r.domain, t);
    }
  }
  const stalePulseDomains = Array.from(latestByDomain.values()).filter(
    (t) => (now - t) / DAY_MS > 14,
  ).length;

  let q = supabase
    .from("mission_questions")
    .select(
      "id, mission_id, section_id, due_date, iris_brief_status, iris_brief_generated_at, health_calculated_at",
    )
    .eq("mission_id", missionId)
    .eq("is_withdrawn", false);
  if (opts.onlyStale) q = q.is("health_calculated_at", null);
  if (opts.limit) q = q.limit(opts.limit);

  const { data: questions } = await q;
  if (!questions || questions.length === 0) {
    return { processed, states, errors };
  }

  const submissionDays = mission.submission_deadline
    ? Math.floor((new Date(mission.submission_deadline).getTime() - now) / DAY_MS)
    : 999;
  const internalReviewDays = milestone?.milestone_date
    ? Math.floor((new Date(milestone.milestone_date).getTime() - now) / DAY_MS)
    : submissionDays - 7;

  // Coherence per section
  const sectionIds = Array.from(
    new Set(questions.map((q: any) => q.section_id).filter(Boolean)),
  );
  const coherenceBySection = new Map<string, string>();
  if (sectionIds.length > 0) {
    const { data: secs } = await supabase
      .from("mission_sections")
      .select("id, coherence_status")
      .in("id", sectionIds);
    for (const s of (secs ?? []) as any[]) {
      coherenceBySection.set(s.id, s.coherence_status ?? "unreviewed");
    }
  }

  for (const q of questions as any[]) {
    try {
      // Lead writer progress row
      const { data: progress } = await supabase
        .from("question_progress")
        .select(
          "status, acceptance_status, writer_confidence, assigned_at, accepted_at, brief_opened_at, brief_exported_at, last_activity_at, mock_score, max_score, sme_assigned",
        )
        .eq("question_id", q.id)
        .eq("role", "lead_writer")
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Latest mock score from feedback if progress.mock_score is null
      let mockScore: number | null = progress?.mock_score ?? null;
      let maxScore = progress?.max_score ?? 100;
      if (mockScore === null) {
        const { data: latestMock } = await supabase
          .from("question_feedback")
          .select("mock_score, max_score, created_at")
          .eq("question_id", q.id)
          .eq("review_cycle", "mock_score")
          .not("mock_score", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestMock?.mock_score != null) {
          mockScore = Number(latestMock.mock_score);
          maxScore = Number(latestMock.max_score ?? 100);
        }
      }

      const { count: openFeedbackCount } = await supabase
        .from("question_feedback")
        .select("id", { count: "exact", head: true })
        .eq("question_id", q.id)
        .eq("status", "open");

      const { count: sosCount } = await supabase
        .from("mission_assist_events")
        .select("id", { count: "exact", head: true })
        .eq("question_id", q.id)
        .eq("event_type", "sos_raised");

      const briefAge = q.iris_brief_generated_at
        ? Math.floor((now - new Date(q.iris_brief_generated_at).getTime()) / DAY_MS)
        : null;

      const inputs: QuestionHealthInputs = {
        questionId: q.id,
        missionId,
        daysUntilSubmission: submissionDays,
        daysUntilInternalReview: internalReviewDays,
        briefStatus: (q.iris_brief_status ?? "pending") as QuestionHealthInputs["briefStatus"],
        briefAgeInDays: briefAge,
        briefOpened: !!progress?.brief_opened_at,
        briefExported: !!progress?.brief_exported_at,
        progressStatus: progress?.status ?? "not_started",
        acceptanceStatus: progress?.acceptance_status ?? "pending",
        assignedAt: progress?.assigned_at ? new Date(progress.assigned_at) : null,
        acceptedAt: progress?.accepted_at ? new Date(progress.accepted_at) : null,
        writerConfidence: progress?.writer_confidence ?? null,
        smeAssigned: progress?.sme_assigned ?? false,
        lastActivityAt: progress?.last_activity_at ? new Date(progress.last_activity_at) : null,
        mockScore,
        maxScore,
        openFeedbackCount: openFeedbackCount ?? 0,
        coherenceStatus: coherenceBySection.get(q.section_id) ?? "unreviewed",
        stalePulseDomains,
        sosRaised: (sosCount ?? 0) > 0,
      };

      const result = calculateQuestionHealth(inputs);

      await supabase
        .from("mission_questions")
        .update({
          health_status: result.state,
          health_calculated_at: result.calculatedAt.toISOString(),
        })
        .eq("id", q.id);

      states[result.state] = (states[result.state] ?? 0) + 1;
      processed += 1;
    } catch (err) {
      console.error(`[health] question ${q.id} failed`, err);
      errors += 1;
    }
  }

  return { processed, states, errors };
}
