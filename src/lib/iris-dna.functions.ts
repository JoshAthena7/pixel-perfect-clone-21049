// IRIS Deep RFP Comprehension Engine — Phase 2.
// Reads the full RFP, builds a complete intelligence profile (DNA),
// and generates a prioritized research agenda from it.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadRfpText, findLatestRfp } from "./rfp-text.server";

const FOCUS_CATEGORIES = [
  "Medicaid Managed Care (Full Risk)",
  "LTSS — Home and Community Based (HCBS)",
  "LTSS — Nursing Facility / Institutional",
  "Behavioral Health",
  "Substance Use Disorder",
  "Childrens Medicaid / CHIP",
  "Dual Eligibles (Medicare-Medicaid)",
  "Pharmacy Benefits Management",
  "Dental Benefits",
  "Vision Benefits",
  "Care Management / SDOH",
  "Provider Network Management",
  "Quality Improvement / HEDIS / Stars",
] as const;

// ─── DNA SHAPE ────────────────────────────────────────────────────────────
type DnaQuestion = {
  question: string;
  why_it_matters: string;
  relevant_sections: string[];
  urgency: "high" | "medium" | "low";
};

export type MissionDna = {
  mission_identity: {
    state: string | null;
    state_abbreviation: string | null;
    state_agency: string | null;
    procurement_name: string | null;
    rfp_number: string | null;
    program_type: string | null;
    contract_value: string | null;
    contract_term: string | null;
    submission_deadline: string | null;
    pens_down_date: string | null;
    incumbent: string | null;
  };
  population_profile: {
    total_members: string | null;
    populations: string[];
    health_disparities: string[];
    geographic_focus: string[];
    special_populations: string[];
  };
  program_requirements: {
    mandatory_requirements: string[];
    evaluation_categories: Array<{ category: string; weight: string | null }>;
    differentiating_factors: string[];
    compliance_language: string[];
    page_limits: { overall: number | null; per_section: string | null };
  };
  focus_areas: {
    primary_focus_areas: string[];
    secondary_emphasis: string[];
  };
  regulatory_context: {
    applicable_federal_rules: string[];
    applicable_waivers: string[];
    state_plan_amendments: string[];
    recent_regulatory_changes: string[];
    compliance_deadlines: string[];
  };
  political_context: {
    governor_priorities: string[];
    legislative_context: string[];
    state_strategic_plans: string[];
    dmahs_priorities: string[];
    recent_state_initiatives: string[];
  };
  competitive_context: {
    incumbent_mentioned: boolean;
    incumbent_name: string | null;
    incumbent_performance_references: string[];
    transition_requirements: string[];
    rfp_changes_from_prior: string[];
  };
  intelligence_questions: DnaQuestion[];
};

// ─── DEEP COMPREHENSION PROMPT ────────────────────────────────────────────
function buildPrompt(): string {
  return `You are IRIS — the proposal intelligence engine for Atlas, built by Athena Strategy Group. You have just been given a government RFP to read in full.

Your job is not to summarize this RFP. Your job is to build a complete intelligence profile of this procurement — everything a senior proposal strategist would need to know before writing a single word.

Read the entire RFP and produce a structured JSON object with EXACTLY this shape. For any field not in the RFP, return null (or [] for arrays). Do not infer.

{
  "mission_identity": {
    "state": string|null, "state_abbreviation": string|null,
    "state_agency": string|null, "procurement_name": string|null,
    "rfp_number": string|null, "program_type": string|null,
    "contract_value": string|null, "contract_term": string|null,
    "submission_deadline": "YYYY-MM-DD"|null,
    "pens_down_date": "YYYY-MM-DD"|null,
    "incumbent": string|null
  },
  "population_profile": {
    "total_members": string|null,
    "populations": string[],
    "health_disparities": string[],
    "geographic_focus": string[],
    "special_populations": string[]
  },
  "program_requirements": {
    "mandatory_requirements": string[],
    "evaluation_categories": [{"category": string, "weight": string|null}],
    "differentiating_factors": string[],
    "compliance_language": string[],
    "page_limits": {"overall": number|null, "per_section": string|null}
  },
  "focus_areas": {
    "primary_focus_areas": string[],  // MUST be from: ${FOCUS_CATEGORIES.map((c) => `"${c}"`).join(", ")}
    "secondary_emphasis": string[]    // cross-cutting topics
  },
  "regulatory_context": {
    "applicable_federal_rules": string[],
    "applicable_waivers": string[],
    "state_plan_amendments": string[],
    "recent_regulatory_changes": string[],
    "compliance_deadlines": string[]
  },
  "political_context": {
    "governor_priorities": string[],
    "legislative_context": string[],
    "state_strategic_plans": string[],
    "dmahs_priorities": string[],
    "recent_state_initiatives": string[]
  },
  "competitive_context": {
    "incumbent_mentioned": boolean,
    "incumbent_name": string|null,
    "incumbent_performance_references": string[],
    "transition_requirements": string[],
    "rfp_changes_from_prior": string[]
  },
  "intelligence_questions": [
    {
      "question": string,
      "why_it_matters": string,
      "relevant_sections": string[],
      "urgency": "high"|"medium"|"low"
    }
  ]
}

For intelligence_questions, generate 20-30 specific research questions a senior proposal strategist would need answered. These must be specific to THIS RFP, not generic Medicaid topics.

GOOD examples:
- "What has [state] [agency] said about [specific program area] performance under the current contract and what are their stated priorities for the new contract?"
- "What specific SDOH screening tools has CMS endorsed for Medicaid managed care and which have demonstrated outcomes in populations similar to [state] Medicaid?"
- "What did the most recent [state] EQRO report say about quality performance under the current managed care contracts?"

BAD examples (too generic):
- "What is [state] Medicaid?"
- "What is behavioral health?"

Return ONLY the JSON object. No prose, no markdown fences.`;
}

async function callLovableAiForDna(rfpText: string): Promise<MissionDna> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  // Gemini 2.5 Pro context is ~1M tokens, but keep a sane upper bound.
  const body = rfpText.slice(0, 400_000);
  const system = buildPrompt();

  // Try a couple of models in order; gemini-2.5-pro has the biggest context.
  const models = [
    process.env.IRIS_DNA_MODEL,
    "google/gemini-2.5-pro",
    "google/gemini-3.1-pro-preview",
    "openai/gpt-5",
  ].filter(Boolean) as string[];

  let lastError = "";
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: `RFP TEXT:\n\n${body}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      lastError = `Network: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }

    if (res.status === 429) {
      lastError = `Lovable AI 429: rate limited`;
      // try next model
      continue;
    }
    if (res.status === 402) {
      throw new Error(
        "Lovable AI credits exhausted — add credits in Settings → Workspace → Usage to keep IRIS running.",
      );
    }
    if (!res.ok) {
      const err = await res.text();
      lastError = `Lovable AI ${res.status}: ${err.slice(0, 400)}`;
      // Model-not-found style errors → try next
      if (res.status === 404 || res.status === 400) continue;
      throw new Error(lastError);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) {
      lastError = "Lovable AI returned no JSON object";
      continue;
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as MissionDna;
    } catch (e) {
      lastError = `JSON parse: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
  }
  throw new Error(lastError || "Lovable AI unavailable");
}


// ─── INPUT VALIDATION ─────────────────────────────────────────────────────
const GenerateInput = z.object({
  missionId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
});

const GetInput = z.object({ missionId: z.string().uuid() });

// ─── SERVER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Generate the deep intelligence DNA for a mission from its RFP.
 * Stores DNA + a prioritized research agenda (research_tasks).
 */
export const generateMissionDna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GenerateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Resolve which RFP document to read
    const documentId = data.documentId ?? (await findLatestRfp(supabase, data.missionId));
    if (!documentId) throw new Error("No RFP document found in the Vault for this mission");

    // 2. Load text
    const { text, filename, missionId } = await loadRfpText(supabase, documentId);
    if (missionId !== data.missionId) {
      throw new Error("Document does not belong to this mission");
    }

    // 3. Call Claude
    const dna = await callClaudeForDna(text);

    // 4. Mark previous DNA as not-current; insert new versioned row
    await supabase
      .from("mission_intelligence_dna")
      .update({ is_current: false })
      .eq("mission_id", data.missionId)
      .eq("is_current", true);

    const { data: prevList } = await supabase
      .from("mission_intelligence_dna")
      .select("dna_version")
      .eq("mission_id", data.missionId)
      .order("dna_version", { ascending: false })
      .limit(1);
    const nextVersion = (prevList?.[0]?.dna_version ?? 0) + 1;

    const { data: inserted, error: insErr } = await supabase
      .from("mission_intelligence_dna")
      .insert({
        mission_id: data.missionId,
        // Postgres jsonb — Supabase typings expect `Json`; cast intentionally.
        dna: JSON.parse(JSON.stringify(dna)),
        dna_version: nextVersion,
        generated_from: filename,
        generated_by: userId,
        is_current: true,
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(`Failed to store DNA: ${insErr?.message}`);


    // 5. Generate research_tasks from intelligence_questions
    const questions = Array.isArray(dna.intelligence_questions) ? dna.intelligence_questions : [];
    if (questions.length > 0) {
      const rows = questions.slice(0, 40).map((q) => ({
        mission_id: data.missionId,
        dna_id: inserted.id,
        question: String(q.question ?? "").slice(0, 2000),
        why_it_matters: String(q.why_it_matters ?? "").slice(0, 2000),
        relevant_rfp_sections: Array.isArray(q.relevant_sections) ? q.relevant_sections.slice(0, 12) : [],
        priority: ["high", "medium", "low"].includes(q.urgency) ? q.urgency : "medium",
        status: "pending" as const,
      }));
      const { error: tasksErr } = await supabase.from("research_tasks").insert(rows);
      if (tasksErr) console.warn("[dna] research_tasks insert warning:", tasksErr.message);
    }

    // 6. Audit
    await supabase.from("olympus_audit_log").insert({
      mission_id: data.missionId,
      user_id: userId,
      action_type: "iris_dna_generated",
      action_summary: `IRIS built deep intelligence DNA from "${filename}" (v${nextVersion}) and queued ${questions.length} research questions`,
      target_table: "mission_intelligence_dna",
      target_id: inserted.id,
    });

    return {
      dnaId: inserted.id,
      version: nextVersion,
      questionsGenerated: questions.length,
    };
  });

/** Get the current DNA for a mission (latest version, is_current = true). */
export const getMissionDna = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("mission_intelligence_dna")
      .select("id, dna, dna_version, generated_from, generated_at")
      .eq("mission_id", data.missionId)
      .eq("is_current", true)
      .maybeSingle();
    if (!row) return null;
    return {
      id: row.id as string,
      version: row.dna_version as number,
      generatedFrom: row.generated_from as string | null,
      generatedAt: row.generated_at as string,
      dna: row.dna as unknown as MissionDna,
    };
  });

/** Research agenda summary for a mission (for the Olympus admin view). */
export const getResearchAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => GetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tasks } = await supabase
      .from("research_tasks")
      .select("id, question, why_it_matters, relevant_rfp_sections, status, priority, created_at, updated_at")
      .eq("mission_id", data.missionId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    const list = tasks ?? [];
    const counts = {
      total: list.length,
      pending: list.filter((t) => t.status === "pending").length,
      in_progress: list.filter((t) => t.status === "in_progress").length,
      complete: list.filter((t) => t.status === "complete").length,
      high: list.filter((t) => t.priority === "high").length,
    };
    return { tasks: list, counts };
  });
