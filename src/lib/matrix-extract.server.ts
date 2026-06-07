// Server-only: extract a mission's question + assignment matrix from an uploaded file.
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocxText, extractPdfText } from "./rfp-text.server";

export type SuggestedQuestion = {
  question_number: string;
  title: string;
  question_text?: string;
  section_number?: string;
  parent_number?: string;
  volume?: string;
  assigned_writer_name?: string;
  assigned_sme_name?: string;
  strategic_owner_name?: string;
  support_sme_names?: string[];
  page_limit?: number | null;
  evaluation_weight?: number | null;
  pens_down_date?: string | null;
  scoring_criteria?: string;
  import_notes?: string;
};

export type ExtractedMatrix = {
  questions: SuggestedQuestion[];
  sections: { number: string; title?: string }[];
  people: { name: string; role?: "writer" | "sme" | "owner" | "both"; email?: string }[];
  notes?: string;
};

export type SpreadsheetPreview = {
  sheetName: string;
  headers: string[];
  rows: string[][]; // up to 8 sample rows
  totalRows: number;
  guessedMapping: Record<string, MappingTarget>; // header -> target field
};

export type MappingTarget =
  | "skip"
  | "question_number"
  | "title"
  | "question_text"
  | "section_number"
  | "parent_number"
  | "volume"
  | "assigned_writer_name"
  | "assigned_sme_name"
  | "strategic_owner_name"
  | "support_sme_names"
  | "page_limit"
  | "evaluation_weight"
  | "pens_down_date"
  | "scoring_criteria"
  | "import_notes";

export const MAPPING_LABELS: Record<MappingTarget, string> = {
  skip: "Skip column",
  question_number: "Question Number",
  title: "Question Title",
  question_text: "Question Text / Prompt",
  section_number: "Section Number",
  parent_number: "Parent Question Number",
  volume: "Volume",
  assigned_writer_name: "Athena Writer",
  assigned_sme_name: "Lead SME",
  strategic_owner_name: "Strategic Owner",
  support_sme_names: "Support SME(s)",
  page_limit: "Page Limit",
  evaluation_weight: "Evaluation Weight",
  pens_down_date: "Pens-Down Date",
  scoring_criteria: "Scoring Criteria",
  import_notes: "Notes / Comments",
};

function guessMapping(header: string): MappingTarget {
  const h = header.toLowerCase().trim().replace(/[_\-\s]+/g, " ");
  if (/^(q(uestion)?\s*(no|num|number|#|id))$/i.test(h) || h === "q" || h === "id" || h === "#")
    return "question_number";
  if (/(question\s*title|title|name|prompt\s*title)/i.test(h)) return "title";
  if (/(question\s*text|prompt|description|requirement)/i.test(h)) return "question_text";
  if (/(section|chapter)/i.test(h)) return "section_number";
  if (/parent/i.test(h)) return "parent_number";
  if (/volume/i.test(h)) return "volume";
  if (/(athena\s*writer|^writer$|primary writer|drafter|author)/i.test(h)) return "assigned_writer_name";
  if (/(lead\s*sme|primary\s*sme|^sme$|subject matter expert)/i.test(h)) return "assigned_sme_name";
  if (/(strategic\s*owner|owner|exec\s*owner|executive)/i.test(h)) return "strategic_owner_name";
  if (/(support\s*sme|secondary\s*sme|backup\s*sme|additional\s*sme)/i.test(h)) return "support_sme_names";
  if (/(page\s*limit|pages|max pages)/i.test(h)) return "page_limit";
  if (/(weight|points|score weight|evaluation)/i.test(h)) return "evaluation_weight";
  if (/(pens?\s*down|due|deadline|due date)/i.test(h)) return "pens_down_date";
  if (/(scoring|criteria|rubric)/i.test(h)) return "scoring_criteria";
  if (/(notes?|comments?|remarks?)/i.test(h)) return "import_notes";
  return "skip";
}

async function downloadMatrixFile(
  supabase: SupabaseClient,
  filePath: string,
): Promise<ArrayBuffer> {
  const { data: file, error } = await supabase.storage.from("mission-matrix").download(filePath);
  if (error || !file) throw new Error(`download failed: ${error?.message ?? "unknown"}`);
  return await file.arrayBuffer();
}

function isSpreadsheet(fileName: string, mimeType: string | null): boolean {
  const lower = fileName.toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv"
  );
}

export async function previewSpreadsheet(
  supabase: SupabaseClient,
  filePath: string,
  fileName: string,
  mimeType: string | null,
): Promise<SpreadsheetPreview> {
  if (!isSpreadsheet(fileName, mimeType)) {
    throw new Error("This preview is only available for spreadsheet uploads (XLSX/CSV).");
  }
  const bytes = await downloadMatrixFile(supabase, filePath);
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(bytes), { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Spreadsheet is empty.");
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("Could not read first sheet.");

  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: "",
  }) as unknown as string[][];

  if (grid.length === 0) throw new Error("Sheet has no data.");

  // Heuristic: find header row — first row where most cells are non-empty short strings.
  let headerIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const row = grid[i] ?? [];
    const filled = row.filter((c) => String(c ?? "").trim().length > 0).length;
    const shortish = row.filter((c) => {
      const s = String(c ?? "").trim();
      return s.length > 0 && s.length < 60;
    }).length;
    const score = filled + shortish * 0.5;
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  }

  const rawHeaders = (grid[headerIdx] ?? []).map((h) => String(h ?? "").trim());
  // De-duplicate empty headers
  const headers = rawHeaders.map((h, i) => h || `Column ${i + 1}`);
  const bodyRows = grid.slice(headerIdx + 1, headerIdx + 1 + 8).map((r) =>
    headers.map((_, ci) => String(r?.[ci] ?? "").trim()),
  );

  const guessedMapping: Record<string, MappingTarget> = {};
  const usedTargets = new Set<MappingTarget>();
  for (const h of headers) {
    let g = guessMapping(h);
    // Prevent duplicate primary targets (other than skip / support_sme_names)
    if (g !== "skip" && g !== "support_sme_names" && usedTargets.has(g)) g = "skip";
    guessedMapping[h] = g;
    if (g !== "skip") usedTargets.add(g);
  }

  return {
    sheetName,
    headers,
    rows: bodyRows,
    totalRows: Math.max(0, grid.length - headerIdx - 1),
    guessedMapping,
  };
}

export async function applySpreadsheetMapping(
  supabase: SupabaseClient,
  filePath: string,
  fileName: string,
  mimeType: string | null,
  mapping: Record<string, MappingTarget>,
): Promise<SuggestedQuestion[]> {
  if (!isSpreadsheet(fileName, mimeType)) {
    throw new Error("Mapping is only available for spreadsheet uploads (XLSX/CSV).");
  }
  const bytes = await downloadMatrixFile(supabase, filePath);
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(bytes), { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Spreadsheet is empty.");
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("Could not read first sheet.");
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: "",
  }) as unknown as string[][];

  // Re-find header row using the same heuristic
  let headerIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const row = grid[i] ?? [];
    const filled = row.filter((c) => String(c ?? "").trim().length > 0).length;
    if (filled > bestScore) {
      bestScore = filled;
      headerIdx = i;
    }
  }
  const rawHeaders = (grid[headerIdx] ?? []).map((h) => String(h ?? "").trim());
  const headers = rawHeaders.map((h, i) => h || `Column ${i + 1}`);

  // Build column-index map by target.
  const targetIndices: Partial<Record<MappingTarget, number[]>> = {};
  headers.forEach((h, idx) => {
    const t = mapping[h] ?? "skip";
    if (t === "skip") return;
    (targetIndices[t] ??= []).push(idx);
  });

  const getCell = (row: string[], target: MappingTarget): string => {
    const indices = targetIndices[target];
    if (!indices || indices.length === 0) return "";
    for (const i of indices) {
      const v = String(row[i] ?? "").trim();
      if (v) return v;
    }
    return "";
  };
  const getCellList = (row: string[], target: MappingTarget): string[] => {
    const indices = targetIndices[target];
    if (!indices || indices.length === 0) return [];
    const out: string[] = [];
    for (const i of indices) {
      const v = String(row[i] ?? "").trim();
      if (!v) continue;
      for (const part of v.split(/[;,/\n]+/)) {
        const trimmed = part.trim();
        if (trimmed) out.push(trimmed);
      }
    }
    return Array.from(new Set(out));
  };
  const parseWeight = (raw: string): number | null => {
    if (!raw) return null;
    const m = raw.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;
  };
  const parsePages = (raw: string): number | null => {
    if (!raw) return null;
    const m = raw.match(/\d+/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    return n > 0 && n < 1000 ? n : null;
  };
  const parseDate = (raw: string): string | null => {
    if (!raw) return null;
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  const bodyRows = grid.slice(headerIdx + 1);
  const out: SuggestedQuestion[] = [];

  for (const r of bodyRows) {
    const row = headers.map((_, ci) => String(r?.[ci] ?? "").trim());
    const isBlank = row.every((c) => !c);
    if (isBlank) continue;

    const qnum = getCell(row, "question_number");
    const title = getCell(row, "title") || getCell(row, "question_text").slice(0, 140);
    if (!qnum || !title) continue;

    const support = getCellList(row, "support_sme_names");
    const q: SuggestedQuestion = {
      question_number: qnum.slice(0, 30),
      title: title.slice(0, 280),
      question_text: getCell(row, "question_text").slice(0, 8000) || undefined,
      section_number: getCell(row, "section_number").slice(0, 30) || undefined,
      parent_number: getCell(row, "parent_number").slice(0, 30) || undefined,
      volume: getCell(row, "volume").slice(0, 120) || undefined,
      assigned_writer_name: getCell(row, "assigned_writer_name").slice(0, 120) || undefined,
      assigned_sme_name: getCell(row, "assigned_sme_name").slice(0, 120) || undefined,
      strategic_owner_name: getCell(row, "strategic_owner_name").slice(0, 120) || undefined,
      support_sme_names: support.length > 0 ? support : undefined,
      page_limit: parsePages(getCell(row, "page_limit")),
      evaluation_weight: parseWeight(getCell(row, "evaluation_weight")),
      pens_down_date: parseDate(getCell(row, "pens_down_date")),
      scoring_criteria: getCell(row, "scoring_criteria").slice(0, 2000) || undefined,
      import_notes: getCell(row, "import_notes").slice(0, 4000) || undefined,
    };
    out.push(q);
  }

  if (out.length === 0)
    throw new Error("No question rows detected. Check that Question Number and Question Title columns are mapped.");
  return out;
}

export async function extractTextFromMatrixUpload(
  supabase: SupabaseClient,
  filePath: string,
  fileName: string,
  mimeType: string | null,
): Promise<string> {
  const bytes = await downloadMatrixFile(supabase, filePath);
  const lower = fileName.toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();

  if (isSpreadsheet(fileName, mimeType)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(new Uint8Array(bytes), { type: "array" });
    const out: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      out.push(`\n=== SHEET: ${name} ===\n`);
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
      "volume": "volume name if listed (e.g. 'Technical', 'Management')",
      "assigned_writer_name": "Athena writer / primary drafter name (free text)",
      "assigned_sme_name": "Lead SME name (free text)",
      "strategic_owner_name": "Strategic Owner / executive sponsor name if listed",
      "support_sme_names": ["array of additional / support SME names"],
      "page_limit": number or null,
      "evaluation_weight": number 0-1000 or null (percent or points),
      "pens_down_date": "YYYY-MM-DD or null",
      "scoring_criteria": "short evaluation criteria text if listed",
      "import_notes": "any Comments / Notes / Remarks column value"
    }
  ],
  "sections": [{ "number": "2.1", "title": "Section title" }],
  "people": [{ "name": "Jane Doe", "role": "writer" | "sme" | "owner" | "both", "email": "optional" }],
  "notes": "1–2 sentence summary of what you parsed and any ambiguity"
}

Rules:
- Capture EVERY question row, including sub-questions (e.g. 2.1.a, 2.1.b).
- Derive section_number from the leading numeric prefix.
- If a row has no person listed, omit that field — do not fabricate names.
- Normalize numbers like "Question 3" → "3", "Q2.1" → "2.1".
- For weight, accept "10%", "10 pts", "10" → 10.
- Aggregate unique person names into "people".
- Support SMEs may be in a single cell separated by commas or semicolons — split them.
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
          volume: q.volume ? String(q.volume).trim().slice(0, 120) : undefined,
          assigned_writer_name: q.assigned_writer_name
            ? String(q.assigned_writer_name).trim().slice(0, 120)
            : undefined,
          assigned_sme_name: q.assigned_sme_name
            ? String(q.assigned_sme_name).trim().slice(0, 120)
            : undefined,
          strategic_owner_name: q.strategic_owner_name
            ? String(q.strategic_owner_name).trim().slice(0, 120)
            : undefined,
          support_sme_names: Array.isArray(q.support_sme_names)
            ? q.support_sme_names
                .map((n: any) => String(n ?? "").trim())
                .filter((n: string) => n.length > 0 && n.length < 120)
                .slice(0, 10)
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
          import_notes: q.import_notes ? String(q.import_notes).slice(0, 4000) : undefined,
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
          role: ["writer", "sme", "owner", "both"].includes(p?.role) ? p.role : undefined,
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
