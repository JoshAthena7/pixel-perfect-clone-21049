// AI helpers for the Intelligence tabs: document summaries, amendment impact,
// Q&A interpretation, bulk Q&A parsing, and section-tag suggestions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

async function callAI(system: string, user: string, jsonMode = false): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured.");
  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });
  if (res.status === 402) throw new Error("Workspace is out of AI credits.");
  if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
  if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

function extractJson<T = unknown>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]) as T; } catch { return null; }
  }
}

/* -------------------- Document summary -------------------- */
export const generateDocumentSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    document_id: z.string().uuid(),
    extra_text: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ summary: string }> => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("mission_documents")
      .select("id, title, document_type, source_url, mission_id")
      .eq("id", data.document_id).single();
    if (!doc) throw new Error("Document not found.");
    const { data: mission } = await supabase
      .from("missions").select("client_name, name").eq("id", doc.mission_id).single();
    const client = mission?.client_name ?? "the client";
    const user = `Document title: ${doc.title ?? "Untitled"}
Type: ${doc.document_type}
${doc.source_url ? `URL: ${doc.source_url}` : ""}
${data.extra_text ? `Content:\n${data.extra_text.slice(0, 8000)}` : ""}

In 2-3 sentences summarize what this document is about and what it contributes to a Medicaid proposal for ${client}.`;
    let summary = "";
    try {
      summary = await callAI(
        "You are IRIS, an RFP intelligence analyst. Reply with only the summary, no preamble.",
        user, false,
      );
    } catch (e) {
      summary = `Reference document: ${doc.title}. Review for relevance to ${client}.`;
    }
    await supabase.from("mission_documents")
      .update({ content_summary: summary, updated_at: new Date().toISOString() })
      .eq("id", data.document_id);
    return { summary };
  });

/* -------------------- Section tag suggestions -------------------- */
export const suggestSectionTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    mission_id: z.string().uuid(),
    document_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<{ section_ids: string[] }> => {
    const { supabase } = context;
    const [{ data: doc }, { data: sections }] = await Promise.all([
      supabase.from("mission_documents").select("title, content_summary, document_type")
        .eq("id", data.document_id).single(),
      supabase.from("mission_sections").select("id, section_number, name, description")
        .eq("mission_id", data.mission_id),
    ]);
    if (!doc || !sections?.length) return { section_ids: [] };
    const user = `Document: ${doc.title}
Type: ${doc.document_type}
Summary: ${doc.content_summary ?? ""}

Sections (id | number | name | description):
${sections.map((s) => `${s.id} | ${s.section_number ?? ""} | ${s.name ?? ""} | ${s.description ?? ""}`).join("\n")}

Return ONLY JSON: { "section_ids": ["uuid", ...] } listing section IDs this document is relevant to.`;
    try {
      const raw = await callAI("You are IRIS. Output JSON only.", user, true);
      const parsed = extractJson<{ section_ids: unknown }>(raw);
      const ids = Array.isArray(parsed?.section_ids) ? (parsed!.section_ids as unknown[]).map(String) : [];
      const valid = new Set(sections.map((s) => s.id));
      return { section_ids: ids.filter((id) => valid.has(id)) };
    } catch {
      return { section_ids: [] };
    }
  });

/* -------------------- Amendment impact -------------------- */
const AmendmentImpact = z.object({
  changed_sections: z.array(z.object({ section_name: z.string(), change_description: z.string() })).default([]),
  new_questions: z.array(z.object({ section_name: z.string(), question_text: z.string() })).default([]),
  removed_questions: z.array(z.object({ question_number: z.string() })).default([]),
  changed_requirements: z.array(z.string()).default([]),
  summary: z.string().default(""),
  disclaimer: z.string().nullable().default(null),
});
export type AmendmentImpactT = z.infer<typeof AmendmentImpact>;

export const analyzeAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    mission_id: z.string().uuid(),
    amendment_document_id: z.string().uuid(),
    amendment_text: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<AmendmentImpactT> => {
    const { supabase } = context;
    const [{ data: rfp }, { data: sections }] = await Promise.all([
      supabase.from("mission_documents")
        .select("title, content_summary").eq("mission_id", data.mission_id)
        .eq("document_type", "primary_rfp").maybeSingle(),
      supabase.from("mission_sections")
        .select("section_number, name, description").eq("mission_id", data.mission_id),
    ]);
    const prompt = `Original RFP summary: ${rfp?.content_summary ?? "(none)"}

Existing sections:
${(sections ?? []).map((s) => `- ${s.section_number ?? ""} ${s.name ?? ""}: ${s.description ?? ""}`).join("\n")}

Amendment text:
${(data.amendment_text ?? "").slice(0, 12000)}

Compare these two documents and identify what changed. Return ONLY valid JSON:
{ "changed_sections": [{"section_name":"...","change_description":"..."}],
  "new_questions": [{"section_name":"...","question_text":"..."}],
  "removed_questions": [{"question_number":"..."}],
  "changed_requirements": ["..."],
  "summary": "...",
  "disclaimer": "string or null" }`;
    try {
      const raw = await callAI("You are IRIS, an RFP amendment analyst. JSON only.", prompt, true);
      const parsed = AmendmentImpact.parse(extractJson(raw) ?? {});
      await supabase.from("mission_documents")
        .update({ amendment_processed_at: new Date().toISOString(), is_amendment: true })
        .eq("id", data.amendment_document_id);
      return parsed;
    } catch (e) {
      return {
        changed_sections: [], new_questions: [], removed_questions: [],
        changed_requirements: [], summary: "IRIS could not parse this amendment automatically. Review manually.",
        disclaimer: "Automated analysis failed.",
      };
    }
  });

/* -------------------- Q&A interpretation -------------------- */
export const generateQaInterpretation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ qa_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ interpretation: string }> => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("mission_qa_log")
      .select("question, state_response, answer")
      .eq("id", data.qa_id).single();
    if (!row) throw new Error("Q&A not found.");
    const response = row.state_response ?? row.answer ?? "";
    const user = `Q: ${row.question}\nA: ${response}\n\nA state procurement office issued this Q&A during an RFP process. In 2-3 plain-language sentences, explain what this means for a proposer and what they should do differently as a result.`;
    let interp = "";
    try {
      interp = await callAI("You are IRIS, an RFP intelligence analyst.", user, false);
    } catch {
      interp = "IRIS interpretation unavailable. Review the Q&A manually.";
    }
    await supabase.from("mission_qa_log")
      .update({ iris_interpretation: interp, updated_at: new Date().toISOString() })
      .eq("id", data.qa_id);
    return { interpretation: interp };
  });

/* -------------------- Bulk Q&A parse -------------------- */
const BulkQaSchema = z.object({
  qa_entries: z.array(z.object({
    number: z.string().optional().default(""),
    question: z.string(),
    response: z.string(),
    date_issued: z.string().nullable().optional(),
  })).default([]),
});
export type BulkQaT = z.infer<typeof BulkQaSchema>;

export const parseBulkQaDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(20) }).parse(d))
  .handler(async ({ data }): Promise<BulkQaT> => {
    const user = `Extract all question and answer pairs from this government procurement Q&A document. Return ONLY valid JSON:
{"qa_entries":[{"number":"string","question":"string","response":"string","date_issued":"YYYY-MM-DD or null"}]}

Document text:
${data.text.slice(0, 20000)}`;
    try {
      const raw = await callAI("You are IRIS. JSON only.", user, true);
      return BulkQaSchema.parse(extractJson(raw) ?? { qa_entries: [] });
    } catch {
      return { qa_entries: [] };
    }
  });
