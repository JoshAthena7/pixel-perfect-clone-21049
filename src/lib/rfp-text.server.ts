// Server-only helpers for downloading + extracting RFP text.
// Imported by createServerFn handlers — never by client code.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : text;
  return joined.replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const head = new Uint8Array(bytes.slice(0, 4));
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  if (isPdf) return extractPdfText(bytes);
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!isZip) {
    throw new Error("This file is not a valid .docx or .pdf document. Please re-upload as .docx or .pdf.");
  }
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

  const lower = (doc.name as string).toLowerCase();
  const bytes = await file.arrayBuffer();
  let text = "";
  if (lower.endsWith(".docx")) {
    text = await extractDocxText(bytes);
  } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } else {
    throw new Error(
      `IRIS can only analyze .docx (or .txt/.md) files right now — "${doc.name}" is not supported. Please re-upload the RFP/amendment as a Word .docx file.`,
    );
  }
  if (text.length < 200) throw new Error("Document text too short — could not extract meaningful content");
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
