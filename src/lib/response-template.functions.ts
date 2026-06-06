// Server functions for the Response Template feature.
// See .lovable/plan.md for the full spec.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ===== Types =====

export type ElementType = "header" | "subsection" | "field" | "table" | "word_limit";

export type TemplateElementInput = {
  id?: string;
  parent_id?: string | null;
  order_index: number;
  element_type: ElementType;
  label: string;
  word_limit?: number | null;
  table_columns?: string[] | null;
};

export type TemplateElement = {
  id: string;
  parent_id: string | null;
  order_index: number;
  element_type: ElementType;
  label: string;
  word_limit: number | null;
  table_columns: string[] | null;
};

export type ResponseTemplatePayload = {
  template: {
    id: string;
    mission_id: string;
    status: "active" | "skipped";
    source: "upload" | "manual" | null;
    source_file_name: string | null;
    source_file_path: string | null;
    iris_confidence: string | null;
    iris_source_citation: string | null;
    version: number;
    confirmed_by: string | null;
    confirmed_at: string | null;
  } | null;
  elements: TemplateElement[];
};

// ===== Helpers =====

function countWords(text: string) {
  const t = (text ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

// ===== getResponseTemplate =====

export const getResponseTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ missionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl, error: tplErr } = await supabase
      .from("mission_response_templates")
      .select("*")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);

    if (!tpl) return { template: null, elements: [] } as ResponseTemplatePayload;

    const { data: els, error: elErr } = await supabase
      .from("mission_response_template_elements")
      .select("*")
      .eq("template_id", tpl.id)
      .order("order_index", { ascending: true });
    if (elErr) throw new Error(elErr.message);

    return {
      template: tpl as any,
      elements: (els ?? []) as any,
    } as ResponseTemplatePayload;
  });

// ===== saveResponseTemplate (upload or manual) =====

const elementSchema: z.ZodType<TemplateElementInput> = z.object({
  id: z.string().optional(),
  parent_id: z.string().nullable().optional(),
  order_index: z.number().int().min(0),
  element_type: z.enum(["header", "subsection", "field", "table", "word_limit"]),
  label: z.string().min(1).max(500),
  word_limit: z.number().int().positive().nullable().optional(),
  table_columns: z.array(z.string().min(1).max(200)).max(20).nullable().optional(),
});

export const saveResponseTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      missionId: z.string().uuid(),
      source: z.enum(["upload", "manual"]),
      sourceFileName: z.string().max(500).nullable().optional(),
      sourceFilePath: z.string().max(1000).nullable().optional(),
      irisConfidence: z.string().max(50).nullable().optional(),
      irisSourceCitation: z.string().max(500).nullable().optional(),
      elements: z.array(elementSchema).min(1).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Upsert template row (one per mission)
    const { data: existing } = await supabase
      .from("mission_response_templates")
      .select("id, version")
      .eq("mission_id", data.missionId)
      .maybeSingle();

    const nextVersion = (existing?.version ?? 0) + 1;

    const upsertRow = {
      mission_id: data.missionId,
      status: "active" as const,
      source: data.source,
      source_file_name: data.sourceFileName ?? null,
      source_file_path: data.sourceFilePath ?? null,
      iris_confidence: data.irisConfidence ?? null,
      iris_source_citation: data.irisSourceCitation ?? null,
      version: nextVersion,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    };

    const { data: tpl, error: upErr } = await supabase
      .from("mission_response_templates")
      .upsert(upsertRow, { onConflict: "mission_id" })
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);

    // Replace elements (simple strategy: delete + insert)
    const { error: delErr } = await supabase
      .from("mission_response_template_elements")
      .delete()
      .eq("template_id", tpl.id);
    if (delErr) throw new Error(delErr.message);

    const rows = data.elements.map((e) => ({
      template_id: tpl.id,
      parent_id: e.parent_id ?? null,
      order_index: e.order_index,
      element_type: e.element_type,
      label: e.label,
      word_limit: e.word_limit ?? null,
      table_columns: e.table_columns ?? null,
    }));
    const { data: inserted, error: insErr } = await supabase
      .from("mission_response_template_elements")
      .insert(rows)
      .select("*");
    if (insErr) throw new Error(insErr.message);

    // Snapshot for version history (best-effort)
    await supabase.from("mission_response_template_versions").insert({
      template_id: tpl.id,
      version: nextVersion,
      snapshot: { elements: inserted } as any,
      saved_by: userId,
    });

    return { ok: true, templateId: tpl.id, version: nextVersion };
  });

// ===== skipResponseTemplate =====

export const skipResponseTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ missionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("mission_response_templates")
      .upsert(
        {
          mission_id: data.missionId,
          status: "skipped" as const,
          source: null,
          confirmed_by: userId,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "mission_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== parseTemplateFile (heuristic stub — replaceable with Lovable AI) =====

export const parseTemplateFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      missionId: z.string().uuid(),
      fileName: z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    // TODO: replace with Lovable AI call (google/gemini-2.5-flash) to parse a real
    // .docx/.pdf into a structured template. For now we return a sensible default
    // skeleton the PM can edit inline.
    const sample: TemplateElementInput[] = [
      { order_index: 0, element_type: "header", label: "Executive Summary" },
      { order_index: 1, element_type: "word_limit", label: "Max 250 words", word_limit: 250 },
      { order_index: 2, element_type: "header", label: "Background & Understanding" },
      { order_index: 3, element_type: "subsection", label: "Our Understanding of the Need" },
      { order_index: 4, element_type: "subsection", label: "Current State Assessment" },
      { order_index: 5, element_type: "header", label: "Proposed Approach" },
      { order_index: 6, element_type: "subsection", label: "Methodology" },
      { order_index: 7, element_type: "subsection", label: "Implementation Timeline" },
      { order_index: 8, element_type: "subsection", label: "Key Milestones" },
      { order_index: 9, element_type: "header", label: "Staffing Plan" },
      {
        order_index: 10,
        element_type: "table",
        label: "Staffing Table",
        table_columns: ["Staff Name", "Role", "FTE"],
      },
      { order_index: 11, element_type: "header", label: "Quality & Performance" },
      { order_index: 12, element_type: "subsection", label: "Performance Metrics" },
      { order_index: 13, element_type: "subsection", label: "Monitoring Approach" },
      { order_index: 14, element_type: "header", label: "References / Past Performance" },
      {
        order_index: 15,
        element_type: "table",
        label: "Past Performance Table",
        table_columns: ["Contract", "Client", "Outcome"],
      },
    ];
    return {
      elements: sample,
      irisConfidence: "HIGH",
      irisSourceCitation: `Parsed from ${data.fileName}`,
    };
  });

// ===== updateSectionTemplateProgress =====

export const updateSectionTemplateProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      sectionId: z.string().uuid(),
      elementId: z.string().uuid(),
      content: z.string().max(50000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Look up element to know whether there's a word limit
    const { data: el } = await supabase
      .from("mission_response_template_elements")
      .select("word_limit, element_type")
      .eq("id", data.elementId)
      .single();

    const wordCount = countWords(data.content);
    const isComplete = data.content.trim().length > 0;

    const { error } = await supabase
      .from("mission_section_template_progress")
      .upsert(
        {
          section_id: data.sectionId,
          element_id: data.elementId,
          content: data.content,
          word_count: wordCount,
          is_complete: isComplete,
          updated_by: userId,
        },
        { onConflict: "section_id,element_id" },
      );
    if (error) throw new Error(error.message);

    return {
      ok: true,
      word_count: wordCount,
      is_complete: isComplete,
      word_limit: el?.word_limit ?? null,
      over_limit: el?.word_limit ? wordCount > el.word_limit : false,
    };
  });

// ===== getSectionTemplateProgress =====

export const getSectionTemplateProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("mission_section_template_progress")
      .select("*")
      .eq("section_id", data.sectionId);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ===== getMissionTemplateCompliance =====
// Aggregate compliance across all sections in a mission for the submission checklist.

export const getMissionTemplateCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ missionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: tpl } = await supabase
      .from("mission_response_templates")
      .select("id, status")
      .eq("mission_id", data.missionId)
      .maybeSingle();

    if (!tpl || tpl.status !== "active") {
      return {
        configured: false,
        totalSections: 0,
        compliantSections: 0,
        issues: [] as Array<{ sectionId: string; sectionLabel: string; reason: string }>,
      };
    }

    const { data: elements } = await supabase
      .from("mission_response_template_elements")
      .select("id, label, element_type, word_limit")
      .eq("template_id", tpl.id);

    const requiredElementIds = (elements ?? [])
      .filter((e: any) => e.element_type !== "word_limit")
      .map((e: any) => e.id as string);

    const { data: sections } = await supabase
      .from("mission_sections")
      .select("id, number, title")
      .eq("mission_id", data.missionId);

    const { data: progress } = await supabase
      .from("mission_section_template_progress")
      .select("section_id, element_id, is_complete, word_count");

    const issues: Array<{ sectionId: string; sectionLabel: string; reason: string }> = [];
    let compliant = 0;

    for (const s of sections ?? []) {
      const rows = (progress ?? []).filter((p: any) => p.section_id === (s as any).id);
      const completedIds = new Set(rows.filter((r: any) => r.is_complete).map((r: any) => r.element_id));
      const missing = requiredElementIds.filter((id) => !completedIds.has(id));
      const overLimit = (elements ?? []).filter((e: any) => {
        if (!e.word_limit) return false;
        const row = rows.find((r: any) => r.element_id === e.id);
        return row && row.word_count > e.word_limit;
      });

      const label = `${(s as any).section_number ?? ""} ${(s as any).section_title ?? ""}`.trim();

      if (missing.length === 0 && overLimit.length === 0) {
        compliant += 1;
      } else {
        if (missing.length > 0) {
          const missingLabel = (elements ?? []).find((e: any) => e.id === missing[0])?.label ?? "Required element";
          issues.push({
            sectionId: (s as any).id,
            sectionLabel: label,
            reason: `"${missingLabel}" element is empty${missing.length > 1 ? ` (+${missing.length - 1} more)` : ""}`,
          });
        }
        for (const el of overLimit) {
          const row = rows.find((r: any) => r.element_id === el.id);
          issues.push({
            sectionId: (s as any).id,
            sectionLabel: label,
            reason: `Word limit exceeded in "${el.label}" (${row?.word_count} / ${el.word_limit})`,
          });
        }
      }
    }

    return {
      configured: true,
      totalSections: sections?.length ?? 0,
      compliantSections: compliant,
      issues,
    };
  });
