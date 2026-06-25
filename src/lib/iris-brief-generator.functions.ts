/**
 * IRIS Brief Generator — grounds each brief in ORACLE intelligence via four
 * parallel query_oracle calls, then asks the AI gateway to assemble the brief
 * using only that grounding (with general Medicaid knowledge labeled where
 * ORACLE has gaps). After the brief is written, every node used is upserted
 * into question_intel_links so the question-to-intel map grows over time.
 *
 * ---------------------------------------------------------------------------
 * Lovable AI Gateway call-site map (ai.gateway.lovable.dev)
 * Update this index whenever a new gateway call site is added.
 *
 * Flight Deck IRIS brief (canonical, ORACLE-grounded):
 *   src/lib/iris-brief-generator.functions.ts        ← this file
 *
 * Brief variants & misc IRIS:
 *   src/lib/iris-brief.functions.ts                  (legacy brief helpers)
 *   src/lib/iris-dna.functions.ts                    (mission DNA extraction)
 *   src/lib/iris-evaluator.functions.ts              (evaluator scoring)
 *   src/lib/iris-evaluate-brief-impact.server.ts     (impact scoring)
 *   src/lib/iris-risk-pattern-check.server.ts        (risk patterns)
 *   src/lib/iris-competitor-intel.functions.ts       (competitor enrichment)
 *   src/lib/iris-bulk-competitors.functions.ts       (bulk competitor seed)
 *   src/lib/iris-bulk-feeds.functions.ts             (bulk feed classify)
 *   src/lib/iris-extract-thread-knowledge.functions.ts
 *   src/lib/iris-extract-thread-intelligence.functions.ts
 *   src/lib/iris-alerts.functions.ts                 (alert generation)
 *   src/lib/iris-process-rfp.functions.ts            (RFP extraction)
 *   src/lib/iris-seed-mission-intelligence.functions.ts
 *
 * Feature-scoped helpers:
 *   src/lib/thread.functions.ts                      (thread analysis)
 *   src/lib/sos.functions.ts                         (SOS assist)
 *   src/lib/score-me-coach.functions.ts              (Score Me coach)
 *   src/lib/atlas-assist.functions.ts                (Atlas assist bar)
 *   src/lib/atlas-onboarding.functions.ts
 *   src/lib/atlas-onboarding-uploads.functions.ts
 *   src/lib/atlas-moments.functions.ts
 *   src/lib/writer-drilldown.functions.ts
 *   src/lib/v2-home.functions.ts
 *   src/lib/intelligence-graph.functions.ts
 *   src/lib/intelligence-loadout.functions.ts
 *   src/lib/canon-extract.server.ts
 *
 * Cron / public hooks:
 *   src/routes/api/public/hooks/iris-daily-monitor.ts
 *   src/routes/api/public/hooks/refresh-intelligence-graph.ts
 *   src/routes/api/public/hooks/generate-daily-briefs.ts
 *   src/routes/api/public/hooks/atlas-daily-moments.ts
 *   src/routes/api/public/hooks/atlas-daily-focus-generator.ts
 *
 * IRIS chat route: src/routes/api/chat/iris.ts (proxied via src/server.ts)
 * ---------------------------------------------------------------------------
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildMissionContext, serializeContextForPrompt } from "@/lib/iris/build-mission-context";
import { buildLanguagePrompt } from "@/lib/iris/language-prompt";
import { generateEmbedding, buildQueryEmbeddingText, toPgVector } from "@/lib/embeddings.server";

type HybridSignalRow = {
  id: string;
  title: string | null;
  what_happened: string | null;
  why_it_matters: string | null;
  category: string | null;
  tier: string | null;
  urgency: string | null;
  relevance_score: number | null;
  source_name: string | null;
  similarity_score: number | null;
};

async function hybridOracleSearchSafe(
  supabase: any,
  missionId: string,
  queryText: string,
  label: string,
): Promise<HybridSignalRow[]> {
  try {
    const embedding = await generateEmbedding(queryText);
    const { data, error } = await supabase.rpc("hybrid_oracle_search", {
      p_mission_id: missionId,
      p_query_text: queryText,
      p_query_embedding: embedding ? toPgVector(embedding) : null,
      p_limit: 8,
    });
    if (error) {
      console.warn(`[iris-brief] hybrid_oracle_search(${label}) error`, error.message);
      return [];
    }
    return (Array.isArray(data) ? data : []) as HybridSignalRow[];
  } catch (e: any) {
    console.warn(`[iris-brief] hybrid_oracle_search(${label}) threw`, e?.message);
    return [];
  }
}

const Input = z.object({
  missionId: z.string().uuid(),
  questionId: z.string().uuid(),
});

// Branch-sets per brief section (Option 3 grounding)
const BRANCH_SETS = {
  decode: ["regulatory_federal", "regulatory_state", "field_intelligence"],
  winAngle: ["client_content_map", "competitive_landscape", "policy_innovation"],
  evidence: ["evidence_base", "quality_performance", "health_outcomes_sdoh"],
  risk: ["regulatory_federal", "regulatory_state", "competitive_landscape", "field_intelligence"],
} as const;

type OracleNode = {
  id: string;
  title: string;
  signal_type?: string | null;
  what_happened?: string | null;
  why_it_matters?: string | null;
  recommended_action?: string | null;
  oracle_score?: number | null;
  boosted_score?: number | null;
  scope_tier?: string | null;
  state_code?: string | null;
};
type OracleBranch = {
  taxonomy_code: string;
  taxonomy_name: string;
  domain: string | null;
  results: OracleNode[];
};

async function queryOracleSafe(
  supabase: any,
  missionId: string,
  questionId: string,
  codes: readonly string[],
  limit = 3,
  label = "",
): Promise<OracleBranch[]> {
  try {
    const { data, error } = await supabase.rpc("query_oracle", {
      p_mission_id: missionId,
      p_question_id: questionId,
      p_taxonomy_codes: codes as unknown as string[],
      p_limit_per_branch: limit,
    });
    if (error) {
      console.warn(`[iris-brief] query_oracle(${label}) error`, error.message);
      return [];
    }
    return (Array.isArray(data) ? data : []) as OracleBranch[];
  } catch (e: any) {
    console.warn(`[iris-brief] query_oracle(${label}) threw`, e?.message);
    return [];
  }
}

function flattenNodes(branches: OracleBranch[]): Array<OracleNode & { _branch: string }> {
  const out: Array<OracleNode & { _branch: string }> = [];
  for (const b of branches) {
    for (const n of b.results ?? []) {
      out.push({ ...n, _branch: b.taxonomy_code });
    }
  }
  return out;
}

function formatOracleContext(branches: OracleBranch[]): string {
  const nodes = flattenNodes(branches);
  if (nodes.length === 0) return "No ORACLE intelligence available for this branch.";
  return nodes
    .map((n) => {
      const head = `[${n._branch} · ${n.signal_type ?? "signal"}${
        n.scope_tier ? ` · ${n.scope_tier}` : ""
      }${n.state_code ? `/${n.state_code}` : ""}] ${n.title}`;
      const body = [n.what_happened, n.why_it_matters, n.recommended_action]
        .filter(Boolean)
        .join(" ")
        .slice(0, 600);
      return `${head}\n${body}`;
    })
    .join("\n\n");
}

export const generateIrisBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    await supabase
      .from("mission_questions")
      .update({ iris_brief_status: "generating" })
      .eq("id", data.questionId);

    try {
      // 1) Mission/question context + 4 parallel ORACLE queries
      const [ctx, qRes, mRes, decodeBranches, winAngleBranches, evidenceBranches, riskBranches] =
        await Promise.all([
          buildMissionContext(supabase, data.missionId, {
            questionId: data.questionId,
            includeDocumentText: true,
          }),
          supabase
            .from("mission_questions")
            .select(
              "question_number, question_text, word_limit, page_limit, point_value, evaluation_criteria, brief_notes",
            )
            .eq("id", data.questionId)
            .single(),
          supabase
            .from("missions")
            .select("name, client_name, agency_name")
            .eq("id", data.missionId)
            .single(),
          queryOracleSafe(supabase, data.missionId, data.questionId, BRANCH_SETS.decode, 3, "decode"),
          queryOracleSafe(
            supabase,
            data.missionId,
            data.questionId,
            BRANCH_SETS.winAngle,
            3,
            "winAngle",
          ),
          queryOracleSafe(
            supabase,
            data.missionId,
            data.questionId,
            BRANCH_SETS.evidence,
            3,
            "evidence",
          ),
          queryOracleSafe(supabase, data.missionId, data.questionId, BRANCH_SETS.risk, 3, "risk"),
        ]);

      const question = (qRes as any)?.data ?? {};
      const mission = (mRes as any)?.data ?? {};

      const decodeNodes = flattenNodes(decodeBranches);
      const winAngleNodes = flattenNodes(winAngleBranches);
      const evidenceNodes = flattenNodes(evidenceBranches);
      const riskNodes = flattenNodes(riskBranches);
      const totalNodes =
        decodeNodes.length + winAngleNodes.length + evidenceNodes.length + riskNodes.length;

      // 1b) Hybrid semantic+keyword search across all approved/pushed signals,
      // run AFTER we have the question text in hand. Four focused queries
      // mirror the brief layers. Results are merged into question_intel_links
      // (and the oracle_sources UI list) but do NOT alter the taxonomy-grounded
      // prompt above — they're enrichment, not replacement.
      const qText = String(question.question_text ?? "");
      const [hybridDecode, hybridWinAngle, hybridEvidence, hybridRisk] = qText
        ? await Promise.all([
            hybridOracleSearchSafe(supabase, data.missionId, `compliance requirements: ${qText}`, "decode"),
            hybridOracleSearchSafe(supabase, data.missionId, `competitive differentiation win strategy: ${qText}`, "winAngle"),
            hybridOracleSearchSafe(supabase, data.missionId, `evidence base research proof points: ${qText}`, "evidence"),
            hybridOracleSearchSafe(supabase, data.missionId, `risks landmines evaluation criteria: ${qText}`, "risk"),
          ])
        : [[], [], [], []];

      console.log(
        `[iris-brief] ORACLE nodes: decode=${decodeNodes.length} winAngle=${winAngleNodes.length} evidence=${evidenceNodes.length} risk=${riskNodes.length} total=${totalNodes} | hybrid=${hybridDecode.length + hybridWinAngle.length + hybridEvidence.length + hybridRisk.length}`,
      );

      const contextBlock = serializeContextForPrompt(ctx, "question");

      // 2) System + user prompts (grounded)
      // Fetch per-mission IRIS Studio language config and append to system prompt.
      let languageBlock = "";
      try {
        const { data: cfg } = await (supabase as unknown as {
          from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } } };
        })
          .from("mission_iris_config")
          .select("person_first_pairs, cultural_standards, state_terminology")
          .eq("mission_id", data.missionId)
          .maybeSingle();
        if (cfg) languageBlock = buildLanguagePrompt(cfg as Parameters<typeof buildLanguagePrompt>[0]);
      } catch (e) {
        console.warn("[iris-brief] could not load mission_iris_config", e);
      }

      // Fetch any client-provided response outline for this question
      // (or fall back to a global mission-wide outline).
      let outlineBlock = "";
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data: outlineRows } = await sb
          .from("question_response_outlines")
          .select(
            "question_id, section_headers, content_guidance, word_allocation, total_word_limit, required_elements, prohibited_elements, format_notes",
          )
          .eq("mission_id", data.missionId)
          .or(`question_id.eq.${data.questionId},question_id.is.null`)
          .order("question_id", { ascending: false, nullsFirst: false })
          .limit(1);
        const outline = Array.isArray(outlineRows) && outlineRows.length > 0 ? outlineRows[0] : null;
        if (outline) {
          const lines = [
            "",
            "━━━ CLIENT RESPONSE STRUCTURE — THE CLIENT HAS SPECIFIED HOW THIS RESPONSE MUST BE ORGANIZED ━━━",
          ];
          if (Array.isArray(outline.section_headers) && outline.section_headers.length > 0) {
            lines.push(`Required sections in order: ${outline.section_headers.join(" → ")}`);
          }
          if (outline.total_word_limit) lines.push(`Total word limit: ${outline.total_word_limit} words`);
          if (outline.word_allocation && typeof outline.word_allocation === "object") {
            const entries = Object.entries(outline.word_allocation as Record<string, unknown>);
            if (entries.length) {
              lines.push(
                `Word allocation: ${entries.map(([k, v]) => `${k}=${v}w`).join(", ")}`,
              );
            }
          }
          if (outline.content_guidance) lines.push(`Approach: ${outline.content_guidance}`);
          if (Array.isArray(outline.required_elements) && outline.required_elements.length > 0) {
            lines.push(`Must include: ${outline.required_elements.join("; ")}`);
          }
          if (Array.isArray(outline.prohibited_elements) && outline.prohibited_elements.length > 0) {
            lines.push(`Must NOT include: ${outline.prohibited_elements.join("; ")}`);
          }
          if (outline.format_notes) lines.push(`Format: ${outline.format_notes}`);
          lines.push(
            "Organize your 'recommended_approach' and 'iris_evidence' around the client's required sections. Respect the word allocation if provided.",
          );
          outlineBlock = lines.join("\n");
        }
      } catch (e) {
        console.warn("[iris-brief] could not load response outline", e);
      }

      // Fetch unresolved compliance obligations for this question
      let complianceBlock = "";
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data: oblRows } = await sb
          .from("question_compliance_checks")
          .select(
            "verification_status, compliance_obligations(obligation_summary, obligation_type, risk_level, document_type, section_reference)",
          )
          .eq("question_id", data.questionId)
          .in("verification_status", ["pending", "conflict"]);
        const obs = (oblRows ?? []) as Array<{
          verification_status: string;
          compliance_obligations: {
            obligation_summary: string | null;
            obligation_type: string | null;
            risk_level: string | null;
            document_type: string | null;
            section_reference: string | null;
          } | null;
        }>;
        if (obs.length > 0) {
          const lines = [
            "",
            "━━━ CONTRACT & SOW OBLIGATIONS FOR THIS QUESTION (writer must address these) ━━━",
            ...obs.slice(0, 20).map((o) => {
              const ob = o.compliance_obligations;
              const docLabel = ob?.document_type === "model_contract" ? "Contract" : "SOW";
              const sec = ob?.section_reference ? ` ${ob.section_reference}` : "";
              return `- [${docLabel}${sec}] ${ob?.obligation_summary ?? "—"} (${ob?.risk_level ?? "medium"} risk)`;
            }),
            "",
            "In your 'Watch out for' guidance: flag any obligation above that the proposed win strategy might conflict with.",
            "In your 'How we win this' guidance: note how the response approach aligns with the contract/SOW requirements.",
          ];
          complianceBlock = lines.join("\n");
        }
      } catch (e) {
        console.warn("[iris-brief] could not load compliance obligations", e);
      }

      const system = `You are IRIS, the intelligence co-pilot for Athena Strategy Group's ATLAS platform — Medicaid managed care procurement consulting.

You are generating a pre-writing intelligence brief for a writer.

GROUNDING RULE: Use the ORACLE INTELLIGENCE provided as your primary source of truth. Supplement with general Medicaid knowledge ONLY where ORACLE has gaps, and clearly label any general-knowledge claim ("General knowledge:"). When you use an ORACLE item, cite it inline as [Source: <title>].

OUTPUT RULE: Return ONLY a valid JSON object — no preamble, no markdown fences.

CONTENT RULES:
- iris_evidence: industry-level proof points from public sources surfaced by ORACLE. Never invent statistics.
- Never generate client-specific performance data, outcomes, or case studies.
- client_proof_points_prompt instructs the writer to add their own organization's data.
- No filler ("it is important to note"). Direct, briefing-officer voice.${languageBlock}${outlineBlock}${complianceBlock}`;

      const userMsg = [
        `=== MISSION INTELLIGENCE ===`,
        contextBlock,
        "",
        `=== QUESTION TO BRIEF ===`,
        `Number: ${question.question_number ?? "N/A"}`,
        `Text: ${question.question_text ?? ""}`,
        `Word Limit: ${question.word_limit ?? "Not specified"}`,
        `Page Limit: ${question.page_limit ?? "Not specified"}`,
        `Point Value: ${question.point_value ?? "Not specified"}`,
        `Evaluation Criteria: ${question.evaluation_criteria ?? "Not specified"}`,
        `Leadership Notes: ${question.brief_notes ?? "None"}`,
        `Mission Client: ${mission.client_name ?? "(unspecified)"} — ${mission.agency_name ?? "(unspecified)"}`,
        "",
        `━━━ ORACLE INTELLIGENCE — USE THIS AS GROUNDING ━━━`,
        "",
        `REGULATORY & EVALUATOR CONTEXT:`,
        formatOracleContext(decodeBranches),
        "",
        `CLIENT POSITIONING & COMPETITIVE INTEL:`,
        formatOracleContext(winAngleBranches),
        "",
        `EVIDENCE BASE & OUTCOMES DATA:`,
        formatOracleContext(evidenceBranches),
        "",
        `COMPLIANCE RISKS & FIELD SIGNALS:`,
        formatOracleContext(riskBranches),
        "",
        `━━━ RETURN THIS EXACT JSON SHAPE ━━━`,
        `{
  "decoded_intent": "what the evaluator is really asking — grounded in REGULATORY & EVALUATOR CONTEXT — 2 sentences. Cite [Source: ...] where used.",
  "evaluation_focus": "what will make or break the score — 2 sentences",
  "win_theme_connections": [
    { "theme_id": "wt1", "theme_text": "theme text", "relevance_score": 85, "signal_authority": "client_stated" }
  ],
  "iris_evidence": [
    { "source": "title from ORACLE evidence branch", "finding": "specific finding", "citation": "42 CFR 438 or ORACLE node title", "relevance": "how to use it in this answer" }
  ],
  "client_proof_points_prompt": "Insert your organization's specific performance data here: [enrollment outcomes, quality metrics, care coordination results]. Do not leave this blank.",
  "language_guidance": { "use": ["specific terms"], "avoid": ["phrases to avoid"] },
  "compliance_checklist": [
    { "item": "specific requirement from regulatory branch", "required": true, "detail": "cite source if from ORACLE" }
  ],
  "recommended_approach": "2-3 sentence response strategy grounded in CLIENT POSITIONING & COMPETITIVE INTEL",
  "competitive_intel": "brief note on competitor approach grounded in competitive branch, or null",
  "risk_flags": [
    { "severity": "CRITICAL" , "flag": "one-sentence risk grounded in COMPLIANCE RISKS branch with [Source: ...] if from ORACLE" }
  ]
}`,
      ].join("\n");

      // 3) AI gateway via task router (complex reasoning -> gpt-5-mini)
      const { callAI } = await import("@/lib/ai-model-router.server");
      let aiResult: { content: string; model: string };
      try {
        aiResult = await callAI("brief_combined", system, userMsg, { json: true });
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("rate limited")) throw new Error("IRIS is rate limited. Try again in a moment.");
        if (msg.includes("credits exhausted")) throw new Error("AI credits exhausted.");
        throw new Error(`IRIS brief generator failed: ${msg.slice(0, 200)}`);
      }
      const raw = aiResult.content;
      const modelUsed = aiResult.model;
      const finishReason: string | undefined = undefined;
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const start = cleaned.indexOf("{");
      if (start === -1) {
        console.error("[iris-brief] unreadable content", { finishReason, preview: raw.slice(0, 500) });
        throw new Error("IRIS returned an unreadable response.");
      }

      const tryParse = (s: string): any | null => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      };
      const repair = (s: string): string => {
        let out = s.replace(/,\s*$/g, "");
        let inStr = false,
          esc = false;
        for (const ch of out) {
          if (esc) {
            esc = false;
            continue;
          }
          if (ch === "\\") {
            esc = true;
            continue;
          }
          if (ch === '"') inStr = !inStr;
        }
        if (inStr) out += '"';
        out = out.replace(/,\s*$/g, "");
        const stack: string[] = [];
        let inS = false,
          es = false;
        for (const ch of out) {
          if (es) {
            es = false;
            continue;
          }
          if (inS) {
            if (ch === "\\") {
              es = true;
            } else if (ch === '"') inS = false;
            continue;
          }
          if (ch === '"') inS = true;
          else if (ch === "{" || ch === "[") stack.push(ch);
          else if (ch === "}" || ch === "]") stack.pop();
        }
        while (stack.length) {
          const open = stack.pop();
          out += open === "{" ? "}" : "]";
        }
        return out;
      };

      const end = cleaned.lastIndexOf("}");
      let brief: any = null;
      if (end > start) brief = tryParse(cleaned.slice(start, end + 1));
      if (!brief) brief = tryParse(repair(cleaned.slice(start)));
      if (!brief) {
        console.error("[iris-brief] invalid JSON", { finishReason, preview: cleaned.slice(0, 800) });
        throw new Error(
          finishReason === "length"
            ? "IRIS response was truncated. Try again."
            : "IRIS brief generation failed: invalid JSON.",
        );
      }

      // 4) Attach oracle_sources for the UI footer (dedup by id)
      const allNodes = [...decodeNodes, ...winAngleNodes, ...evidenceNodes, ...riskNodes];
      const dedup = new Map<string, (typeof allNodes)[number]>();
      for (const n of allNodes) {
        if (!n?.id) continue;
        const existing = dedup.get(n.id);
        if (!existing || (n.boosted_score ?? 0) > (existing.boosted_score ?? 0)) {
          dedup.set(n.id, n);
        }
      }
      const uniqueNodes = Array.from(dedup.values());

      brief.oracle_sources = uniqueNodes.map((n) => ({
        id: n.id,
        title: n.title,
        branch: n._branch,
        signal_type: n.signal_type ?? null,
        scope_tier: n.scope_tier ?? null,
        state_code: n.state_code ?? null,
        score: n.boosted_score ?? n.oracle_score ?? null,
      }));
      brief.oracle_nodes_used = uniqueNodes.length;
      brief.model_used = modelUsed;

      // 5) Persist brief
      await supabase
        .from("mission_questions")
        .update({
          iris_brief: brief,
          iris_brief_status: "ready",
          iris_brief_generated_at: new Date().toISOString(),
          iris_decoded_intent: brief.decoded_intent ?? null,
          iris_evidence: brief.iris_evidence ?? [],
        })
        .eq("id", data.questionId);

      // 6) Upsert question_intel_links — merge taxonomy nodes with hybrid-search hits.
      const taxonomyRows = uniqueNodes.map((n) => ({
        question_id: data.questionId,
        signal_id: n.id,
        mission_id: data.missionId,
        relevance_score: (() => {
          const v = n.boosted_score ?? n.oracle_score ?? null;
          if (v == null) return null;
          return Math.max(0, Math.min(100, Math.round(v)));
        })(),
        briefing_layer: n._branch,
        added_by: "iris_suggested" as const,
      }));
      const taxonomyIds = new Set(uniqueNodes.map((n) => n.id));
      const hybridLayered: Array<{ row: HybridSignalRow; layer: string }> = [
        ...hybridDecode.map((r) => ({ row: r, layer: "hybrid_decode" })),
        ...hybridWinAngle.map((r) => ({ row: r, layer: "hybrid_win_angle" })),
        ...hybridEvidence.map((r) => ({ row: r, layer: "hybrid_evidence" })),
        ...hybridRisk.map((r) => ({ row: r, layer: "hybrid_risk" })),
      ];
      const hybridDedup = new Map<string, { row: HybridSignalRow; layer: string }>();
      for (const item of hybridLayered) {
        if (!item.row?.id || taxonomyIds.has(item.row.id)) continue;
        if (!hybridDedup.has(item.row.id)) hybridDedup.set(item.row.id, item);
      }
      const hybridRows = Array.from(hybridDedup.values()).map(({ row, layer }) => ({
        question_id: data.questionId,
        signal_id: row.id,
        mission_id: data.missionId,
        relevance_score: row.relevance_score != null
          ? Math.max(0, Math.min(100, Math.round(row.relevance_score)))
          : 75,
        briefing_layer: layer,
        added_by: "iris_suggested" as const,
      }));
      const allRows = [...taxonomyRows, ...hybridRows];
      if (allRows.length > 0) {
        const { error: linkErr } = await supabase
          .from("question_intel_links")
          .upsert(allRows, { onConflict: "question_id,signal_id", ignoreDuplicates: false });
        if (linkErr) {
          console.warn("[iris-brief] question_intel_links upsert failed", linkErr.message);
        }
      }

      return { success: true, questionId: data.questionId, oracleNodesUsed: uniqueNodes.length };
    } catch (err) {
      await supabase
        .from("mission_questions")
        .update({ iris_brief_status: "error" })
        .eq("id", data.questionId);
      throw err;
    }
  });
