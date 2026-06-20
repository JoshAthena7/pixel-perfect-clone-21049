import { supabase } from "@/integrations/supabase/client";

export type AssistEventType =
  | "brief_opened"
  | "brief_exported"
  | "assist_acknowledged"
  | "assist_ignored"
  | "feedback_submitted"
  | "sos_raised"
  | "sos_acknowledged"
  | "sos_dismissed"
  | "status_updated"
  | "check_in"
  | "mock_scored"
  | "score_me_run"
  | "confidence_updated"
  | "pulse_posted"
  | "sticky_note_posted"
  | "nudge_sent"
  | "writer_reviewed"
  | "writer_flagged";

/**
 * Logs a writer/leader behavior event to mission_assist_events.
 *
 * The DB trigger mae_health_trigger automatically:
 *  - updates question_progress.last_activity_at / brief_opened_at / brief_exported_at
 *  - flags mission_questions.health_calculated_at = NULL so the next
 *    useQuestionHealthRefresh (mount or focus) recomputes health.
 *
 * Wire at these moments:
 *  - brief_opened       → writer views the question brief
 *  - brief_exported     → writer clicks Export Brief
 *  - sos_raised         → writer marks themselves "Need Help"
 *  - status_updated     → writer or leader changes question_progress.status
 *  - assist_acknowledged → writer checks the Briefed checkbox
 *  - feedback_submitted → reviewer submits a question_feedback record
 *
 * NEVER include proposal text in metadata. Metadata is for routing only.
 */
export async function fireAssistEvent(
  missionId: string,
  questionId: string | null,
  userId: string | null,
  eventType: AssistEventType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  let uid = userId;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? null;
  }
  if (!uid) {
    console.warn("[fireAssistEvent] skipped — no user", eventType);
    return;
  }
  const { error } = await supabase.from("mission_assist_events").insert({
    mission_id: missionId,
    question_id: questionId,
    user_id: uid,
    event_type: eventType,
    metadata: metadata as any,
  });
  if (error) {
    // Don't throw — assist events are observability, not blocking UX.
    console.error("[fireAssistEvent] failed", eventType, error);
  }

  // Fan out to oracle_signal_feedback so the learning loop sees writer
  // behavior. Best-effort, non-blocking — wrapped in a promise we never
  // await on the critical path. Only fires for events tied to a question
  // (the feedback table is per-signal, joined via question_intel_links).
  if (questionId) {
    (async () => {
      try {
        const { recordFeedbackForLinkedSignals } = await import("@/lib/oracle-feedback");
        if (eventType === "brief_opened") {
          await recordFeedbackForLinkedSignals(questionId, missionId, "brief_used", { userId: uid });
        } else if (eventType === "brief_exported") {
          await recordFeedbackForLinkedSignals(questionId, missionId, "exported", { userId: uid });
        } else if (eventType === "assist_ignored" && metadata?.tool === "decode") {
          await recordFeedbackForLinkedSignals(questionId, missionId, "brief_ignored", { userId: uid });
        } else if (eventType === "confidence_updated" || eventType === "check_in") {
          const conf = String(metadata?.confidence ?? "").toLowerCase();
          if (conf === "high") {
            await recordFeedbackForLinkedSignals(questionId, missionId, "confidence_high", { userId: uid });
          } else if (conf === "low") {
            await recordFeedbackForLinkedSignals(questionId, missionId, "confidence_low", { userId: uid });
          }
        }
      } catch (err) {
        console.warn("[fireAssistEvent] feedback fan-out failed (non-fatal)", err);
      }
    })();
  }
}
