// NOTE: Draft content is never persisted. This function processes content in memory only. See DPA section 2.1.
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
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              explanation: { type: "string", description: "2-3 sentences, specific, referenced to RFP or intel." },
              type: { type: "string", enum: ["gap", "strength", "compliance", "positioning", "person_first"] },
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
              what: { type: "string", description: "What is missing or weak in the response — identify the gap, do not write the replacement." },
              where: { type: "string" },
              question_for_writer: { type: "string", description: "A question the writer should answer to close the gap. NEVER provide the answer text." },
              why: { type: "string" },
              estimated_points: { type: "number" },
            },
            required: ["label", "what", "where", "question_for_writer", "why", "estimated_points"],
            additionalProperties: false,
          },
        },
        compliance_findings: {
          type: "array",
          description: "Per-requirement compliance status. Required when compliance requirements were provided.",
          items: {
            type: "object",
            properties: {
              requirement_id: { type: "string", description: "Pass through the id provided in the prompt." },
              requirement_source: { type: "string", enum: ["mission", "federal"] },
              status: { type: "string", enum: ["compliant", "partial", "non_compliant", "conflicting", "unknown"] },
              evidence: { type: "string", description: "What in the response was checked." },
              iris_note: { type: "string", description: "Short note explaining the finding." },
            },
            required: ["requirement_id", "requirement_source", "status"],
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

  // Race against a hard timeout so the serverless worker doesn't get killed mid-call.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  async function callModel(model: string) {
    return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${IRIS_BASE_PROMPT}\n\n${system}` },
          { role: "user", content: user },
        ],
        tools: [SCORE_TOOL],
        tool_choice: { type: "function", function: { name: "emit_score" } },
      }),
    });
  }

  try {
    // Use a fast model by default; GPT-5 with tool_choice frequently times out (>30s).
    let res = await callModel("google/gemini-2.5-flash");
    if (!res.ok && (res.status === 429 || res.status >= 500)) {
      res = await callModel("google/gemini-2.5-flash-lite");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Score engine failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as any;
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    return JSON.parse(args);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Score engine timed out after 25s. Try again or shorten the response.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
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

    const [{ data: themes }, { data: dnaRow }, { data: memories }, { data: missionComp }, { data: fedComp }] = await Promise.all([
      supabase.from("win_themes" as any).select("title,key_message").eq("mission_id", q.mission_id).eq("status", "active"),
      supabase.from("mission_intelligence_dna").select("dna").eq("mission_id", q.mission_id).eq("is_current", true).maybeSingle(),
      supabase.from("iris_memories").select("title,content,scope")
        .eq("importance", "critical")
        .or(`scope.eq.global,mission_id.eq.${q.mission_id}`)
        .is("archived_at", null)
        .limit(20),
      supabase.from("compliance_requirements")
        .select("id,source_document,source_kind,section_reference,requirement_text,plain_language,requirement_type,severity")
        .eq("mission_id", q.mission_id)
        .contains("relevant_question_ids", [q.id]),
      supabase.from("federal_compliance_library")
        .select("id,regulation_name,citation,section_text,plain_language,severity,program_types"),
    ]);

    const dna = (dnaRow?.dna ?? {}) as any;

    // Pick applicable federal regs (program match) — limit to most relevant for prompt size
    const program = mission?.program_type;
    const applicableFederal = (fedComp ?? []).filter((f: any) =>
      !program || (f.program_types ?? []).length === 0 || (f.program_types ?? []).includes(program),
    );

    type ComplianceForPrompt = {
      id: string;
      source: "mission" | "federal";
      label: string;
      requirement: string;
      severity: string;
    };
    const missionComplianceList: ComplianceForPrompt[] = (missionComp ?? []).map((m: any) => ({
      id: m.id,
      source: "mission",
      label: `${m.source_document}${m.section_reference ? ` ${m.section_reference}` : ""} [${m.source_kind}]`,
      requirement: m.plain_language ?? m.requirement_text,
      severity: m.severity,
    }));
    const federalComplianceList: ComplianceForPrompt[] = applicableFederal.slice(0, 8).map((f: any) => ({
      id: f.id,
      source: "federal",
      label: `${f.regulation_name} (${f.citation})`,
      requirement: f.plain_language ?? f.section_text,
      severity: f.severity,
    }));
    const allComplianceForPrompt = [...missionComplianceList, ...federalComplianceList];

    const formatCompliance = (items: ComplianceForPrompt[]) =>
      items.length === 0 ? "(none on file)" : items
        .map((c) => `- id=${c.id} [${c.severity}] ${c.label}: ${String(c.requirement).slice(0, 350)}`)
        .join("\n");

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

MODEL CONTRACT + STATE REGULATORY REQUIREMENTS (mission-specific):
${formatCompliance(missionComplianceList)}

FEDERAL REQUIREMENTS (applicable to this program):
${formatCompliance(federalComplianceList)}

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
- Set confidence to "high" only when you have substantive procurement signals, win themes, and critical memory to compare against. Otherwise "medium" or "low" with a reason.

PERSON-FIRST LANGUAGE SCORING (mandatory dimension):
- Evaluate the response for person-first language compliance using the rules in your system prompt.
- If non-person-first terms are found, add a reason with type: "person_first" and label: "PERSON-FIRST LANGUAGE". In the explanation, name each flagged term and provide the person-first alternative.
- Apply a score deduction of −0.1 (one or two minor instances) to −0.3 (multiple instances or terms in critical sections like the opening paragraph or evaluation-criteria responses).
- If non-person-first language appears in critical sections, include a Change with exact replacement language; this Change can be ranked first if its impact exceeds the other gaps.
- State evaluators and CMS reviewers are trained to notice non-person-first language. Its presence signals cultural insensitivity about the population being served and lowers scores on health equity, member experience, and cultural competency sections.

COMPLIANCE CHECKING (mandatory dimension when requirements are present):
For each compliance requirement provided in the prompt (Model Contract, State Regulations, Federal), evaluate the response and emit one entry in compliance_findings with the requirement id (exactly as provided), source ("mission" or "federal"), and one status:
- compliant — response clearly addresses this requirement
- partial — response partially addresses but incompletely
- non_compliant — response does not address this requirement
- conflicting — response makes a commitment that conflicts with this requirement
- unknown — cannot tell from the response alone

Score impact:
- Critical non-compliant: −0.5 per requirement
- Critical conflicting: −0.8 per requirement
- Significant non-compliant: −0.2 per requirement
- Standard non-compliant: −0.1 per requirement

For every non-compliant or conflicting requirement, add a reason with type: "compliance" naming the source and the gap.

Compliance fixes take priority in the changes array. A non-compliant CRITICAL requirement is ALWAYS Change 1 regardless of other factors (above mandatory_language, above person-first). For each compliance change, the suggested_language MUST include the exact text that would make the response compliant — including the specific citation if required language is mandated.`;

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
        score,
        projected_score: projected,
        full_analysis: analysis,
      })
      .select("id,created_at")
      .maybeSingle();

    // Record contributions: a score_submitted event, and a question_answered
    // event keyed on the response so each distinct submission counts once.
    try {
      const { recordContribution } = await import("./contributions.server");
      const runId = inserted?.id ?? `${q.id}:${Date.now()}`;
      await Promise.all([
        recordContribution({
          authUserId: userId,
          missionId: q.mission_id,
          eventType: "score_submitted",
          targetTable: "score_me_history",
          targetId: inserted?.id ?? undefined,
          weight: 1,
          idempotencyKey: `score:${runId}:${userId}`,
          payload: { score, projected_score: projected, question_id: q.id },
        }),
        recordContribution({
          authUserId: userId,
          missionId: q.mission_id,
          eventType: "question_answered",
          targetTable: "question_records",
          targetId: q.id,
          weight: 1,
          idempotencyKey: `answer:${runId}:${userId}`,
          payload: {
            question_number: (q as any).question_number,
            title: (q as any).title,
            word_count: data.responseText.trim().split(/\s+/).length,
            score,
          },
        }),
      ]);
    } catch (e) {
      console.warn("[contributions] score-me wiring failed", e);
    }

    // Persist compliance findings
    const validIds = new Set(allComplianceForPrompt.map((c) => c.id));
    const findings = Array.isArray(analysis.compliance_findings) ? analysis.compliance_findings : [];
    const findingRows = findings
      .filter((f: any) => f?.requirement_id && validIds.has(f.requirement_id))
      .map((f: any) => {
        const ref = allComplianceForPrompt.find((c) => c.id === f.requirement_id);
        return {
          question_id: q.id,
          mission_id: q.mission_id,
          score_me_run_id: inserted?.id ?? null,
          requirement_id: f.requirement_id,
          requirement_source: ref?.source ?? f.requirement_source ?? "mission",
          requirement_snapshot: ref ?? {},
          status: f.status ?? "unknown",
          evidence: String(f.evidence ?? "").slice(0, 2000),
          iris_note: String(f.iris_note ?? "").slice(0, 2000),
        };
      });
    if (findingRows.length > 0) {
      await supabase.from("compliance_check_results").insert(findingRows);
    }

    // Build compliance summary for the UI
    const findingMap = new Map<string, any>();
    for (const f of findings) if (f?.requirement_id) findingMap.set(f.requirement_id, f);
    const complianceSummary = allComplianceForPrompt.map((c) => {
      const f = findingMap.get(c.id);
      return {
        requirement_id: c.id,
        source: c.source,
        label: c.label,
        requirement: c.requirement,
        severity: c.severity,
        status: (f?.status as string) ?? "unknown",
        evidence: f?.evidence ?? "",
        iris_note: f?.iris_note ?? "",
      };
    });

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
      compliance: complianceSummary,
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
