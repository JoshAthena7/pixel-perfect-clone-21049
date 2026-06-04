// Daily writer pulse — submit + fetch context for /home widget.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordContribution } from "@/lib/contributions.server";

const HEDGING_PATTERNS = [
  /\bi think\b/i,
  /\bprobably\b/i,
  /\bshould be fine\b/i,
  /\balmost there\b/i,
  /\bi hope\b/i,
  /\bmaybe\b/i,
  /\bkind of\b/i,
  /\bsort of\b/i,
  /\btrying to\b/i,
];

function scoreHedging(text: string | null | undefined): number {
  if (!text) return 0;
  let n = 0;
  for (const p of HEDGING_PATTERNS) if (p.test(text)) n += 1;
  return Math.min(n, 5);
}

const SubmitInput = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid().nullable().optional(),
  progress: z.number().int().min(1).max(4),
  blocked: z.boolean(),
  blockedReason: z.string().max(500).nullable().optional(),
  confidence: z.number().int().min(1).max(5),
  note: z.string().max(500).nullable().optional(),
});

export const submitPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const hedging = scoreHedging(`${data.note ?? ""} ${data.blockedReason ?? ""}`);

    const { error } = await supabase.from("question_pulses").insert({
      mission_id: data.missionId,
      question_id: data.questionId ?? null,
      writer_auth_user_id: userId,
      progress: data.progress,
      blocked: data.blocked,
      blocked_reason: data.blockedReason ?? null,
      confidence: data.confidence,
      note: data.note ?? null,
      hedging_score: hedging,
    });
    if (error) throw new Error(error.message);

    await recordContribution({
      authUserId: userId,
      missionId: data.missionId,
      eventType: "score_submitted",
      targetTable: "question_pulses",
      targetId: data.questionId ?? undefined,
      idempotencyKey: `pulse:${userId}:${data.missionId}:${data.questionId ?? "mission"}:${new Date().toISOString().slice(0, 10)}`,
      payload: { progress: data.progress, confidence: data.confidence, blocked: data.blocked, hedging },
    });

    return { ok: true, hedging };
  });

export type PulseContext = {
  assignments: Array<{
    questionId: string;
    missionId: string;
    questionNumber: string | null;
    title: string;
    missionName: string;
    submittedToday: boolean;
  }>;
  lastPulseAt: string | null;
};

export const getMyPulseContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PulseContext> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const todayKey = new Date().toISOString().slice(0, 10);

    const { data: qs } = await supabase
      .from("question_records")
      .select("id,mission_id,question_number,title,missions(name)")
      .or(`assigned_writer_id.eq.${userId},assigned_sme_id.eq.${userId}`)
      .limit(25);

    const rows = (qs ?? []) as Array<{
      id: string; mission_id: string; question_number: string | null; title: string;
      missions: { name: string } | null;
    }>;

    const qIds = rows.map((r) => r.id);
    let submittedSet = new Set<string>();
    let lastPulseAt: string | null = null;
    if (qIds.length > 0) {
      const { data: pulses } = await supabase
        .from("question_pulses")
        .select("question_id,submitted_at")
        .eq("writer_auth_user_id", userId)
        .gte("submitted_at", `${todayKey}T00:00:00Z`);
      for (const p of (pulses ?? []) as Array<{ question_id: string | null; submitted_at: string }>) {
        if (p.question_id) submittedSet.add(p.question_id);
        if (!lastPulseAt || p.submitted_at > lastPulseAt) lastPulseAt = p.submitted_at;
      }
    }

    return {
      assignments: rows.map((r) => ({
        questionId: r.id,
        missionId: r.mission_id,
        questionNumber: r.question_number,
        title: r.title,
        missionName: r.missions?.name ?? "Mission",
        submittedToday: submittedSet.has(r.id),
      })),
      lastPulseAt,
    };
  });
