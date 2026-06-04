import { createServerFn } from "@tanstack/react-start";
import { withPersonFirst } from "./person-first";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

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

const AI_PROMPT_CHAR_LIMIT = 26_000;
const QUESTION_START =
  /^(?:(?:question|q)\s*)?(\d{1,3}(?:\.\d{1,3}){0,4}|[A-Z]\d{0,2}|[a-z]|\([a-z]\))[\s).:-]+(.+)/i;
const PROMPT_ACTION =
  /\b(describe|explain|provide|identify|list|include|demonstrate|submit|detail|discuss|respond|response|narrative|approach|plan)\b/i;

function compactRfpTextForAi(text: string): string {
  const normalized = text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const selected = new Map<number, string>();

  const addLine = (index: number) => {
    const line = lines[index];
    if (!line) return;
    selected.set(index, line.slice(0, 1_200));
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const looksLikePrompt =
      line.includes("?") || (QUESTION_START.test(line) && PROMPT_ACTION.test(line));
    if (!looksLikePrompt) continue;
    addLine(i - 1);
    addLine(i);
    addLine(i + 1);
  }

  const compacted = [...selected.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, line]) => line)
    .join("\n");

  return (compacted.length > 2_000 ? compacted : normalized).slice(0, AI_PROMPT_CHAR_LIMIT);
}

function fallbackExtractQuestions(text: string): ParsedQuestion[] {
  const lines = compactRfpTextForAi(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const questions: ParsedQuestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length && questions.length < 120; i += 1) {
    const line = lines[i];
    const match = line.match(QUESTION_START);
    if (!line.includes("?") && !(match && PROMPT_ACTION.test(line))) continue;

    const questionNumber = match?.[1]?.replace(/[()]/g, "") ?? `Q${questions.length + 1}`;
    if (seen.has(questionNumber)) continue;
    seen.add(questionNumber);

    const block = [line];
    for (let j = i + 1; j < lines.length && j <= i + 3 && !QUESTION_START.test(lines[j]); j += 1) {
      block.push(lines[j]);
    }
    const questionText = block.join(" ").slice(0, 8_000);
    questions.push({
      question_number: questionNumber,
      section_number: null,
      title: (match?.[2] ?? questionText).slice(0, 120),
      question_text: questionText,
      page_limit: null,
      word_limit: null,
      evaluation_weight: null,
      scoring_criteria: null,
      requirements: null,
    });
  }

  return questions;
}

/** Extract text from .docx or .pdf — delegates to shared server-only helper. */
async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const { extractDocxText: extract } = await import("./rfp-text.server");
  return extract(bytes);
}

async function callAnthropic(text: string): Promise<ParsedQuestion[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const body = compactRfpTextForAi(text);
  const localQuestions = fallbackExtractQuestions(text);
  if (localQuestions.length > 0) return localQuestions;

  const system = `You extract proposal questions from RFP documents.
Return ONLY a JSON array (no prose, no markdown fences) of objects with this shape:
{ "question_number": string, "section_number": string|null, "title": string (max 120 chars),
  "question_text": string, "page_limit": number|null, "word_limit": number|null,
  "evaluation_weight": number|null, "scoring_criteria": string|null,
  "requirements": string[]|null }
Identify every numbered prompt the bidder must answer. If no questions exist, return [].
Wrap the array in an object: {"questions": [...]}`;

  const models = [
    process.env.IRIS_PARSER_MODEL,
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
          signal: AbortSignal.timeout(45_000),
        });
        if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
        return r;
      });
    } catch {
      return fallbackExtractQuestions(text);
    }

    if (res.status === 402) {
      throw new Error("Lovable AI credits exhausted — add credits in Settings → Workspace → Usage.");
    }
    if (!res.ok) {
      const err = await res.text();
      lastError = `Lovable AI ${res.status}: ${err.slice(0, 400)}`;
      if (res.status === 404 || res.status === 400) continue;
      if (res.status === 408 || res.status === 429 || res.status >= 500) {
        return fallbackExtractQuestions(text);
      }
      throw new Error(lastError);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    // Accept either a raw array or {"questions":[...]}
    try {
      const objStart = cleaned.indexOf("{");
      const objEnd = cleaned.lastIndexOf("}");
      if (objStart >= 0 && objEnd > objStart) {
        const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1));
        if (Array.isArray(obj?.questions)) return obj.questions as ParsedQuestion[];
        if (Array.isArray(obj)) return obj as ParsedQuestion[];
      }
      const arrStart = cleaned.indexOf("[");
      const arrEnd = cleaned.lastIndexOf("]");
      if (arrStart >= 0 && arrEnd > arrStart) {
        const arr = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
        if (Array.isArray(arr)) return arr as ParsedQuestion[];
      }
    } catch {
      continue;
    }
    return [];
  }

  throw new Error(lastError || "Lovable AI unavailable");
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
