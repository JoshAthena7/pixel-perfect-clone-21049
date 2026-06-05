// Server-only: extract text from a Vault document and embed it for IRIS retrieval.
// Mirrors the Library extraction pattern but reads from mission_vault_documents.
// Called from vault.functions.ts after upload + by the backfill route.

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocxText, extractPdfText } from "./rfp-text.server";
import { embed, storeEmbedding } from "./intel-enrich.server";

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS = 60; // hard cap to keep embedding cost bounded per doc

function chunkText(text: string): string[] {
  const out: string[] = [];
  if (!text) return out;
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  let i = 0;
  while (i < clean.length && out.length < MAX_CHUNKS) {
    const end = Math.min(i + CHUNK_SIZE, clean.length);
    out.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return out;
}

export async function extractAndEmbedVaultDoc(
  supabase: SupabaseClient,
  vaultDocId: string,
): Promise<{ ok: boolean; status: string; chunks: number; error?: string }> {
  // 1. Load the row
  const { data: row, error: rowErr } = await supabase
    .from("mission_vault_documents")
    .select("id, mission_id, title, file_path, mime_type")
    .eq("id", vaultDocId)
    .maybeSingle();
  if (rowErr || !row) return { ok: false, status: "failed", chunks: 0, error: "vault doc not found" };
  if (!row.file_path) {
    await supabase
      .from("mission_vault_documents")
      .update({ extraction_status: "no_file", extracted_at: new Date().toISOString(), extraction_error: null })
      .eq("id", vaultDocId);
    return { ok: true, status: "no_file", chunks: 0 };
  }

  // 2. Mark processing
  await supabase
    .from("mission_vault_documents")
    .update({ extraction_status: "processing", extraction_error: null })
    .eq("id", vaultDocId);

  try {
    // 3. Download bytes
    const { data: file, error: dlErr } = await supabase.storage
      .from("mission-library")
      .download(row.file_path);
    if (dlErr || !file) throw new Error(`download failed: ${dlErr?.message ?? "unknown"}`);
    const bytes = await file.arrayBuffer();

    // 4. Extract text by type
    const lower = (row.title as string).toLowerCase();
    const mime = (row.mime_type ?? "").toLowerCase();
    let text = "";
    if (lower.endsWith(".pdf") || mime.includes("pdf")) {
      text = await extractPdfText(bytes);
    } else if (lower.endsWith(".docx") || mime.includes("officedocument.wordprocessing")) {
      text = await extractDocxText(bytes);
    } else if (lower.endsWith(".txt") || lower.endsWith(".md") || mime.startsWith("text/")) {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else {
      // Unsupported (e.g. image, xlsx) — mark skipped, keep the row
      await supabase
        .from("mission_vault_documents")
        .update({
          extraction_status: "skipped",
          extracted_at: new Date().toISOString(),
          extraction_error: `Unsupported file type: ${row.mime_type ?? "unknown"}`,
        })
        .eq("id", vaultDocId);
      return { ok: true, status: "skipped", chunks: 0 };
    }

    text = text.trim();
    if (text.length < 50) {
      await supabase
        .from("mission_vault_documents")
        .update({
          extraction_status: "skipped",
          extracted_at: new Date().toISOString(),
          extraction_error: "extracted text too short",
        })
        .eq("id", vaultDocId);
      return { ok: true, status: "skipped", chunks: 0 };
    }

    // 5. Persist extracted text (cap at ~250k chars; embeddings handle the chunking)
    const stored = text.slice(0, 250_000);

    // 6. Replace any prior embedding rows for this vault doc
    await supabase
      .from("embeddings")
      .delete()
      .eq("source_table", "mission_vault_documents")
      .eq("source_id", vaultDocId);

    // 7. Chunk + embed + store
    const chunks = chunkText(stored);
    let embedded = 0;
    for (const chunk of chunks) {
      const labeled = `[Vault · ${row.title}]\n${chunk}`;
      const vec = await embed(labeled);
      if (!vec) continue;
      await storeEmbedding({
        source_table: "mission_vault_documents",
        source_id: vaultDocId,
        mission_id: row.mission_id,
        content_text: labeled,
        vector: vec,
        scope: "mission",
      });
      embedded++;
    }

    // 8. Finalize
    await supabase
      .from("mission_vault_documents")
      .update({
        extracted_text: stored,
        extraction_status: embedded > 0 ? "ready" : "failed",
        extracted_at: new Date().toISOString(),
        extraction_error: embedded > 0 ? null : "no chunks embedded",
      })
      .eq("id", vaultDocId);

    return { ok: embedded > 0, status: embedded > 0 ? "ready" : "failed", chunks: embedded };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    await supabase
      .from("mission_vault_documents")
      .update({
        extraction_status: "failed",
        extracted_at: new Date().toISOString(),
        extraction_error: msg.slice(0, 500),
      })
      .eq("id", vaultDocId);
    return { ok: false, status: "failed", chunks: 0, error: msg };
  }
}
