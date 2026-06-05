// Server-only: extract Canon entries from an uploaded document using AI.
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocxText, extractPdfText } from "./rfp-text.server";

const CANON_CATEGORIES = [
  "Federal Statutes",
  "Federal Regulations",
  "CMS Guidance",
  "Medicaid Authorities",
  "Medicare Authorities",
  "MACPAC / MedPAC",
  "KFF Reference",
  "Athena Playbooks",
  "Athena Methodologies",
  "Writing Standards",
];

export type SuggestedCanonEntry = {
  topic: string;
  category: string;
  citation?: string;
  content: string;
  source_url?: string;
  tags?: string[];
  priority?: number;
};

export async function extractTextFromCanonUpload(
  supabase: SupabaseClient,
  filePath: string,
  fileName: string,
  mimeType: string | null,
): Promise<string> {
  const { data: file, error } = await supabase.storage.from("canon-uploads").download(filePath);
  if (error || !file) throw new Error(`download failed: ${error?.message ?? "unknown"}`);
  const bytes = await file.arrayBuffer();
  const lower = fileName.toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();
  if (lower.endsWith(".pdf") || mime.includes("pdf")) return (await extractPdfText(bytes)).trim();
  if (lower.endsWith(".docx") || mime.includes("officedocument.wordprocessing"))
    return (await extractDocxText(bytes)).trim();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || mime.startsWith("text/"))
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
  throw new Error(`Unsupported file type: ${mimeType ?? fileName}`);
}

export async function suggestCanonEntriesFromText(
  text: string,
  hint: { sourceUrl?: string; defaultCategory?: string } = {},
): Promise<SuggestedCanonEntry[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const trimmed = text.slice(0, 60_000);
  const system = `You convert source documents into "Canon" entries for Athena Strategy Group's IRIS intelligence system.

Canon entries are short, durable, firm-wide rules and references — NOT the full document. Extract the highest-signal facts, rules, citations, win themes, or methodology points worth memorizing.

For each entry produce JSON:
- topic: short title (≤80 chars)
- category: one of ${CANON_CATEGORIES.map((c) => `"${c}"`).join(", ")}
- citation: optional formal citation (e.g. "42 CFR §438.68", "SSA §1932")
- content: 1–4 sentences, dense and operational. Quantify where possible. No filler.
- tags: 2–5 short kebab-case tags
- priority: 1 (firm-wide non-negotiable) to 5 (reference)

Return STRICT JSON: { "entries": [...] }. 3–10 entries typical. No prose outside the JSON.`;

  const user = `Source URL (if any): ${hint.sourceUrl ?? "n/a"}
Suggested default category: ${hint.defaultCategory ?? "n/a"}

DOCUMENT TEXT:
"""
${trimmed}
"""`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
  const entries: SuggestedCanonEntry[] = Array.isArray(parsed.entries) ? parsed.entries : [];
  return entries
    .filter((e) => e && e.topic && e.content && e.category)
    .map((e) => ({
      topic: String(e.topic).slice(0, 200),
      category: CANON_CATEGORIES.includes(e.category) ? e.category : (hint.defaultCategory ?? "CMS Guidance"),
      citation: e.citation ? String(e.citation).slice(0, 200) : undefined,
      content: String(e.content).slice(0, 4000),
      source_url: hint.sourceUrl,
      tags: Array.isArray(e.tags) ? e.tags.slice(0, 6).map((t: any) => String(t).slice(0, 40)) : [],
      priority: typeof e.priority === "number" && e.priority >= 1 && e.priority <= 5 ? e.priority : 3,
    }));
}
