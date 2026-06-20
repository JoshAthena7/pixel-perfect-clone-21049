import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Forward-only status order for lead writers.
const STATUS_ORDER = [
  "not_started",
  "briefed",
  "in_progress",
  "internal_review",
  "red_team",
  "gold_team",
  "mock_scored",
  "revising",
  "finalized",
] as const;
export type ProgressStatus = (typeof STATUS_ORDER)[number];

export function nextStatuses(current: string | null, pensDown: boolean): ProgressStatus[] {
  if (pensDown) return ["revising", "finalized"];
  const idx = STATUS_ORDER.indexOf((current ?? "not_started") as ProgressStatus);
  if (idx < 0) return ["briefed", "in_progress"];
  return STATUS_ORDER.slice(idx + 1);
}

// 4-pill writer UI maps to these underlying DB statuses.
export const SIMPLE_STATUSES = ["not_started", "drafting", "in_review", "finalized"] as const;
export type SimpleStatus = (typeof SIMPLE_STATUSES)[number];
const SIMPLE_TO_DB: Record<SimpleStatus, ProgressStatus> = {
  not_started: "not_started",
  drafting: "in_progress",
  in_review: "internal_review",
  finalized: "finalized",
};
export function dbToSimple(status: string | null): SimpleStatus {
  switch (status) {
    case "not_started": return "not_started";
    case "briefed":
    case "in_progress": return "drafting";
    case "internal_review":
    case "red_team":
    case "gold_team":
    case "mock_scored":
    case "revising": return "in_review";
    case "finalized": return "finalized";
    default: return "not_started";
  }
}

const UpdateStatusInput = z.object({
  progressId: z.string().uuid(),
  newStatus: z.enum([...STATUS_ORDER, ...SIMPLE_STATUSES] as unknown as [string, ...string[]]),
  pensDown: z.boolean().default(false),
  allowBackward: z.boolean().default(false),
});

export const updateProgressStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("question_progress")
      .select("id, status, assignee_id, question_id, mission_id")
      .eq("id", data.progressId)
      .maybeSingle();
    if (error || !row) throw new Error("Progress row not found");
    if (row.assignee_id !== userId) throw new Error("Not your question");

    // Translate simplified UI value → DB status.
    const resolved = (SIMPLE_TO_DB as Record<string, ProgressStatus>)[data.newStatus]
      ?? (data.newStatus as ProgressStatus);

    if (!data.allowBackward) {
      const allowed = nextStatuses(row.status, data.pensDown);
      if (!allowed.includes(resolved)) {
        // Permit no-op or simplified moves within the same simple bucket.
        if (dbToSimple(row.status) !== dbToSimple(resolved)) {
          throw new Error(`Cannot move from ${row.status} to ${resolved}`);
        }
      }
    } else if (data.pensDown && !["revising", "finalized"].includes(resolved)) {
      throw new Error("Pens down — only Revising or Finalized allowed.");
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("question_progress")
      .update({
        status: resolved,
        status_changed_at: now,
        status_changed_by: userId,
        last_activity_at: now,
      } as never)
      .eq("id", data.progressId);
    if (updErr) throw updErr;

    await supabase
      .from("mission_questions")
      .update({ status: resolved } as never)
      .eq("id", row.question_id);

    await supabase.from("mission_assist_events").insert({
      mission_id: row.mission_id,
      question_id: row.question_id,
      user_id: userId,
      event_type: "status_updated",
      metadata: { from: row.status, to: resolved } as never,
    });
    return { ok: true };
  });
