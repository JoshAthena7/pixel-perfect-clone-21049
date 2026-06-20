/**
 * Core mission-lesson extraction logic.
 *
 * Pure server-only helper. Uses the service-role client so it can be invoked
 * from privileged contexts: admin server fn, mission-close server fn, and the
 * mission-closed webhook fired by the DB trigger.
 *
 * Never import this file from a route or *.functions.ts at module scope.
 */
import { callAI } from "@/lib/model-router.server";
import { generateEmbedding, toPgVector } from "@/lib/embeddings.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LessonExtractionResult = {
  extracted: number;
  missionId: string;
  reason?: string;
};

export async function runLessonExtraction(
  missionId: string,
): Promise<LessonExtractionResult> {
  const { data: mission } = await supabaseAdmin
    .from("missions")
    .select("name, state_code, metadata")
    .eq("id", missionId)
    .maybeSingle();
  if (!mission) return { extracted: 0, missionId, reason: "mission not found" };

  const [{ data: scores }, { data: feedback }, { data: config }] = await Promise.all([
    supabaseAdmin
      .from("score_me_history")
      .select("score, full_analysis, question_id")
      .eq("mission_id", missionId)
      .order("score", { ascending: false }),
    supabaseAdmin
      .from("oracle_signal_feedback")
      .select("feedback_type, weight, oracle_signal_id")
      .eq("mission_id", missionId),
    supabaseAdmin
      .from("oracle_engagement_config")
      .select("win_themes, evaluator_lens")
      .eq("mission_id", missionId)
      .maybeSingle(),
  ]);

  if ((scores?.length ?? 0) === 0 && (feedback?.length ?? 0) === 0) {
    return { extracted: 0, missionId, reason: "insufficient data" };
  }

  let extracted = 0;
  const highScores =
    (scores ?? []).filter((s: { score?: number | null }) => (s.score ?? 0) >= 4) ?? [];

  if (highScores.length >= 3) {
    const m = mission as { name?: string | null; state_code?: string | null };
    const c = config as { win_themes?: unknown } | null;
    const patternDescription = await callAI(
      "lesson_extraction",
      `You are ORACLE learning from a completed Medicaid RFP mission. ` +
        `Extract a reusable pattern about what made proposal sections score high. ` +
        `Be specific to Medicaid managed care procurement. ` +
        `Return a single clear pattern statement in 2-3 sentences.`,
      `Mission: ${m.name ?? "(unnamed)"}. State: ${m.state_code ?? "?"}.\n` +
        `High-scoring section analyses: ${highScores
          .slice(0, 5)
          .map((s) => {
            const a = (s as { full_analysis?: unknown }).full_analysis;
            return typeof a === "string"
              ? a.substring(0, 200)
              : JSON.stringify(a ?? "").substring(0, 200);
          })
          .join(" | ")}.\n` +
        `Win themes: ${JSON.stringify((c?.win_themes ?? []) as unknown[]).slice(0, 600)}.\n` +
        `What pattern made these sections score high?`,
    ).catch((err) => {
      console.warn("[lessons] AI extraction failed", err);
      return "";
    });

    if (patternDescription.trim()) {
      const embedding = await generateEmbedding(patternDescription);
      const { error: insErr } = await supabaseAdmin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("atlas_institutional_memory" as any)
        .insert({
          pattern_type: "scoring_correlation",
          pattern_description: patternDescription.trim(),
          applicable_states: m.state_code ? [m.state_code] : [],
          applicable_procurement_types: ["medicaid_managed_care"],
          extracted_from_mission_id: missionId,
          extraction_method: "mission_close",
          confidence_score: Math.min(0.9, 0.5 + highScores.length / 10),
          supporting_evidence: highScores
            .slice(0, 5)
            .map((s: { question_id?: string | null; score?: number | null }) => ({
              question_id: s.question_id,
              score: s.score,
            })) as never,
          embedding: embedding ? (toPgVector(embedding) as unknown) : null,
        } as never);
      if (insErr) console.warn("[lessons] insert failed", insErr.message);
      else extracted += 1;
    }
  }

  return { extracted, missionId };
}
