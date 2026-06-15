import { supabase } from "@/integrations/supabase/client";

export type AssistEventType =
  | "brief_opened"
  | "brief_exported"
  | "assist_acknowledged"
  | "assist_ignored"
  | "feedback_submitted"
  | "sos_raised"
  | "status_updated";

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
}
