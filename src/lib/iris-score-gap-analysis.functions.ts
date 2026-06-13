// IRIS Score-Me → Gap Analysis Loop
// Takes a Score Me coaching result for a question and writes gap/risk
// insights to IRIS Memory (insights + signals) so future missions surface
// the same weaknesses earlier.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const ScoreResultSchema = z
  .object({
    overall_score: z.number(),
    dimension_scores: z.record(z.string(), z.number()).optional(),
    feedback: z.string().optional(),
    gaps: z.array(z.string()).optional(),
    strengths: z.array(z.string()).optional(),
  })
  .passthrough();

const Input = z.object({
  mission_id: z.string().uuid(),
  question_id: z.string().uuid(),
  question_text: z.string().max(8000).optional(),
  answer_text: z.string().max(60000).optional(),
  score_result: ScoreResultSchema,
});

export type ScoreGapResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  gaps_written: number;
  insights_written: number;
  overall_score: number;
};

export const irisScoreGapAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Supa;
    return runScoreGapAnalysis(supabase, data);
  });

const BatchInput = z.object({ mission_id: z.string().uuid() });

export const batchExtractMissionScoreGaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BatchInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as Supa;
    const userId = context.userId as string;

    const { data: canManage } = await supabase.rpc("has_mission_role", {
      _mission_id: data.mission_id,
      _user_id: userId,
      _roles: ["admin", "lead", "owner", "engagement_lead"],
    });
    if (!canManage) throw new Error("Only mission leads or admins can run batch score-gap extraction.");

    // Pull most recent score_me_history per question for this mission.
    const { data: rows } = await supabase
      .from("score_me_history")
      .select("question_id, score, full_analysis, created_at")
      .eq("mission_id", data.mission_id)
      .order("created_at", { ascending: false });

    const seen = new Set<string>();
    const latest: Array<{ question_id: string; score: number; full_analysis: any }> = [];
    for (const r of (rows ?? []) as any[]) {
      if (!r.question_id || seen.has(r.question_id)) continue;
      seen.add(r.question_id);
      latest.push({ question_id: r.question_id, score: Number(r.score) || 0, full_analysis: r.full_analysis });
    }

    let processed = 0;
    let gapsTotal = 0;
    const errors: string[] = [];

    for (const r of latest) {
      try {
        const fa = (r.full_analysis ?? {}) as Record<string, unknown>;
        const sr = {
          overall_score: Number(fa.overall_score ?? r.score) || 0,
          feedback: typeof fa.iris_verdict === "string" ? (fa.iris_verdict as string) : "",
          gaps: [
            ...(Array.isArray(fa.what_needs_work) ? (fa.what_needs_work as string[]) : []),
            ...(Array.isArray(fa.compliance_flags) ? (fa.compliance_flags as string[]) : []),
            ...(typeof fa.the_one_fix === "string" && fa.the_one_fix ? [fa.the_one_fix as string] : []),
          ],
          strengths: Array.isArray(fa.what_lands) ? (fa.what_lands as string[]) : [],
        };
        const res = await runScoreGapAnalysis(supabase, {
          mission_id: data.mission_id,
          question_id: r.question_id,
          score_result: sr,
        });
        if (!res.skipped) {
          processed += 1;
          gapsTotal += res.gaps_written;
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return {
      total_questions: latest.length,
      processed,
      gaps_written: gapsTotal,
      errors: errors.slice(0, 5),
    };
  });

// ---- core ----

async function runScoreGapAnalysis(
  supabase: Supa,
  data: z.infer<typeof Input>,
): Promise<ScoreGapResult> {
  const sr = data.score_result;
  const raw = Number(sr.overall_score);
  if (!Number.isFinite(raw)) {
    return { ok: false, skipped: true, reason: "no_score", gaps_written: 0, insights_written: 0, overall_score: 0 };
  }
  // Accept both 1-10 (ScoreMeResult) and 0-100 inputs; normalize to 0-100.
  const score100 = raw <= 10 ? Math.round(raw * 10) : Math.round(raw);

  const questionTag = `q_${data.question_id.slice(0, 8)}`;
  const lowScoreTag = "score_gap";

  // Question text for context
  let questionText = data.question_text ?? "";
  if (!questionText) {
    const { data: q } = await supabase
      .from("mission_questions")
      .select("question_text, question_number")
      .eq("id", data.question_id)
      .maybeSingle();
    questionText = (q as any)?.question_text ?? "";
  }
  const ctx = questionText ? ` (Q: ${questionText.slice(0, 140)})` : "";

  // Existing insights for dedupe
  const { data: existing } = await supabase
    .from("insights")
    .select("id, content, tags")
    .eq("mission_id", data.mission_id)
    .contains("tags", [questionTag])
    .limit(200);
  const existingContents = ((existing ?? []) as any[]).map((r) => String(r.content ?? ""));

  const confidenceFor = (n: number): "high" | "medium" | "low" => {
    // Inverted: lower score = more certain it's a gap.
    if (n < 50) return "low"; // per spec
    if (n <= 70) return "medium";
    return "high";
  };

  const rows: Array<Record<string, unknown>> = [];
  let gapsWritten = 0;

  const pushIfNovel = (content: string, type: string, extraTags: string[]) => {
    const clean = content.trim();
    if (!clean) return false;
    if (isDuplicate(clean, existingContents) || isDuplicate(clean, rows.map((r) => String(r.content)))) {
      return false;
    }
    rows.push({
      mission_id: data.mission_id,
      insight_type: type,
      content: clean.slice(0, 2000),
      source: "score_me_gap",
      confidence: confidenceFor(score100),
      tags: Array.from(new Set([lowScoreTag, questionTag, ...extraTags])).slice(0, 20),
    });
    return true;
  };

  // a) explicit gaps
  for (const g of sr.gaps ?? []) {
    if (pushIfNovel(`${g}${ctx}`, "risk", ["gap"])) gapsWritten += 1;
  }

  // b) low overall
  if (score100 < 70) {
    pushIfNovel(
      `Answer scored ${score100}/100 — needs significant improvement before submission.${ctx}`,
      "risk",
      ["low_score", "needs_revision"],
    );
  }

  // c) weak dimensions
  const dims = sr.dimension_scores ?? {};
  for (const [dim, val] of Object.entries(dims)) {
    const v = Number(val);
    if (!Number.isFinite(v)) continue;
    const v100 = v <= 10 ? v * 10 : v;
    if (v100 < 60) {
      pushIfNovel(`Weak on ${dim}: ${Math.round(v100)}/100.${ctx}`, "approach", ["weak_dimension", dim.toLowerCase().replace(/\s+/g, "_")]);
    }
  }

  let insightsWritten = 0;
  if (rows.length > 0) {
    const { error } = await supabase.from("insights").insert(rows);
    if (!error) insightsWritten = rows.length;
    else console.error("[iris-score-gap] insights insert failed", error);
  }

  // d) summary signal
  try {
    await supabase.from("signals").insert({
      mission_id: data.mission_id,
      source_module: "score_me_gap",
      signal_type: "score_result",
      signal_title: `Score Me: ${score100}/100`,
      signal_summary: JSON.stringify({
        overall_score: score100,
        gaps_count: (sr.gaps ?? []).length,
        strengths_count: (sr.strengths ?? []).length,
        feedback: (sr.feedback ?? "").slice(0, 400),
      }),
      severity: score100 < 50 ? "warning" : "info",
      confidence: score100 < 50 ? 0.9 : score100 < 70 ? 0.7 : 0.5,
      status: "active",
      created_by_system: true,
      related_question_id: data.question_id,
      tags: [lowScoreTag, questionTag],
    });
  } catch (e) {
    console.error("[iris-score-gap] signal insert failed", e);
  }

  // Fire-and-forget mirror into intel_events for the entity-first feed.
  try {
    const { writeIntelEvent, writeIntelEvents } = await import("@/lib/intel-events-writer");
    writeIntelEvent({
      mission_id: data.mission_id,
      event_type: "score_gap",
      title: `Score Me: ${score100}/100`,
      content: (sr.feedback ?? "").slice(0, 1000) || `Overall ${score100}/100 — ${(sr.gaps ?? []).length} gap(s).`,
      confidence: score100 < 50 ? "high" : score100 < 70 ? "medium" : "low",
      generated_by: "iris_score_gap",
      tags: ["score_gap", lowScoreTag, questionTag],
    });
    if (rows.length > 0) {
      writeIntelEvents(
        rows.map((r) => ({
          mission_id: data.mission_id,
          event_type: "score_gap",
          title: String((r as { content?: string }).content ?? "").slice(0, 200),
          content: String((r as { content?: string }).content ?? ""),
          confidence: ((r as { confidence?: string }).confidence as "high" | "medium" | "low") ?? "medium",
          generated_by: "iris_score_gap",
          tags: Array.isArray((r as { tags?: string[] }).tags) ? (r as { tags: string[] }).tags : ["score_gap"],
        })),
      );
    }
  } catch (e) {
    console.error("[iris-score-gap] intel_events mirror failed", e);
  }

  // e) mark question as extracted
  try {
    await supabase
      .from("mission_questions")
      .update({ iris_extracted: true, iris_extracted_at: new Date().toISOString() })
      .eq("id", data.question_id);
  } catch (e) {
    console.error("[iris-score-gap] mark extracted failed", e);
  }

  return {
    ok: true,
    gaps_written: gapsWritten,
    insights_written: insightsWritten,
    overall_score: score100,
  };
}

// ---- helpers ----

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function isDuplicate(candidate: string, others: string[]): boolean {
  const ct = tokenize(candidate);
  for (const o of others) {
    if (jaccard(ct, tokenize(o)) > 0.7) return true;
  }
  return false;
}
