import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callIris } from "./iris-prompts";
import { promptForLayer, type IntelligenceLayer } from "./iris-intelligence-prompts";

const layerSchema = z.enum(["mission_brief", "strategic_assessment"]);

/**
 * Generate IRIS intelligence for a mission, for the given layer, from the
 * given set of completed mission_documents. Upserts on (mission_id, layer),
 * incrementing `version` on each regeneration.
 */
export const generateIrisIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mission_id: z.string().uuid(),
        document_ids: z.array(z.string().uuid()).min(1).max(50),
        layer: layerSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1. Fetch only completed docs the caller can read (RLS filters automatically).
    const { data: docs, error: docsErr } = await supabase
      .from("mission_documents")
      .select("id, file_name, document_type, extracted_text, processing_status")
      .eq("mission_id", data.mission_id)
      .in("id", data.document_ids)
      .eq("processing_status", "complete");

    if (docsErr) {
      return { success: false as const, error: "documents_read_failed", detail: docsErr.message };
    }
    if (!docs || docs.length === 0) {
      return { success: false as const, error: "no_complete_documents" };
    }

    // 2. Build corpus. Cap per-doc text so we stay within model context window.
    const PER_DOC_CAP = 60_000;
    const corpus = docs
      .map((d) => {
        const body = (d.extracted_text ?? "").slice(0, PER_DOC_CAP);
        return `[DOCUMENT: ${d.file_name} | TYPE: ${d.document_type}]\n${body}`;
      })
      .join("\n\n");

    if (corpus.trim().length < 100) {
      return { success: false as const, error: "insufficient_text" };
    }

    // 3. Call IRIS with the layer-appropriate prompt.
    const systemPrompt = promptForLayer(data.layer as IntelligenceLayer);
    const raw = await callIris(systemPrompt, corpus);
    if (!raw) {
      return { success: false as const, error: "ai_unavailable" };
    }

    // 4. Parse JSON. Strip markdown code fences if the model wrapped them.
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let content: unknown;
    try {
      content = JSON.parse(cleaned);
    } catch {
      return { success: false as const, error: "malformed_json", raw_preview: cleaned.slice(0, 400) };
    }

    // 5. Upsert. If a row exists for (mission_id, layer), bump version.
    const { data: existing } = await supabase
      .from("mission_intelligence")
      .select("id, version")
      .eq("mission_id", data.mission_id)
      .eq("layer", data.layer)
      .maybeSingle();

    const nextVersion = (existing?.version ?? 0) + 1;
    const nowIso = new Date().toISOString();

    if (existing?.id) {
      const { data: updated, error: updErr } = await supabase
        .from("mission_intelligence")
        .update({
          content: content as never,
          version: nextVersion,
          generated_at: nowIso,
          source_document_ids: data.document_ids,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (updErr) return { success: false as const, error: "save_failed", detail: updErr.message };
      return {
        success: true as const,
        intelligence_id: updated.id,
        layer: data.layer,
        version: nextVersion,
      };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("mission_intelligence")
      .insert({
        mission_id: data.mission_id,
        layer: data.layer,
        content: content as never,
        version: 1,
        generated_at: nowIso,
        source_document_ids: data.document_ids,
      })
      .select("id")
      .single();
    if (insErr) return { success: false as const, error: "save_failed", detail: insErr.message };

    return {
      success: true as const,
      intelligence_id: inserted.id,
      layer: data.layer,
      version: 1,
    };
  });

export const getMissionIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mission_id: z.string().uuid(),
        layer: layerSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mission_intelligence")
      .select("id, mission_id, layer, content, version, generated_at, source_document_ids, iris_notes")
      .eq("mission_id", data.mission_id)
      .eq("layer", data.layer)
      .maybeSingle();
    if (error) return { intelligence: null, error: error.message };
    return { intelligence: row, error: null as string | null };
  });

export const listMissionDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mission_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mission_documents")
      .select("id, file_name, file_path, document_type, processing_status, page_count, uploaded_by, processed_at, created_at")
      .eq("mission_id", data.mission_id)
      .order("created_at", { ascending: false });
    if (error) return { documents: [], error: error.message };
    return { documents: rows ?? [], error: null as string | null };
  });

export const createMissionDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        mission_id: z.string().uuid(),
        file_name: z.string().min(1).max(500),
        file_path: z.string().min(1).max(1000),
        document_type: z.enum([
          "RFP",
          "Amendment",
          "Model Contract",
          "Regulation",
          "Waiver",
          "Legislative",
          "Stakeholder Report",
          "Advocacy",
          "Research",
          "News",
          "Provider Materials",
          "Incumbent Report",
          "Other",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .from("mission_documents")
      .insert({
        mission_id: data.mission_id,
        file_name: data.file_name,
        file_path: data.file_path,
        document_type: data.document_type,
        uploaded_by: context.userId,
        processing_status: "pending",
      })
      .select("id")
      .single();
    if (error) return { id: null as string | null, error: error.message };
    return { id: inserted.id, error: null as string | null };
  });

export const markDocumentProcessed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        extracted_text: z.string(),
        page_count: z.number().int().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const text = data.extracted_text.slice(0, 1_000_000); // 1MB cap
    const { error } = await context.supabase
      .from("mission_documents")
      .update({
        extracted_text: text,
        page_count: data.page_count ?? null,
        processing_status: text.trim().length > 0 ? "complete" : "error",
        processed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null as string | null };
  });

export const markDocumentError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mission_documents")
      .update({ processing_status: "error", processed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null as string | null };
  });

export const deleteMissionDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Fetch file_path to remove from storage too.
    const { data: doc } = await context.supabase
      .from("mission_documents")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (doc?.file_path) {
      await context.supabase.storage.from("mission-documents").remove([doc.file_path]);
    }
    const { error } = await context.supabase.from("mission_documents").delete().eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null as string | null };
  });
