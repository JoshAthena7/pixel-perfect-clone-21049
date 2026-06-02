import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ documentId: z.string().uuid() });

type ParsedQuestion = {
  question_number: string;
  section_number?: string | null;
  title: string;
  question_text: string;
  page_limit?: number | null;
  word_limit?: number | null;
  evaluation_weight?: number | null;
  scoring_criteria?: string | null;
  requirements?: string[] | null;
};

/** Extract text content from .docx (zip → word/document.xml → strip tags). */
async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const JSZipMod = await import("jszip");
  const JSZip = JSZipMod.default ?? JSZipMod;
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("document.xml not found in .docx");
  // Convert paragraph breaks to newlines, drop all other tags
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

async function callAnthropic(text: string): Promise<ParsedQuestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const models = [
    process.env.ANTHROPIC_MODEL,
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-latest",
  ].filter(Boolean) as string[];

  // Truncate to keep prompt manageable
  const MAX_CHARS = 120_000;
  const body = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

  const system = `You extract proposal questions from RFP documents.
Return ONLY a JSON array (no prose, no markdown fences) of objects with this shape:
{ "question_number": string, "section_number": string|null, "title": string (max 120 chars),
  "question_text": string, "page_limit": number|null, "word_limit": number|null,
  "evaluation_weight": number|null, "scoring_criteria": string|null,
  "requirements": string[]|null }
Identify every numbered prompt the bidder must answer. If no questions exist, return [].`;

  let lastError = "";
  for (const model of models) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content: `RFP TEXT:\n\n${body}` }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      lastError = `Anthropic ${res.status}: ${err.slice(0, 500)}`;
      if (res.status === 404 && err.includes("not_found_error")) continue;
      throw new Error(lastError);
    }

    const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "[]";
    // Strip code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start < 0 || end < 0) return [];
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as ParsedQuestion[];
    return Array.isArray(parsed) ? parsed : [];
  }

  throw new Error(lastError || "Anthropic model unavailable");
}

export const parseRfpDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Load the document row
    const { data: doc, error: docErr } = await supabase
      .from("mission_library")
      .select("id, mission_id, name, file_path, is_rfp")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document not found or not accessible");
    if (!doc.file_path) throw new Error("Document has no file_path; cannot parse");

    // 2. Download bytes from storage
    const { data: file, error: dlErr } = await supabase.storage
      .from("mission-library")
      .download(doc.file_path);
    if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message ?? "no file"}`);
    const bytes = await file.arrayBuffer();

    // 3. Extract text
    const text = await extractDocxText(bytes);
    if (text.length < 100) throw new Error("Extracted text is too short to be an RFP");

    // 4. Ask AI to parse questions
    const questions = await callAnthropic(text);
    if (questions.length === 0) {
      await supabase.from("missions").update({ rfp_parsed: true }).eq("id", doc.mission_id);
      return { inserted: 0, message: "No questions detected" };
    }

    // 5. Insert question_records (dedupe by mission + question_number)
    const { data: existing } = await supabase
      .from("question_records")
      .select("question_number")
      .eq("mission_id", doc.mission_id);
    const existingNums = new Set((existing ?? []).map((r) => r.question_number));

    const rows = questions
      .filter((q) => q.question_number && !existingNums.has(q.question_number))
      .map((q, i) => ({
        mission_id: doc.mission_id,
        question_number: String(q.question_number).slice(0, 50),
        section_number: q.section_number?.slice(0, 50) ?? null,
        title: String(q.title ?? q.question_number).slice(0, 200),
        question_text: String(q.question_text ?? "").slice(0, 8000),
        page_limit: q.page_limit ?? null,
        word_limit: q.word_limit ?? null,
        evaluation_weight: q.evaluation_weight ?? null,
        scoring_criteria: q.scoring_criteria?.slice(0, 2000) ?? null,
        requirements: q.requirements ?? null,
        sort_order: i,
        status: "not_started",
        health: "yellow",
      }));

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr, count } = await supabase
        .from("question_records")
        .insert(rows, { count: "exact" });
      if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
      inserted = count ?? rows.length;
    }

    await supabase
      .from("missions")
      .update({ rfp_parsed: true, question_count: (existing?.length ?? 0) + inserted })
      .eq("id", doc.mission_id);

    await supabase.from("olympus_audit_log").insert({
      mission_id: doc.mission_id,
      user_id: userId,
      action_type: "rfp_parsed",
      action_summary: `Parsed RFP "${doc.name}" → ${inserted} new questions`,
      target_table: "question_records",
      target_id: doc.id,
    });

    return { inserted, total_detected: questions.length, document: doc.name };
  });
