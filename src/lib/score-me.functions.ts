import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { IRIS_BASE_PROMPT } from "./iris-prompts";

const SCORE_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_score",
    description: "Emit IRIS scoring analysis for the response.",
    parameters: {
      type: "object",
      properties: {
        score: { type: "number", description: "Decimal score 1.0-5.0, to one decimal place." },
        score_context: { type: "string", description: "One-sentence plain-language summary of why this score." },
        reasons: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              explanation: { type: "string", description: "2-3 sentences, specific, referenced to RFP or intel." },
              type: { type: "string", enum: ["gap", "strength", "compliance", "positioning"] },
            },
            required: ["label", "explanation", "type"],
            additionalProperties: false,
          },
        },
        changes: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              what: { type: "string" },
              where: { type: "string" },
              suggested_language: { type: "string", description: "Exact text to add or replace — not a template." },
              why: { type: "string" },
              estimated_points: { type: "number" },
            },
            required: ["label", "what", "where", "suggested_language", "why", "estimated_points"],
            additionalProperties: false,
          },
        },
        projected_score: { type: "number", description: "Estimated score after all 3 changes." },
        sources_used: { type: "array", items: { type: "string" } },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        confidence_note: { type: "string", description: "If medium/low, explain why. Empty if high." },
      },
      required: ["score", "score_context", "reasons", "changes", "projected_score", "sources_used", "confidence", "confidence_note"],
      additionalProperties: false,
    },
  },
};

async function callScoreEngine(system: string, user: string): Promise<any | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5",
      messages: [
        { role: "system", content: `${IRIS_BASE_PROMPT}\n\n${system}` },
        { role: "user", content: user },
      ],
      tools: [SCORE_TOOL],
      tool_choice: { type: "function", function: { name: "emit_score" } },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Score engine failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  return JSON.parse(args);
}

export const scoreResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      questionId: z.string().uuid(),
      responseText: z.string().min(50).max(40000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: q } = await supabase
      .from("question_records")
      .select("id,mission_id,question_number,title,question_text,requirements,mandatory_language,scoring_criteria,page_limit,evaluation_weight")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!q) throw new Error("Question not found");

    const { data: mission } = await supabase
      .from("missions")
      .select("name,client,state,program_type,focus_areas,win_themes,priority_topics,competitors")
      .eq("id", q.mission_id)
      .maybeSingle();

    const [{ data: themes }, { data: dnaRow }, { data: memories }] = await Promise.all([
      supabase.from("win_themes" as any).select("title,key_message").eq("mission_id", q.mission_id).eq("status", "active"),
      supabase.from("mission_intelligence_dna").select("dna").eq("mission_id", q.mission_id).eq("is_current", true).maybeSingle(),
      supabase.from("iris_memories").select("title,content,scope")
        .eq("importance", "critical")
        .or(`scope.eq.global,mission_id.eq.${q.mission_id}`)
        .is("archived_at", null)
        .limit(20),
    ]);

    const dna = (dnaRow?.dna ?? {}) as any;

    const userMsg = `QUESTION ${q.question_number} — ${q.title}
${q.question_text}

EVALUATION CRITERIA: ${q.scoring_criteria ?? "(not specified)"}
MANDATORY REQUIREMENTS: ${(q.mandatory_language ?? []).join("; ") || "(none listed)"}
REQUIREMENTS: ${(q.requirements ?? []).join("; ") || "(none listed)"}
PAGE LIMIT: ${q.page_limit ?? "—"} pages
EVALUATION WEIGHT: ${q.evaluation_weight ?? "—"}% of total score

MISSION CONTEXT:
State: ${mission?.state ?? "—"}
Client: ${mission?.client ?? "—"}
Program: ${mission?.program_type ?? "—"}
Focus areas: ${(mission?.focus_areas ?? []).join("; ") || "(none)"}
Win themes (mission): ${(mission?.win_themes ?? []).join("; ") || "(none)"}
Priority topics: ${(mission?.priority_topics ?? []).join("; ") || "(none)"}
Known competitors: ${(mission?.competitors ?? []).join("; ") || "(none)"}

MISSION WIN THEMES:
${(themes ?? []).map((t: any) => `- ${t.title}${t.key_message ? `: ${t.key_message}` : ""}`).join("\n") || "(none defined)"}

EVALUATOR INTELLIGENCE / PROCUREMENT SIGNALS:
${typeof dna?.procurement_signals === "string" ? dna.procurement_signals : JSON.stringify(dna?.procurement_signals ?? dna?.evaluator_signals ?? "(none)").slice(0, 1500)}

COMPETITIVE CONTEXT:
${typeof dna?.competitive_context === "string" ? dna.competitive_context : JSON.stringify(dna?.competitive_context ?? "(none)").slice(0, 1500)}

CRITICAL INSTITUTIONAL KNOWLEDGE (non-negotiable firm standards):
${(memories ?? []).map((m: any) => `- ${m.title}: ${String(m.content).slice(0, 400)}`).join("\n") || "(none)"}

THE RESPONSE TO SCORE:
"""
${data.responseText}
"""`;

    const sys = `You are IRIS — the proposal scoring engine for Atlas, built by Athena Strategy Group. You are a senior proposal evaluator with 20 years of experience scoring Medicaid managed care RFP responses for state governments.

SCORING SCALE:
  5.0 = Exceptional. Exceeds all criteria. Top-percentile evaluator score.
  4.5 = Meets Athena Standard. Competitive and complete.
  4.0 = Strong but missing specific elements that cost points.
  3.5 = Solid foundation. Significant gaps in specificity or compliance.
  3.0 = Addresses the question but generic, incomplete, or missing mandatory elements.
  < 3.0 = Material gaps that evaluators will penalize.

Be precise. Score to one decimal place (e.g. 3.4, 4.1, 4.7). Never round to a whole number unless the response genuinely deserves exactly that.

CRITICAL INSTRUCTIONS:
- Never be vague. Every gap must reference a specific RFP requirement or evaluator signal.
- Suggested language must be usable as-is or with minimal editing — actual text, not a template.
- Always include at least one strength among the reasons.
- The three changes MUST be ranked by score impact — highest impact first.
- Never suggest more than 3 changes — prioritize ruthlessly.
- If mandatory_language is absent from the response, this MUST be Change 1 regardless of other factors.
- Reference IRIS Memory critical entries — if the response violates a critical memory, this MUST appear in reasons.
- Use estimated_points to convey the projected lift per change. Sum should be close to (projected_score - score).
- Set confidence to "high" only when you have substantive procurement signals, win themes, and critical memory to compare against. Otherwise "medium" or "low" with a reason.`;

    const analysis = await callScoreEngine(sys, userMsg);
    if (!analysis) {
      throw new Error("IRIS could not score this response (check LOVABLE_API_KEY).");
    }

    // Clamp + sanitise
    const score = Math.max(1, Math.min(5, Number(analysis.score) || 0));
    const projected = Math.max(score, Math.min(5, Number(analysis.projected_score) || score));

    const { data: inserted } = await supabase
      .from("score_me_history")
      .insert({
        mission_id: q.mission_id,
        question_id: q.id,
        scored_by: userId,
        response_text: data.responseText,
        score,
        projected_score: projected,
        full_analysis: analysis,
      })
      .select("id,created_at")
      .maybeSingle();

    return {
      id: inserted?.id ?? null,
      created_at: inserted?.created_at ?? new Date().toISOString(),
      score,
      projected_score: projected,
      score_context: String(analysis.score_context ?? ""),
      reasons: Array.isArray(analysis.reasons) ? analysis.reasons : [],
      changes: Array.isArray(analysis.changes) ? analysis.changes.slice(0, 3) : [],
      sources_used: Array.isArray(analysis.sources_used) ? analysis.sources_used : [],
      confidence: (analysis.confidence ?? "medium") as "high" | "medium" | "low",
      confidence_note: String(analysis.confidence_note ?? ""),
      question: {
        id: q.id,
        question_number: q.question_number,
        title: q.title,
        page_limit: q.page_limit,
        evaluation_weight: q.evaluation_weight,
      },
    };
  });

export const listScoreHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("score_me_history")
      .select("id,score,projected_score,created_at,scored_by")
      .eq("question_id", data.questionId)
      .order("created_at", { ascending: false })
      .limit(10);
    return { rows: rows ?? [] };
  });

export const listMissionScoreHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("score_me_history")
      .select("id,question_id,score,projected_score,created_at,scored_by")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { rows: rows ?? [] };
  });
