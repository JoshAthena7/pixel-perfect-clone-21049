import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runAIText } from "@/lib/ai/router";

export const DOC_TYPES = [
  "State Contract Template",
  "State Program Requirements",
  "State Regulatory",
  "Federal Regulation",
  "CMS Guidance",
  "Other",
] as const;

async function callAI(sys: string, user: string) {
  // Compliance analysis: use Claude (analyze) — Opus for deeper reasoning.
  const raw = await runAIText({
    task: "analyze",
    system: sys,
    prompt: user,
    json: true,
    deep: true,
  });
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/* ============ EXTRACT REQUIREMENTS ============ */
export const extractComplianceRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        documentId: z.string().uuid(),
        rawText: z.string().min(20).max(180000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: doc, error: docErr } = await supabase
      .from("compliance_documents")
      .select("id, engagement_id, name, source")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document not found.");

    const { data: sections } = await supabase
      .from("heatmap_sections")
      .select("section_name")
      .eq("engagement_id", (doc as any).engagement_id);
    const sectionNames = ((sections as any[]) ?? []).map((s) => s.section_name);

    // Chunk large docs to ~40k chars to stay within model context
    const CHUNK = 38000;
    const chunks: string[] = [];
    for (let i = 0; i < data.rawText.length; i += CHUNK) {
      chunks.push(data.rawText.slice(i, i + CHUNK));
    }

    const sys = `You are a government contract compliance analyst. Extract EVERY mandatory requirement from the document text.
A mandatory requirement is any sentence containing SHALL, SHALL NOT, MUST, MUST NOT, REQUIRED, or PROHIBITED.
Return STRICT JSON: {"requirements":[{"requirement_text": string, "section_reference": string|null, "requirement_type": "SHALL"|"SHALL NOT"|"MUST"|"MUST NOT"|"REQUIRED"|"PROHIBITED", "relevant_sections": string[]}]}
- requirement_text: the full sentence verbatim.
- section_reference: the section/article number (e.g. "§4.3.2", "Article 5.1") if visible.
- relevant_sections: choose from this list (empty if no obvious match): ${JSON.stringify(sectionNames)}.
Do NOT invent requirements. Do NOT paraphrase. Skip recitals and preambles. Skip non-mandatory language ("may", "should", "encouraged").`;

    let totalInserted = 0;
    for (let idx = 0; idx < chunks.length; idx++) {
      const userMsg = `DOCUMENT: ${(doc as any).name}\nSOURCE: ${(doc as any).source ?? "unknown"}\n\nCHUNK ${idx + 1}/${chunks.length}:\n\n${chunks[idx]}\n\nReturn JSON only.`;
      const parsed = await callAI(sys, userMsg);
      const reqs: any[] = Array.isArray(parsed?.requirements) ? parsed.requirements : [];
      if (!reqs.length) continue;

      const rows = reqs
        .filter((r) => typeof r?.requirement_text === "string" && r.requirement_text.trim().length > 0)
        .map((r) => {
          const relevant: string[] = Array.isArray(r.relevant_sections) ? r.relevant_sections : [];
          const matched = relevant.filter((n) => sectionNames.includes(n));
          return {
            engagement_id: (doc as any).engagement_id,
            document_id: (doc as any).id,
            requirement_text: String(r.requirement_text).trim().slice(0, 4000),
            section_reference: r.section_reference ? String(r.section_reference).slice(0, 200) : null,
            requirement_type: ["SHALL", "SHALL NOT", "MUST", "MUST NOT", "REQUIRED", "PROHIBITED"].includes(
              r.requirement_type,
            )
              ? r.requirement_type
              : "SHALL",
            status: matched.length ? "Gap" : "Not Mapped",
            addressed_in_sections: matched,
          };
        });
      if (rows.length) {
        const { error: insErr } = await supabase.from("compliance_requirements").insert(rows);
        if (!insErr) totalInserted += rows.length;
      }
    }

    // Update requirement_count
    const { count } = await supabase
      .from("compliance_requirements")
      .select("id", { count: "exact", head: true })
      .eq("document_id", (doc as any).id);
    await supabase
      .from("compliance_documents")
      .update({ requirement_count: count ?? 0 })
      .eq("id", (doc as any).id);

    return { ok: true, inserted: totalInserted, total: count ?? 0 };
  });

/* ============ CHECK DRAFT COMPLIANCE ============ */
export const checkDraftCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: section, error: secErr } = await supabase
      .from("heatmap_sections")
      .select("id, engagement_id, section_name")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (secErr) throw new Error(secErr.message);
    if (!section) throw new Error("Section not found.");

    // Latest draft per author for this section, concatenated
    const { data: drafts } = await supabase
      .from("section_drafts")
      .select("body, version, author_id, updated_at")
      .eq("section_id", (section as any).id)
      .order("version", { ascending: false });

    const seen = new Set<string>();
    const latest: any[] = [];
    for (const d of (drafts as any[]) ?? []) {
      if (seen.has(d.author_id)) continue;
      seen.add(d.author_id);
      latest.push(d);
    }
    const combined = latest.map((d) => d.body).filter(Boolean).join("\n\n---\n\n").slice(0, 60000);
    if (!combined.trim()) {
      return { ok: true, checked: 0, message: "No draft content yet." };
    }

    const { data: reqs, error: rErr } = await supabase
      .from("compliance_requirements")
      .select("id, requirement_text, requirement_type, section_reference")
      .eq("engagement_id", (section as any).engagement_id)
      .contains("addressed_in_sections", [(section as any).section_name]);
    if (rErr) throw new Error(rErr.message);
    const requirements = (reqs as any[]) ?? [];
    if (!requirements.length) return { ok: true, checked: 0 };

    // Send in batches of 15
    const sys = `You are a strict compliance checker. For each requirement, decide if the proposal DRAFT explicitly and specifically addresses it.
Return STRICT JSON: {"results":[{"requirement_id": string, "status": "Covered"|"Partial"|"Missing", "confidence": number, "explanation": string, "quote": string|null}]}
- "Covered" ONLY if the requirement is explicitly addressed.
- "Partial" if related but vague or incomplete.
- "Missing" if not addressed at all.
- "quote": exact phrase from the DRAFT when Covered/Partial (max 240 chars), else null.
- "explanation": one short sentence.`;

    const BATCH = 15;
    let checked = 0;
    for (let i = 0; i < requirements.length; i += BATCH) {
      const batch = requirements.slice(i, i + BATCH);
      const userMsg = `DRAFT (section "${(section as any).section_name}"):\n\n${combined}\n\nREQUIREMENTS:\n${batch
        .map(
          (r) =>
            `- id=${r.id} type=${r.requirement_type ?? ""} ref=${r.section_reference ?? ""}\n  ${r.requirement_text}`,
        )
        .join("\n")}\n\nReturn JSON only.`;
      const parsed = await callAI(sys, userMsg);
      const results: any[] = Array.isArray(parsed?.results) ? parsed.results : [];

      for (const r of results) {
        const status =
          r.status === "Covered" ? "Addressed" : r.status === "Partial" ? "Partial" : "Gap";
        const { error } = await supabase
          .from("compliance_requirements")
          .update({
            status,
            ai_verified: true,
            ai_quote: r.quote ?? null,
            ai_explanation: typeof r.explanation === "string" ? r.explanation.slice(0, 600) : null,
            ai_confidence: typeof r.confidence === "number" ? r.confidence : null,
            last_checked_at: new Date().toISOString(),
          })
          .eq("id", r.requirement_id);
        if (!error) checked++;
      }
    }
    return { ok: true, checked, total: requirements.length };
  });

/* ============ STATUS / MAPPING TOGGLES ============ */
export const setRequirementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        status: z.enum(["Not Mapped", "Addressed", "Partial", "Gap"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: any = { status: data.status, ai_verified: false };
    if (typeof data.notes === "string") patch.notes = data.notes;
    const { error } = await context.supabase
      .from("compliance_requirements")
      .update(patch)
      .eq("id", data.requirementId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const mapRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requirementId: z.string().uuid(),
        addressedInSections: z.array(z.string()).default([]),
        addressedInQuestions: z.array(z.string().uuid()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("compliance_requirements")
      .update({
        addressed_in_sections: data.addressedInSections,
        addressed_in_questions: data.addressedInQuestions,
      })
      .eq("id", data.requirementId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComplianceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("compliance_documents")
      .delete()
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
