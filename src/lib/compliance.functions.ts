import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withPersonFirst } from "./person-first";
import { loadRfpText } from "./rfp-text.server";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const SourceKind = z.enum(["model_contract", "state_regulation"]);

const EXTRACT_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_compliance_requirements",
    description:
      "Emit every discrete compliance requirement that proposal responses must address, commit to, or comply with.",
    parameters: {
      type: "object",
      properties: {
        requirements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              section_reference: { type: "string" },
              requirement_text: { type: "string", description: "Exact quoted language from the source." },
              plain_language: { type: "string", description: "Plain English version for writers." },
              requirement_type: {
                type: "string",
                enum: [
                  "mandatory_commitment",
                  "prohibited_activity",
                  "required_language",
                  "performance_standard",
                  "timeline_commitment",
                  "reporting_requirement",
                ],
              },
              severity: { type: "string", enum: ["critical", "significant", "standard"] },
            },
            required: ["section_reference", "requirement_text", "plain_language", "requirement_type", "severity"],
            additionalProperties: false,
          },
        },
      },
      required: ["requirements"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `You are IRIS, a compliance analyst for Athena Strategy Group.

You read state Medicaid managed care model contracts and state regulations. You extract EVERY requirement that a proposal response must address, commit to, or comply with.

Rules:
- Be exhaustive. Do not summarize or combine requirements. Each discrete requirement gets its own record.
- Quote the source text exactly in requirement_text (you may truncate to the relevant sentence).
- Write plain_language for a busy proposal writer — what does this actually mean for me when I write?
- severity:
  - critical = absence will disqualify or heavily penalize evaluation
  - significant = absence will reduce score
  - standard = expected compliance
- Skip boilerplate, definitions, and signature blocks.`;

async function callExtractor(documentLabel: string, text: string): Promise<any[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  // Chunk if huge — process the first ~80k chars in one shot (covers most contracts)
  const truncated = text.slice(0, 80_000);

  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: withPersonFirst(SYSTEM_PROMPT) },
          {
            role: "user",
            content: `Document: ${documentLabel}\n\n${truncated}\n\nExtract every compliance requirement.`,
          },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "function", function: { name: "emit_compliance_requirements" } },
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Extractor failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as any;
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];
  const parsed = JSON.parse(args);
  return Array.isArray(parsed?.requirements) ? parsed.requirements : [];
}

/** Extract compliance requirements from a vault document and match to questions. */
export const extractComplianceRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      documentId: z.string().uuid(),
      sourceKind: SourceKind,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { text, filename, missionId } = await loadRfpText(supabase, data.documentId);

    // Pull all question records for matching
    const { data: questions } = await supabase
      .from("question_records")
      .select("id,question_number,title,question_text,requirements")
      .eq("mission_id", missionId);

    const extracted = await callExtractor(filename, text);
    if (extracted.length === 0) {
      return { inserted: 0, matched: 0 };
    }

    // Naive keyword-based question matching (no embedding round-trip — fast + good enough for v1)
    function matchQuestions(req: any): string[] {
      const haystack = `${req.requirement_text ?? ""} ${req.plain_language ?? ""}`.toLowerCase();
      const tokens = haystack
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 5 && !["shall", "must", "with", "from", "this", "that", "their", "which"].includes(t));
      const matches: { id: string; score: number }[] = [];
      for (const q of questions ?? []) {
        const qText = `${q.title ?? ""} ${q.question_text ?? ""} ${(q.requirements ?? []).join(" ")}`.toLowerCase();
        let hits = 0;
        for (const t of tokens) if (qText.includes(t)) hits++;
        if (hits >= 2) matches.push({ id: q.id, score: hits });
      }
      return matches.sort((a, b) => b.score - a.score).slice(0, 8).map((m) => m.id);
    }

    // Wipe prior extraction for this document (re-runs replace)
    await supabase.from("compliance_requirements").delete().eq("source_document_id", data.documentId);

    const rows = extracted.map((r) => ({
      mission_id: missionId,
      source_document: filename,
      source_document_id: data.documentId,
      source_kind: data.sourceKind,
      section_reference: r.section_reference ?? null,
      requirement_text: String(r.requirement_text ?? "").slice(0, 4000),
      plain_language: String(r.plain_language ?? "").slice(0, 2000),
      requirement_type: r.requirement_type ?? "mandatory_commitment",
      severity: r.severity ?? "standard",
      relevant_question_ids: matchQuestions(r),
      is_federal: false,
    }));

    let inserted = 0;
    let matched = 0;
    if (rows.length > 0) {
      const { data: ins, error } = await supabase.from("compliance_requirements").insert(rows).select("id,relevant_question_ids");
      if (error) throw new Error(error.message);
      inserted = ins?.length ?? 0;
      matched = (ins ?? []).filter((r: any) => (r.relevant_question_ids ?? []).length > 0).length;
    }

    return { inserted, matched };
  });

/** List compliance requirements for a mission (mission docs + applicable federal). */
export const listMissionCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: mission }, missionReqs, fedReqs] = await Promise.all([
      supabase.from("missions").select("program_type").eq("id", data.missionId).maybeSingle(),
      supabase.from("compliance_requirements")
        .select("id,source_document,source_kind,section_reference,requirement_text,plain_language,requirement_type,severity,relevant_question_ids,extracted_at")
        .eq("mission_id", data.missionId)
        .order("severity", { ascending: true })
        .order("extracted_at", { ascending: false }),
      supabase.from("federal_compliance_library")
        .select("id,regulation_name,citation,section_text,plain_language,requirement_type,severity,program_types")
        .order("severity", { ascending: true }),
    ]);

    const program = mission?.program_type;
    const applicableFederal = (fedReqs.data ?? []).filter((f: any) =>
      !program || (f.program_types ?? []).length === 0 || f.program_types?.includes(program),
    );

    return {
      mission: missionReqs.data ?? [],
      federal: applicableFederal,
    };
  });

/** List compliance items applicable to a single question (mission + federal). */
export const listQuestionCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: q } = await supabase
      .from("question_records")
      .select("id,mission_id,title,question_text,requirements")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!q) return { mission: [], federal: [], latestResults: [] };

    const [missionReqs, latestResults, allMissionDocs] = await Promise.all([
      supabase.from("compliance_requirements")
        .select("id,source_document,source_kind,section_reference,requirement_text,plain_language,requirement_type,severity,relevant_question_ids")
        .eq("mission_id", q.mission_id)
        .contains("relevant_question_ids", [q.id]),
      supabase.from("compliance_check_results")
        .select("id,requirement_id,status,evidence,iris_note,checked_at,score_me_run_id")
        .eq("question_id", q.id)
        .order("checked_at", { ascending: false })
        .limit(50),
      supabase.from("federal_compliance_library")
        .select("id,regulation_name,citation,section_text,plain_language,severity"),
    ]);

    // Naive federal applicability per question — keyword overlap
    const qText = `${q.title ?? ""} ${q.question_text ?? ""} ${(q.requirements ?? []).join(" ")}`.toLowerCase();
    const federal = (allMissionDocs.data ?? []).filter((f: any) => {
      const fText = `${f.regulation_name} ${f.plain_language ?? ""} ${f.section_text}`.toLowerCase();
      const tokens = fText.split(/[^a-z]+/).filter((t) => t.length >= 6);
      let hits = 0;
      for (const t of tokens) if (qText.includes(t)) { hits++; if (hits >= 2) return true; }
      return false;
    });

    return {
      mission: missionReqs.data ?? [],
      federal,
      latestResults: latestResults.data ?? [],
    };
  });
