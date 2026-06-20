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

const UpdateStatusInput = z.object({
  progressId: z.string().uuid(),
  newStatus: z.enum(STATUS_ORDER),
  pensDown: z.boolean().default(false),
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

    const allowed = nextStatuses(row.status, data.pensDown);
    if (!allowed.includes(data.newStatus)) {
      throw new Error(`Cannot move from ${row.status} to ${data.newStatus}`);
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("question_progress")
      .update({
        status: data.newStatus,
        status_changed_at: now,
        status_changed_by: userId,
        last_activity_at: now,
      } as never)
      .eq("id", data.progressId);
    if (updErr) throw updErr;

    // Keep mission_questions.status in sync so ATC health calcs / coverage see fresh data.
    await supabase
      .from("mission_questions")
      .update({ status: data.newStatus } as never)
      .eq("id", row.question_id);

    await supabase.from("mission_assist_events").insert({
      mission_id: row.mission_id,
      question_id: row.question_id,
      user_id: userId,
      event_type: "status_updated",
      metadata: { from: row.status, to: data.newStatus } as never,
    });
    return { ok: true };
  });
