// Mission Activation + Document Intelligence Pipeline
import { withPersonFirst } from "./person-first";
// Server-side orchestration for extracting document text, generating themes/entities,
// indexing into document_extractions, and regenerating Briefing Book sections.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractDocxText } from "./rfp-text.server";
import { irisGenerateBriefingSection, BRIEFING_SECTION_KEYS } from "./iris.functions";
import { assertNoPHI } from "@/lib/phi-detection";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const EXTRACTION_MODEL = "google/gemini-2.5-flash";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function extractRawTextFromFile(file: Blob, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  const bytes = await file.arrayBuffer();
  if (lower.endsWith(".docx")) {
    try {
      return await extractDocxText(bytes);
    } catch (e) {
      // fall through to text decode
    }
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  // Best-effort decode for unknown types; still useful when content is mostly text.
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

type ExtractionJson = {
  summary: string;
  key_themes: string[];
  key_entities: string[];
};

async function llmExtractThemes(rawText: string, filename: string, missionName: string): Promise<ExtractionJson> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return { summary: "", key_themes: [], key_entities: [] };
  }
  const trimmed = rawText.slice(0, 24_000);
  const sys =
    "You are IRIS, an analyst building institutional intelligence for Medicaid procurement proposals. " +
    "For a given document, return a concise summary (2-3 sentences), 3-8 key themes (short noun phrases), " +
    "and the most important named entities (people, orgs, agencies, programs, statutes). Output VALID JSON only.";
  const user = `Mission: ${missionName}\nDocument: ${filename}\n\nContent:\n${trimmed}\n\nReturn JSON with this exact shape: {"summary": "...", "key_themes": ["..."], "key_entities": ["..."]}`;
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: withPersonFirst(sys) },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`AI gateway returned ${res.status}`);
  }
  const json: any = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    return {
      summary: String(parsed.summary ?? "").slice(0, 1000),
      key_themes: Array.isArray(parsed.key_themes) ? parsed.key_themes.slice(0, 12).map((s: any) => String(s).slice(0, 120)) : [],
      key_entities: Array.isArray(parsed.key_entities) ? parsed.key_entities.slice(0, 24).map((s: any) => String(s).slice(0, 120)) : [],
    };
  } catch {
    return { summary: "", key_themes: [], key_entities: [] };
  }
}

// ─── extractDocumentIntelligence ────────────────────────────────────────────

export const extractDocumentIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      documentId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: doc, error: docErr } = await supabase
      .from("mission_library")
      .select("id, mission_id, name, file_path, url, category, is_rfp")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document not found");

    const { data: mission } = await supabase
      .from("missions")
      .select("name")
      .eq("id", doc.mission_id)
      .maybeSingle();

    let rawText = "";
    if (doc.file_path) {
      const { data: file, error: dlErr } = await supabase.storage
        .from("mission-library")
        .download(doc.file_path);
      if (dlErr || !file) {
        await supabase.from("document_extractions").upsert(
          {
            document_id: doc.id,
            mission_id: doc.mission_id,
            status: "failed",
            error_message: dlErr?.message ?? "Could not download file",
            processed_at: new Date().toISOString(),
          },
          { onConflict: "document_id" },
        );
        return { ok: false, error: dlErr?.message ?? "Download failed" };
      }
      rawText = await extractRawTextFromFile(file, doc.name);
    } else if (doc.url) {
      rawText = `External link: ${doc.url}\nName: ${doc.name}`;
    }

    let extraction: ExtractionJson = { summary: "", key_themes: [], key_entities: [] };
    let status = "ready";
    let errMsg: string | null = null;
    try {
      if (rawText.trim().length >= 40) {
        extraction = await llmExtractThemes(rawText, doc.name, mission?.name ?? "");
      } else {
        errMsg = "Document text too short to extract themes";
      }
    } catch (e: any) {
      status = "failed";
      errMsg = e?.message ?? "Extraction failed";
    }

    const now = new Date().toISOString();
    // Postgres TEXT columns reject NUL (\u0000) bytes; strip them defensively.
    const stripNul = (s: string) => s.replace(/\u0000/g, "");
    const safeText = stripNul(rawText).slice(0, 200_000);
    const { error: upErr } = await supabase.from("document_extractions").upsert(
      {
        document_id: doc.id,
        mission_id: doc.mission_id,
        extracted_text: safeText,
        key_themes: extraction.key_themes,
        key_entities: extraction.key_entities,
        summary: extraction.summary,
        status,
        error_message: errMsg,
        processed_at: now,
        updated_at: now,
      },
      { onConflict: "document_id" },
    );
    if (upErr) throw new Error(upErr.message);

    // Write a signal so the Mission Intelligence Feed picks this up.
    await supabase.from("signals").insert({
      mission_id: doc.mission_id,
      signal_type: "document_indexed",
      signal_title: `IRIS indexed ${doc.name}`,
      signal_summary: extraction.summary || `Document added to IRIS knowledge base (${doc.category ?? "Other"}).`,
      severity: "info",
      status: "open",
    } as any);

    return {
      ok: status === "ready",
      document_id: doc.id,
      mission_id: doc.mission_id,
      themes: extraction.key_themes,
      entities: extraction.key_entities,
      summary: extraction.summary,
      error: errMsg,
    };
  });

// ─── reindexMissionDocuments ─────────────────────────────────────────────────

export const reindexMissionDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid(),
      onlyMissing: z.boolean().optional().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: docs } = await supabase
      .from("mission_library")
      .select("id")
      .eq("mission_id", data.missionId);
    const allIds = (docs ?? []).map((d) => d.id as string);

    let toProcess = allIds;
    if (data.onlyMissing) {
      const { data: existing } = await supabase
        .from("document_extractions")
        .select("document_id")
        .eq("mission_id", data.missionId);
      const have = new Set((existing ?? []).map((r) => r.document_id as string));
      toProcess = allIds.filter((id) => !have.has(id));
    }

    let ok = 0;
    let failed = 0;
    for (const id of toProcess) {
      try {
        const result = await extractDocumentIntelligence({ data: { documentId: id } });
        if ((result as any)?.ok) ok++; else failed++;
      } catch {
        failed++;
      }
    }
    return { processed: toProcess.length, ok, failed, total: allIds.length };
  });

// ─── getLibraryIndexStatus ───────────────────────────────────────────────────

export const getLibraryIndexStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ count: total }, { data: extractions }] = await Promise.all([
      supabase
        .from("mission_library")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", data.missionId),
      supabase
        .from("document_extractions")
        .select("document_id, processed_at, status")
        .eq("mission_id", data.missionId)
        .order("processed_at", { ascending: false }),
    ]);
    const indexed = (extractions ?? []).filter((e) => e.status === "ready").length;
    const lastIndexedAt = extractions?.[0]?.processed_at ?? null;
    const indexedIds = new Set((extractions ?? []).map((e) => e.document_id as string));
    return {
      total: total ?? 0,
      indexed,
      pending: (total ?? 0) - indexed,
      lastIndexedAt,
      indexedDocumentIds: Array.from(indexedIds),
    };
  });

// ─── regenerateBriefingBook ──────────────────────────────────────────────────
// Sequentially regenerates all briefing sections for a mission, respecting the
// 60s per-section rate limit baked into irisGenerateBriefingSection.

export const regenerateBriefingBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid(),
      sectionKeys: z.array(z.string()).optional(),
      onlyStale: z.boolean().optional().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const keys = (data.sectionKeys && data.sectionKeys.length > 0)
      ? data.sectionKeys
      : BRIEFING_SECTION_KEYS;

    let candidates = keys;
    if (data.onlyStale) {
      const { data: existing } = await supabase
        .from("briefing_book_sections")
        .select("section_key, generated_at")
        .eq("mission_id", data.missionId)
        .in("section_key", keys);
      const fresh = new Set(
        (existing ?? [])
          .filter((s) => s.generated_at && Date.now() - new Date(s.generated_at).getTime() < 60_000)
          .map((s) => s.section_key as string),
      );
      candidates = keys.filter((k) => !fresh.has(k));
    }

    let generated = 0;
    let skipped = 0;
    const errors: Array<{ sectionKey: string; message: string }> = [];

    for (const sectionKey of candidates) {
      try {
        await irisGenerateBriefingSection({ data: { missionId: data.missionId, sectionKey } });
        generated++;
      } catch (e: any) {
        const msg = e?.message ?? "Unknown error";
        if (msg.toLowerCase().includes("please wait")) {
          skipped++;
        } else {
          errors.push({ sectionKey, message: msg });
        }
      }
    }
    return { generated, skipped, errors, total: candidates.length };
  });
