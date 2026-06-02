// Server-only helpers for downloading + extracting RFP text.
// Imported by createServerFn handlers — never by client code.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const JSZipMod = await import("jszip");
  const JSZip = (JSZipMod as unknown as { default?: typeof JSZipMod }).default ?? JSZipMod;
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("document.xml not found in .docx");

  const withBreaks = docXml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t");
  const text = withBreaks.replace(/<[^>]+>/g, "");
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Download + extract text from a mission_library document by id. */
export async function loadRfpText(
  supabase: SupabaseClient,
  documentId: string,
): Promise<{ text: string; filename: string; missionId: string }> {
  const { data: doc, error: docErr } = await supabase
    .from("mission_library")
    .select("id, mission_id, name, file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (docErr || !doc) throw new Error("Document not found");
  if (!doc.file_path) throw new Error("Document has no file");

  const { data: file, error: dlErr } = await supabase.storage
    .from("mission-library")
    .download(doc.file_path);
  if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message}`);

  const text = await extractDocxText(await file.arrayBuffer());
  if (text.length < 200) throw new Error("RFP text too short — could not extract meaningful content");
  return { text, filename: doc.name, missionId: doc.mission_id };
}

/** Find the most recent RFP document attached to a mission. */
export async function findLatestRfp(
  supabase: SupabaseClient,
  missionId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("mission_library")
    .select("id, created_at, is_rfp, category")
    .eq("mission_id", missionId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data || data.length === 0) return null;
  const rfp = data.find((d) => d.is_rfp) ?? data.find((d) => d.category === "RFP") ?? data[0];
  return rfp?.id ?? null;
}
