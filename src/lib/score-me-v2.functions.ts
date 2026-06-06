// NOTE: Draft content is never persisted. This function processes content in memory only. See DPA section 2.1.
// C2: Every draft is screened for PHI (server-side, fail-closed) BEFORE the AI
// model is called and BEFORE any persistence. PHI-bearing drafts are rejected.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertNoPHI } from "@/lib/phi-detection";
import { buildMissionContext, formatMissionContextBlock } from "@/lib/iris-context.server";

// ---------- Types ----------

export type DimensionStatus = "green" | "yellow" | "red" | "opportunity" | "pending";

export type DimensionFinding = {
  text: string;
  suggestion?: string | null;
  paragraph?: string | null;
};

export type DimensionResult = {
  key:
    | "person_first"
    | "outline_template"
    | "style_guide"
    | "contract_sow"
    | "win_themes"
    | "state_priorities"
    | "proof_points";
  label: string;
  status: DimensionStatus;
  summary: string;
  findings: DimensionFinding[];
  pendingReason?: string | null;
};

export type ScoreMeV2Result = {
  id: string | null;
  createdAt: string;
  question: { id: string; question_number: string; title: string };
  dimensions: DimensionResult[];
  irisNote: string;
  gapCount: number;
  opportunityCount: number;
  uploadsActive: number;
  uploadsTotal: number;
};

// ---------- Setup status ----------

export const getScoreMeSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: vault } = await supabase
      .from("mission_vault_documents")
      .select("doc_type")
      .eq("mission_id", data.missionId);

    const types = new Set<string>((vault ?? []).map((v: any) => v.doc_type));

    const { data: themes } = await supabase
      .from("win_themes")
      .select("id")
      .eq("mission_id", data.missionId)
      .eq("status", "active")
      .limit(1);

    return {
      hasOutlineTemplate: types.has("outline_template"),
      hasStyleGuide: types.has("style_guide"),
      hasContract: types.has("contract"),
      hasScopeOfWork: types.has("scope_of_work"),
      hasWinThemes: (themes ?? []).length > 0,
      hasStateProfile: true, // IRIS auto-populates; always considered active
    };
  });

// ---------- AI tool schema ----------

const SCORE_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_scorecard",
    description:
      "Emit a 7-dimension Score Me scorecard. Person-first language is universal; the other six dimensions only score when source material was provided.",
    parameters: {
      type: "object",
      properties: {
        person_first: dimensionSchema(true),
        outline_template: dimensionSchema(),
        style_guide: dimensionSchema(),
        contract_sow: dimensionSchema(),
        win_themes: dimensionSchema(),
        state_priorities: dimensionSchema(),
        proof_points: dimensionSchema(true, true),
        iris_note: { type: "string", description: "1-2 sentence overall note for the writer." },
      },
      required: [
        "person_first",
        "outline_template",
        "style_guide",
        "contract_sow",
        "win_themes",
        "state_priorities",
        "proof_points",
        "iris_note",
      ],
      additionalProperties: false,
    },
  },
};

function dimensionSchema(_universal = false, opportunity = false) {
  const statuses = opportunity
    ? ["green", "opportunity"]
    : ["green", "yellow", "red"];
  return {
    type: "object",
    properties: {
      status: { type: "string", enum: statuses },
      summary: { type: "string", description: "One sentence summary of the finding." },
      findings: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            suggestion: { type: "string" },
            paragraph: { type: "string" },
          },
          required: ["text"],
          additionalProperties: false,
        },
      },
    },
    required: ["status", "summary", "findings"],
    additionalProperties: false,
  };
}

// ---------- AI call ----------

async function callScorecardEngine(system: string, user: string): Promise<any | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const { withAICircuit } = await import("./ai-circuit-breaker");
  return withAICircuit(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28_000);

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          tools: [SCORE_TOOL],
          tool_choice: { type: "function", function: { name: "emit_scorecard" } },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Score Me engine failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as any;
      const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return null;
      return JSON.parse(args);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error("Score Me timed out after 28 seconds — try again with a shorter draft.");
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  });
}


// ---------- Main: runScoreMe ----------

export const runScoreMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        questionId: z.string().uuid(),
        responseText: z.string().min(50).max(40000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ScoreMeV2Result> => {
    const { supabase, userId } = context;

    // C2: PHI scrub BEFORE any DB read, AI call, or persistence. Fail-closed.
    await assertNoPHI({
      text: data.responseText,
      surface: "score_me",
      actorUserId: userId,
    });

    const { data: q } = await supabase
      .from("question_records")
      .select("id,mission_id,question_number,title,question_text")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!q) throw new Error("Question not found");

    const { data: mission } = await supabase
      .from("missions")
      .select("name,client,state,program_type,focus_areas,win_themes,priority_topics")
      .eq("id", q.mission_id)
      .maybeSingle();

    const [{ data: vault }, { data: winThemes }, { data: dnaRow }] = await Promise.all([
      supabase
        .from("mission_vault_documents")
        .select("doc_type,title,description")
        .eq("mission_id", q.mission_id),
      supabase
        .from("win_themes")
        .select("title,description,key_message")
        .eq("mission_id", q.mission_id)
        .eq("status", "active"),
      supabase
        .from("mission_intelligence_dna")
        .select("dna")
        .eq("mission_id", q.mission_id)
        .eq("is_current", true)
        .maybeSingle(),
    ]);

    const vaultTypes = new Set<string>((vault ?? []).map((v: any) => v.doc_type));
    const themeList = winThemes ?? [];
    const dna = (dnaRow?.dna ?? {}) as any;

    const setup = {
      outline_template: vaultTypes.has("outline_template"),
      style_guide: vaultTypes.has("style_guide"),
      contract_sow: vaultTypes.has("contract") || vaultTypes.has("scope_of_work"),
      win_themes: themeList.length > 0 || (mission?.win_themes ?? []).length > 0,
      state_priorities: true,
      proof_points: true,
    };

    const missionCtx = await loadMissionContext(supabase, q.mission_id);
    const preamble = formatMissionContextPreamble(missionCtx);

    // ---- Build prompt ----
    const sys = `${preamble}

You are IRIS — a senior proposal evaluator. You are running Score Me, the writer-facing pre-Red Team scorecard for Atlas.

Score alignment against the Setup Record win themes and evaluation criteria above — not generic quality metrics. A "green" rating means the draft demonstrably advances the win strategy.

Score the draft against SEVEN dimensions. Each dimension gets its own status flag and findings. DO NOT produce a single composite score.

DIMENSIONS:
1. person_first — Universal language check. Flag any non-person-first phrasing. ALWAYS include the suggested correction (e.g. "the mentally ill" → "individuals with mental illness"). Always-on; never pending.
2. outline_template — Structural compliance vs the engagement's outline template. Status "green" if no template provided.
3. style_guide — Voice, tone, terminology, acronym usage per style guide. Status "green" if no style guide provided.
4. contract_sow — Scope, commitments, timelines, staffing alignment with contract/SOW. Status "green" if neither contract nor SOW provided.
5. win_themes — Are win themes present, prominent (first/second paragraph), and evidenced? Status "green" if no win themes defined.
6. state_priorities — Local frameworks named, RFP weighted criteria addressed, local data used, generic language avoided.
7. proof_points — FORWARD-LOOKING. Never flag what's wrong; identify where evidence would strengthen claims. Status is "green" or "opportunity" only. Surface unsupported claims, specificity opportunities, and suggest the writer review source documents or soft intel — never fabricate data.

STATUS RULES:
- green = no issues / strong
- yellow = needs attention (one or two issues)
- red = critical gaps (multiple issues or required-language violations)
- opportunity = used by proof_points only; means "additive improvement available"

FINDINGS:
- Each finding must be specific. Quote the offending text or section.
- For person_first findings, ALWAYS include suggestion with the exact replacement.
- For style_guide and outline_template, cite the rule that was violated.
- Keep findings short — one sentence each plus optional suggestion.

NEVER rewrite the draft. NEVER suggest replacement paragraphs. Identify gaps; the writer closes them.`;

    const userMsg = `QUESTION Q${q.question_number} — ${q.title}
${q.question_text ?? ""}

MISSION CONTEXT:
State: ${mission?.state ?? "—"} · Client: ${mission?.client ?? "—"} · Program: ${mission?.program_type ?? "—"}
Mission-level win themes (legacy field): ${(mission?.win_themes ?? []).join("; ") || "(none)"}
Priority topics: ${(mission?.priority_topics ?? []).join("; ") || "(none)"}

ENGAGEMENT WIN THEMES (formal):
${themeList.length === 0 ? "(no formal win themes defined — score win_themes as green if mission-level field is also empty)" : themeList.map((t: any) => `- ${t.title}${t.key_message ? ` — ${t.key_message}` : ""}`).join("\n")}

EVALUATOR / STATE INTELLIGENCE:
${typeof dna?.procurement_signals === "string" ? dna.procurement_signals : JSON.stringify(dna?.procurement_signals ?? dna?.evaluator_signals ?? "(none)").slice(0, 1200)}

VAULT UPLOADS AVAILABLE FOR THIS ENGAGEMENT:
- Outline template: ${setup.outline_template ? "YES (run dimension 2)" : "NO — mark outline_template as green with summary 'Outline template not uploaded — structural compliance check skipped.' and findings: []"}
- Style guide: ${setup.style_guide ? "YES (run dimension 3)" : "NO — mark style_guide as green with summary 'Style guide not uploaded — voice/tone check skipped.' and findings: []"}
- Contract or SOW: ${setup.contract_sow ? "YES (run dimension 4)" : "NO — mark contract_sow as green with summary 'Contract/SOW not uploaded — scope alignment check skipped.' and findings: []"}

THE DRAFT TO SCORE:
"""
${data.responseText}
"""`;

    const analysis = await callScorecardEngine(sys, userMsg);
    if (!analysis) {
      throw new Error("IRIS could not score this draft (check LOVABLE_API_KEY).");
    }

    // ---- Normalize into dimension array ----
    const ORDER: Array<{ key: DimensionResult["key"]; label: string }> = [
      { key: "person_first", label: "Person-first language" },
      { key: "outline_template", label: "Outline template" },
      { key: "style_guide", label: "Style guide" },
      { key: "contract_sow", label: "Contract / SOW" },
      { key: "win_themes", label: "Win themes" },
      { key: "state_priorities", label: "State priorities" },
      { key: "proof_points", label: "Proof points" },
    ];

    const dimensions: DimensionResult[] = ORDER.map(({ key, label }) => {
      const raw = analysis[key] ?? {};
      const status = (raw.status as DimensionStatus) ?? "green";
      const findings: DimensionFinding[] = Array.isArray(raw.findings)
        ? raw.findings.slice(0, 6).map((f: any) => ({
            text: String(f.text ?? "").slice(0, 600),
            suggestion: f.suggestion ? String(f.suggestion).slice(0, 600) : null,
            paragraph: f.paragraph ? String(f.paragraph).slice(0, 120) : null,
          }))
        : [];

      // Mark pending when upload is missing
      let finalStatus: DimensionStatus = status;
      let pendingReason: string | null = null;
      if (key === "outline_template" && !setup.outline_template) {
        finalStatus = "pending";
        pendingReason = "Outline template not uploaded for this engagement.";
      } else if (key === "style_guide" && !setup.style_guide) {
        finalStatus = "pending";
        pendingReason = "Style guide not uploaded for this engagement.";
      } else if (key === "contract_sow" && !setup.contract_sow) {
        finalStatus = "pending";
        pendingReason = "Contract template and scope of work not uploaded for this engagement.";
      } else if (
        key === "win_themes" &&
        !setup.win_themes
      ) {
        finalStatus = "pending";
        pendingReason = "No win themes defined for this engagement.";
      }

      return {
        key,
        label,
        status: finalStatus,
        summary: String(raw.summary ?? (pendingReason ?? "")).slice(0, 400),
        findings: finalStatus === "pending" ? [] : findings,
        pendingReason,
      };
    });

    const gapCount = dimensions.filter((d) => d.status === "red" || d.status === "yellow").length;
    const opportunityCount = dimensions.filter((d) => d.status === "opportunity").length;
    const uploadsActive = [
      true, // person-first always
      setup.outline_template,
      setup.style_guide,
      setup.contract_sow,
      setup.win_themes,
      true, // state priorities
      true, // proof points
    ].filter(Boolean).length;

    // ---- Persist into score_me_history ----
    const { data: inserted } = await supabase
      .from("score_me_history")
      .insert({
        mission_id: q.mission_id,
        question_id: q.id,
        scored_by: userId,
        score: 0, // legacy column — V2 has no composite
        projected_score: 0,
        full_analysis: { kind: "scorecard_v2", dimensions, iris_note: analysis.iris_note ?? "" },
      })
      .select("id,created_at")
      .maybeSingle();

    // ---- Health flag wiring (best-effort) ----
    try {
      const personFirst = dimensions.find((d) => d.key === "person_first");
      const winThemesDim = dimensions.find((d) => d.key === "win_themes");
      const stateDim = dimensions.find((d) => d.key === "state_priorities");

      const flagsToInsert: any[] = [];

      if (personFirst && (personFirst.status === "yellow" || personFirst.status === "red")) {
        flagsToInsert.push({
          mission_id: q.mission_id,
          question_id: q.id,
          subject_writer_id: userId,
          severity: personFirst.status === "red" ? "urgent" : "watch",
          trigger_code: "score_me_person_first",
          title: `Person-first language flagged on Q${q.question_number}`,
          detail: personFirst.summary,
          recommended_action:
            "Replace flagged terms with person-first equivalents before Red Team.",
        });
      }
      if (winThemesDim && winThemesDim.status === "red") {
        flagsToInsert.push({
          mission_id: q.mission_id,
          question_id: q.id,
          subject_writer_id: userId,
          severity: "watch",
          trigger_code: "score_me_win_themes_absent",
          title: `Win themes missing on Q${q.question_number}`,
          detail: winThemesDim.summary,
          recommended_action: "Lead with a defined win theme in the opening paragraph.",
        });
      }
      if (stateDim && stateDim.status === "red") {
        flagsToInsert.push({
          mission_id: q.mission_id,
          question_id: q.id,
          subject_writer_id: userId,
          severity: "watch",
          trigger_code: "score_me_state_priorities",
          title: `State priorities under-addressed on Q${q.question_number}`,
          detail: stateDim.summary,
          recommended_action: "Reference the required state framework and add local data points.",
        });
      }

      if (flagsToInsert.length > 0) {
        await supabase.from("iris_health_flags").insert(flagsToInsert);
      }
    } catch (e) {
      // NEVER log request body or parameters here — may contain draft content. See data security spec.
      const { logSafeWarn } = await import("./sanitise-error");
      logSafeWarn("score-me-v2.runScoreMe:health_flag", e);
    }

    // ---- Contribution ----
    try {
      const { recordContribution } = await import("./contributions.server");
      const runId = inserted?.id ?? `${q.id}:${Date.now()}`;
      await recordContribution({
        authUserId: userId,
        missionId: q.mission_id,
        eventType: "score_submitted",
        targetTable: "score_me_history",
        targetId: inserted?.id ?? undefined,
        weight: 1,
        idempotencyKey: `scorecard:${runId}:${userId}`,
        payload: {
          kind: "scorecard_v2",
          question_id: q.id,
          gap_count: gapCount,
          opportunity_count: opportunityCount,
        },
      });
    } catch (e) {
      // NEVER log request body or parameters here — may contain draft content. See data security spec.
      const { logSafeWarn } = await import("./sanitise-error");
      logSafeWarn("score-me-v2.runScoreMe:contribution", e);
    }

    return {
      id: inserted?.id ?? null,
      createdAt: inserted?.created_at ?? new Date().toISOString(),
      question: { id: q.id, question_number: q.question_number, title: q.title },
      dimensions,
      irisNote: String(analysis.iris_note ?? ""),
      gapCount,
      opportunityCount,
      uploadsActive,
      uploadsTotal: 7,
    };
  });
