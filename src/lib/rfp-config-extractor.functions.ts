import { createServerFn } from "@tanstack/react-start";
import { withPersonFirst } from "./person-first";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({ documentId: z.string().uuid() });

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

type Extraction = {
  state: string | null;
  state_agency: string | null;
  procurement_name: string | null;
  rfp_number: string | null;
  focus_areas: string[];
  submission_deadline: string | null;
  qa_deadline: string | null;
  pens_down_date: string | null;
  contract_start_date: string | null;
  contract_value: string | null;
  contract_term: string | null;
  incumbent: string | null;
  evaluation_criteria: Array<{ category: string; weight: string }>;
  page_limit: number | null;
  key_requirements: string[];
  confidence: Record<string, "high" | "low" | "missing">;
};

async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const { extractDocxText: extract } = await import("./rfp-text.server");
  return extract(bytes);
}

function buildSearchTerms(state: string | null, focusAreas: string[]): string[] {
  const terms = new Set<string>();
  if (state) {
    terms.add(`${state} Medicaid procurement`);
    terms.add(`${state} RFP award`);
    terms.add(`${state} managed care contract`);
    terms.add(`${state} health policy`);
  }
  for (const fa of focusAreas) {
    const short = fa.split("—")[0].split("/")[0].trim();
    if (state) terms.add(`${state} ${short}`);
    terms.add(`${short} policy 2026`);
    terms.add(`CMS ${short}`);
  }
  return Array.from(terms).slice(0, 24);
}

async function callClaude(text: string): Promise<Extraction> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const body = text.slice(0, 60_000);
  const system = `You extract structured procurement data from a US government RFP.
Return ONLY a JSON object (no prose, no fences). For any field not explicitly stated, return null (or [] for arrays).
Match focus_areas to ONLY these categories: ${FOCUS_CATEGORIES.map((c) => `"${c}"`).join(", ")}.
Return all dates as YYYY-MM-DD.

Shape:
{
  "state": string|null,
  "state_agency": string|null,
  "procurement_name": string|null,
  "rfp_number": string|null,
  "focus_areas": string[],
  "submission_deadline": string|null,
  "qa_deadline": string|null,
  "pens_down_date": string|null,
  "contract_start_date": string|null,
  "contract_value": string|null,
  "contract_term": string|null,
  "incumbent": string|null,
  "evaluation_criteria": [{"category": string, "weight": string}],
  "page_limit": number|null,
  "key_requirements": string[]
}`;

  const models = [
    process.env.IRIS_EXTRACT_MODEL,
    "google/gemini-3-flash-preview",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
  ].filter(Boolean) as string[];

  let lastError = "";
  for (const model of models) {
    let res: Response;
    try {
      res = await withAICircuit(async () => {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: withPersonFirst(system) },
              { role: "user", content: `RFP TEXT:\n\n${body}` },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
        return r;
      });
    } catch (e) {
      lastError = `Network: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    if (res.status === 402) {
      throw new Error("Lovable AI credits exhausted — add credits in Settings → Workspace → Usage.");
    }
    if (!res.ok) {
      const err = await res.text();
      lastError = `Lovable AI ${res.status}: ${err.slice(0, 400)}`;
      if (res.status === 404 || res.status === 400) continue;
      throw new Error(lastError);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) {
      lastError = "Lovable AI returned no JSON object";
      continue;
    }
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Extraction>;


    const focus = (parsed.focus_areas ?? []).filter((f) =>
      (FOCUS_CATEGORIES as readonly string[]).includes(f),
    );
    const fields = [
      "state", "state_agency", "procurement_name", "rfp_number",
      "submission_deadline", "qa_deadline", "pens_down_date", "contract_start_date",
      "contract_value", "contract_term", "incumbent", "page_limit",
    ] as const;
    const confidence: Record<string, "high" | "low" | "missing"> = {};
    for (const f of fields) {
      confidence[f] = (parsed as any)[f] ? "high" : "missing";
    }
    confidence.focus_areas = focus.length > 0 ? "high" : "missing";
    confidence.evaluation_criteria = (parsed.evaluation_criteria ?? []).length > 0 ? "high" : "missing";
    confidence.key_requirements = (parsed.key_requirements ?? []).length > 0 ? "high" : "missing";

    return {
      state: parsed.state ?? null,
      state_agency: parsed.state_agency ?? null,
      procurement_name: parsed.procurement_name ?? null,
      rfp_number: parsed.rfp_number ?? null,
      focus_areas: focus,
      submission_deadline: parsed.submission_deadline ?? null,
      qa_deadline: parsed.qa_deadline ?? null,
      pens_down_date: parsed.pens_down_date ?? null,
      contract_start_date: parsed.contract_start_date ?? null,
      contract_value: parsed.contract_value ?? null,
      contract_term: parsed.contract_term ?? null,
      incumbent: parsed.incumbent ?? null,
      evaluation_criteria: Array.isArray(parsed.evaluation_criteria) ? parsed.evaluation_criteria : [],
      page_limit: typeof parsed.page_limit === "number" ? parsed.page_limit : null,
      key_requirements: Array.isArray(parsed.key_requirements) ? parsed.key_requirements.slice(0, 8) : [],
      confidence,
    };
  }
  throw new Error(lastError || "Claude unavailable");
}

export const extractRfpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("mission_library")
      .select("id, mission_id, name, file_path")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document not found");
    if (!doc.file_path) throw new Error("Document has no file");

    await supabase
      .from("missions")
      .update({ rfp_extraction_status: "running" })
      .eq("id", doc.mission_id);

    try {
      const { data: file, error: dlErr } = await supabase.storage
        .from("mission-library")
        .download(doc.file_path);
      if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message}`);
      const bytes = await file.arrayBuffer();
      const text = await extractDocxText(bytes);
      if (text.length < 200) throw new Error("RFP text too short");

      const extraction = await callClaude(text);
      const searchTerms = buildSearchTerms(extraction.state, extraction.focus_areas);

      await supabase
        .from("missions")
        .update({
          rfp_extraction: extraction as any,
          rfp_extracted_at: new Date().toISOString(),
          rfp_extraction_status: "review",
          iris_search_terms: searchTerms,
        })
        .eq("id", doc.mission_id);

      await supabase.from("olympus_audit_log").insert({
        mission_id: doc.mission_id,
        user_id: userId,
        action_type: "rfp_extracted",
        action_summary: `IRIS extracted RFP config from "${doc.name}"`,
        target_table: "mission_library",
        target_id: doc.id,
      });

      return { extraction, searchTerms, missionId: doc.mission_id };
    } catch (e) {
      await supabase
        .from("missions")
        .update({ rfp_extraction_status: "failed" })
        .eq("id", doc.mission_id);
      throw e;
    }
  });

const ConfirmInput = z.object({
  missionId: z.string().uuid(),
  fields: z.object({
    name: z.string().optional(),
    state: z.string().nullable().optional(),
    state_agency: z.string().nullable().optional(),
    procurement_name: z.string().nullable().optional(),
    rfp_number: z.string().nullable().optional(),
    submission_date: z.string().nullable().optional(),
    qa_deadline: z.string().nullable().optional(),
    pens_down_date: z.string().nullable().optional(),
    contract_start_date: z.string().nullable().optional(),
    contract_value: z.string().nullable().optional(),
    contract_term: z.string().nullable().optional(),
    incumbent_name: z.string().nullable().optional(),
    page_limit: z.number().nullable().optional(),
    focus_areas: z.array(z.string()).optional(),
    key_requirements: z.array(z.string()).optional(),
    evaluation_criteria: z.array(z.object({ category: z.string(), weight: z.string() })).optional(),
    iris_search_terms: z.array(z.string()).optional(),
  }),
  activate: z.boolean().default(true),
});

export const confirmRfpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const f = data.fields;
    const update: Record<string, unknown> = {
      rfp_extraction_status: data.activate ? "confirmed" : "review",
    };
    for (const [k, v] of Object.entries(f)) {
      if (v !== undefined) update[k] = v;
    }
    const { error } = await supabase.from("missions").update(update as any).eq("id", data.missionId);
    if (error) throw new Error(error.message);

    await supabase.from("olympus_audit_log").insert({
      mission_id: data.missionId,
      user_id: userId,
      action_type: data.activate ? "rfp_config_confirmed" : "rfp_config_saved",
      action_summary: data.activate
        ? "Admin confirmed IRIS RFP extraction and activated intelligence"
        : "Admin saved IRIS RFP extraction as draft",
      target_table: "missions",
      target_id: data.missionId,
    });

    return { ok: true };
  });
