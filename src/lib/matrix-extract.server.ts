// Server-only: extract a mission's question + assignment matrix from an uploaded file.
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocxText, extractPdfText } from "./rfp-text.server";

export type SuggestedQuestion = {
  question_number: string;
  title: string;
  question_text?: string;
  section_number?: string;
  parent_number?: string; // refers to another question_number
  assigned_writer_name?: string;
  assigned_sme_name?: string;
  page_limit?: number | null;
  evaluation_weight?: number | null;
  pens_down_date?: string | null; // ISO YYYY-MM-DD
  scoring_criteria?: string;
};

export type ExtractedMatrix = {
  questions: SuggestedQuestion[];
  sections: { number: string; title?: string }[];
  people: { name: string; role?: "writer" | "sme" | "both"; email?: string }[];
  notes?: string;
};

export async function extractTextFromMatrixUpload(
  supabase: SupabaseClient,
  filePath: string,
  fileName: string,
  mimeType: string | null,
): Promise<string> {
  const { data: file, error } = await supabase.storage.from("mission-matrix").download(filePath);
  if (error || !file) throw new Error(`download failed: ${error?.message ?? "unknown"}`);
  const bytes = await file.arrayBuffer();
  const lower = fileName.toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();

  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv"
  ) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(new Uint8Array(bytes), { type: "array" });
    const out: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      out.push(`\n=== SHEET: ${name} ===\n`);
      // Convert to CSV-ish so AI sees a clean grid
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      out.push(csv);
    }
    return out.join("\n").trim();
  }

  if (lower.endsWith(".pdf") || mime.includes("pdf")) return (await extractPdfText(bytes)).trim();
  if (lower.endsWith(".docx") || mime.includes("officedocument.wordprocessing"))
    return (await extractDocxText(bytes)).trim();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || mime.startsWith("text/"))
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();

  throw new Error(`Unsupported file type: ${mimeType ?? fileName}`);
}

export async function extractMatrixFromText(text: string): Promise<ExtractedMatrix> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const trimmed = text.slice(0, 120_000);

  const system = `You are parsing a client-supplied RFP question + assignment matrix for a proposal team.

Return STRICT JSON shaped exactly:
{
  "questions": [
    {
      "question_number": "string (e.g. '1', '2.1', '2.1.a') — required",
      "title": "short title (≤140 chars) — required",
      "question_text": "full question prompt if visible",
      "section_number": "parent section number (e.g. '2', '2.1') — derive from numbering",
      "parent_number": "question_number of parent if this row is a sub-question",
      "assigned_writer_name": "person responsible for drafting (free-text name)",
      "assigned_sme_name": "subject matter expert (free-text name)",
      "page_limit": number or null,
      "evaluation_weight": number 0-100 or null (percent or points),
      "pens_down_date": "YYYY-MM-DD or null",
      "scoring_criteria": "short evaluation criteria text if listed"
    }
  ],
  "sections": [{ "number": "2.1", "title": "Section title" }],
  "people": [{ "name": "Jane Doe", "role": "writer" | "sme" | "both", "email": "optional" }],
  "notes": "1–2 sentence summary of what you parsed and any ambiguity"
}

Rules:
- Capture EVERY question row, including sub-questions (e.g. 2.1.a, 2.1.b).
- Derive section_number from the leading numeric prefix.
- If a row has no person listed, omit that field — do not fabricate names.
- Normalize numbers like "Question 3" → "3", "Q2.1" → "2.1".
- For weight, accept "10%", "10 pts", "10" → 10.
- Aggregate unique person names into "people".
- No prose outside the JSON.`;

  const user = `DOCUMENT (spreadsheet rendered as CSV per sheet, or document text):
"""
${trimmed}
"""`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned non-JSON");
    parsed = JSON.parse(m[0]);
  }

  const questions: SuggestedQuestion[] = Array.isArray(parsed.questions)
    ? parsed.questions
        .filter((q: any) => q && q.question_number && q.title)
        .map((q: any) => ({
          question_number: String(q.question_number).trim().slice(0, 30),
          title: String(q.title).trim().slice(0, 280),
          question_text: q.question_text ? String(q.question_text).slice(0, 8000) : undefined,
          section_number: q.section_number ? String(q.section_number).trim().slice(0, 30) : undefined,
          parent_number: q.parent_number ? String(q.parent_number).trim().slice(0, 30) : undefined,
          assigned_writer_name: q.assigned_writer_name
            ? String(q.assigned_writer_name).trim().slice(0, 120)
            : undefined,
          assigned_sme_name: q.assigned_sme_name
            ? String(q.assigned_sme_name).trim().slice(0, 120)
            : undefined,
          page_limit:
            typeof q.page_limit === "number" && q.page_limit > 0 && q.page_limit < 1000
              ? Math.round(q.page_limit)
              : null,
          evaluation_weight:
            typeof q.evaluation_weight === "number" && q.evaluation_weight >= 0
              ? Number(q.evaluation_weight)
              : null,
          pens_down_date:
            typeof q.pens_down_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.pens_down_date)
              ? q.pens_down_date
              : null,
          scoring_criteria: q.scoring_criteria ? String(q.scoring_criteria).slice(0, 2000) : undefined,
        }))
    : [];

  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .filter((s: any) => s && s.number)
        .map((s: any) => ({
          number: String(s.number).trim().slice(0, 30),
          title: s.title ? String(s.title).trim().slice(0, 200) : undefined,
        }))
    : [];

  const people = Array.isArray(parsed.people)
    ? parsed.people
        .filter((p: any) => p && p.name)
        .map((p: any) => ({
          name: String(p.name).trim().slice(0, 120),
          role: ["writer", "sme", "both"].includes(p?.role) ? p.role : undefined,
          email: typeof p.email === "string" ? p.email.trim().slice(0, 200) : undefined,
        }))
    : [];

  return {
    questions,
    sections,
    people,
    notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 800) : undefined,
  };
}
