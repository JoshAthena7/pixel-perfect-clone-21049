/**
 * Client-safe helper to record human feedback on an oracle signal.
 *
 * RLS allows any authenticated user to INSERT. Reads/updates of source
 * quality go through dedicated RPCs so writers don't need direct access
 * to oracle_source_registry.
 *
 * Non-blocking, non-throwing — feedback recording must never break the
 * primary UX (an Approve click, a brief view, a check-in, etc.).
 */
import { supabase } from "@/integrations/supabase/client";

export type SignalFeedbackType =
  | "approved"
  | "pushed"
  | "dismissed"
  | "brief_used"
  | "brief_ignored"
  | "high_score_correlation"
  | "low_score_correlation"
  | "human_validated"
  | "exported"
  | "confidence_high"
  | "confidence_low";

const DEFAULT_WEIGHTS: Record<SignalFeedbackType, number> = {
  approved: 0.5,
  pushed: 0.8,
  dismissed: -0.5,
  brief_used: 0.1,
  brief_ignored: -0.05,
  high_score_correlation: 0.6,
  low_score_correlation: -0.4,
  human_validated: 0.7,
  exported: 0.3,
  confidence_high: 0.2,
  confidence_low: -0.1,
};

export async function recordSignalFeedback(
  signalId: string,
  missionId: string | null,
  feedbackType: SignalFeedbackType,
  options: {
    weight?: number;
    userId?: string | null;
    questionId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    let uid = options.userId ?? null;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
    }
    const weight = options.weight ?? DEFAULT_WEIGHTS[feedbackType];

    const { error } = await supabase.from("oracle_signal_feedback").insert({
      oracle_signal_id: signalId,
      mission_id: missionId,
      question_id: options.questionId ?? null,
      feedback_type: feedbackType,
      weight,
      source_user_id: uid,
      metadata: (options.metadata ?? {}) as never,
    });
    if (error) console.warn("[oracle-feedback] insert failed", feedbackType, error.message);

    // Source-performance update (best-effort, non-blocking)
    if (feedbackType === "approved" || feedbackType === "pushed" || feedbackType === "dismissed") {
      const { data: sig } = await supabase
        .from("oracle_signals")
        .select("source_name")
        .eq("id", signalId)
        .maybeSingle();
      const sourceName = (sig as { source_name?: string | null } | null)?.source_name;
      if (sourceName) {
        const rpc =
          feedbackType === "dismissed"
            ? "increment_source_dismissals"
            : "increment_source_approvals";
        await (supabase.rpc as unknown as (n: string, p: Record<string, unknown>) => Promise<{ error: unknown }>)(
          rpc,
          { p_source_name: sourceName },
        ).catch((err: unknown) => console.warn(`[oracle-feedback] ${rpc} failed`, err));
      }
    }
  } catch (err) {
    console.warn("[oracle-feedback] threw (non-fatal)", err);
  }
}

/**
 * Bulk write feedback for a list of signals linked to a question — used
 * by fireAssistEvent for brief_opened / assist_ignored / confidence_*.
 */
export async function recordFeedbackForLinkedSignals(
  questionId: string,
  missionId: string,
  feedbackType: SignalFeedbackType,
  options: { userId?: string | null } = {},
): Promise<number> {
  try {
    const { data: links } = await supabase
      .from("question_intel_links")
      .select("signal_id")
      .eq("question_id", questionId);
    const ids = (links ?? [])
      .map((l) => (l as { signal_id?: string | null }).signal_id)
      .filter((x): x is string => !!x);
    if (ids.length === 0) return 0;
    await Promise.all(
      ids.map((sid) =>
        recordSignalFeedback(sid, missionId, feedbackType, {
          userId: options.userId ?? null,
          questionId,
        }),
      ),
    );
    return ids.length;
  } catch (err) {
    console.warn("[oracle-feedback] linked-feedback failed (non-fatal)", err);
    return 0;
  }
}
