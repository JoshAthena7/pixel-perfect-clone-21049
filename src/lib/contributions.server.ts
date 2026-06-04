// Server-only helper for recording writer contributions to the immutable
// event log. Safe to call from any createServerFn handler. Failures are
// swallowed + logged so they never block the user-facing action.
//
// Usage:
//   import { recordContribution } from "@/lib/contributions.server";
//   await recordContribution({
//     authUserId: userId,
//     missionId,
//     eventType: "question_answered",
//     targetTable: "question_records",
//     targetId: questionId,
//     idempotencyKey: `answer:${questionId}:${userId}:v1`,
//     payload: { topic_category, word_count },
//   });

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ContributionEvent =
  | "question_answered"
  | "question_reviewed"
  | "source_uploaded"
  | "section_contributed"
  | "score_submitted";

export interface RecordContributionInput {
  authUserId: string;
  email?: string | null;
  displayName?: string | null;
  missionId?: string | null;
  firmId?: string | null;
  eventType: ContributionEvent;
  targetTable?: string;
  targetId?: string;
  weight?: number;
  payload?: Record<string, unknown>;
  /** Stable key. e.g. `answer:{questionId}:{writerId}:v1`. Re-inserts are no-ops. */
  idempotencyKey: string;
  source?: "live" | "backfill_v1" | "manual";
  occurredAt?: string;
}

/**
 * Records a contribution event. Resolves (or creates) the writer identity
 * first via the resolve_writer_identity() SQL function, then inserts into
 * public.contributions. Idempotent on `idempotency_key`.
 *
 * Returns true on success (or no-op insert), false on a logged failure.
 */
export async function recordContribution(
  input: RecordContributionInput,
): Promise<boolean> {
  try {
    const { data: writerId, error: resolveErr } = await supabaseAdmin.rpc(
      "resolve_writer_identity" as never,
      {
        _auth_user_id: input.authUserId,
        _email: input.email ?? null,
        _display_name: input.displayName ?? null,
      } as never,
    );
    if (resolveErr || !writerId) {
      console.warn("[contributions] resolve failed", resolveErr?.message);
      return false;
    }

    const { error: insertErr } = await supabaseAdmin
      .from("contributions" as never)
      .insert({
        writer_id: writerId,
        mission_id: input.missionId ?? null,
        firm_id: input.firmId ?? null,
        event_type: input.eventType,
        target_table: input.targetTable ?? null,
        target_id: input.targetId ?? null,
        weight: input.weight ?? 1.0,
        payload: input.payload ?? {},
        source: input.source ?? "live",
        idempotency_key: input.idempotencyKey,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
      } as never);

    if (insertErr) {
      // Unique-violation on idempotency_key = duplicate event, treat as success.
      if (insertErr.code === "23505") return true;
      console.warn("[contributions] insert failed", insertErr.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[contributions] unexpected error", err);
    return false;
  }
}
