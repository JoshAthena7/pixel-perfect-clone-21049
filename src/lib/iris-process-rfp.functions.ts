// IRIS RFP processing: TWO-PASS extraction.
//
// PASS 1 (structure): One AI call to extract volumes/sections/sub_sections
// (with is_form_only flag, no questions). Skipped if mission already has
// sections — makes re-runs idempotent.
//
// PASS 2 (questions): Per non-form section, slice that section's text from
// the combined RFP and call AI to extract questions. Runs with concurrency
// of 3. Upserts on (mission_id, question_number) so re-runs don't duplicate.
//
// Same signature, same return shape as before.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({
  mission_id: z.string().uuid(),
  primary_rfp_text: z.string().trim().min(50).max(800_000),
});

const STRUCTURE_SYSTEM = `You are analyzing a government RFP document. Extract the proposal structure ONLY — do not extract questions in this pass. Return ONLY valid JSON, no other text. Use confidence "high" when an item is explicitly labeled, "medium" when inferred, "low" when guessed.

Set is_form_only=true for sections that are signature forms, certifications, affirmative-action attestations, ownership disclosures, MacBride, or similar non-narrative attachments. Set is_form_only=false for sections that ask the bidder to write a narrative or technical response (Technical Quote, Management Overview, Mobilization Plan, etc.).

{
  "volumes": [
    {
      "name": "string",
      "sections": [
        {
          "number": "string",
          "name": "string",
          "page_limit": null,
          "evaluation_weight": null,
          "description": "string",
          "is_form_only": false,
          "confidence": "high|medium|low",
          "sub_sections": [
            {
              "number": "string",
              "name": "string",
              "page_limit": null,
              "evaluation_weight": null,
              "description": "string",
              "is_form_only": false,
              "confidence": "high|medium|low"
            }
          ]
        }
      ]
    }
  ],
  "submission_deadline_confirmed": "string or null",
  "compliance_requirements": ["string"],
  "submission_checklist_items": ["string"],
  "disclaimer": "string or null"
}`;

const QUESTIONS_SYSTEM = `You are extracting proposal requirements from a government RFP section for a Medicaid procurement response team. Return ONLY valid JSON, no preamble.

{
  "questions": [
    {
      "question_number": "string",
      "question_text": "string — the actual requirement language from the RFP, full sentence(s), minimum 20 words",
      "page_limit": null,
      "word_limit": null,
      "evaluation_weight": null,
      "is_mandatory": true,
      "response_type": "narrative|plan|table|form|attachment"
    }
  ]
}

Extract every SPECIFIC REQUIREMENT or PROMPT that asks the bidder to DO something:
- Write a narrative
- Describe an approach
- Provide a plan
- Submit documentation
- Demonstrate capability
- Explain a process

DO NOT extract:
- Section titles or headers (ALL CAPS lines with no verb, e.g. "TECHNICAL QUOTE", "OFFER AND ACCEPTANCE PAGE")
- Form instructions (signature blocks, date fields, checkbox instructions)
- Page formatting or font-size instructions
- Table of contents entries
- Cross-references like "see Section 3.14"

For each real requirement found, question_text MUST be the actual RFP language verbatim — not a summary, not a rephrasing, not the section title — and MUST be at least 20 words.

If this section contains NO substantive requirements (it is a form, certification, signature page, or purely administrative): return {"questions": []}.

question_number format: "[section_number].[sequence]" e.g. "3.14.1", "3.14.2". Extract page/word limits and evaluation weight when stated.`;

type Conf = "high" | "medium" | "low";
type SubSection = {
  number?: string;
  name: string;
  page_limit?: number | null;
  evaluation_weight?: number | null;
  description?: string;
  is_form_only?: boolean;
  confidence?: Conf;
};
type Section = SubSection & { sub_sections?: SubSection[] };
type Volume = { name: string; sections?: Section[] };
type Structure = {
  volumes?: Volume[];
  compliance_requirements?: string[];
  submission_checklist_items?: string[];
  disclaimer?: string | null;
};
type AIQuestion = {
  question_number?: string;
  question_text: string;
  page_limit?: number | null;
  word_limit?: number | null;
  evaluation_weight?: number | null;
  is_mandatory?: boolean;
  response_type?: string;
};

function safeNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
function conf(v: unknown): Conf {
  return v === "high" || v === "medium" || v === "low" ? v : "low";
}

function tryParseJSON<T = unknown>(s: string): T | null {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

async function callAI(apiKey: string, system: string, user: string): Promise<string | null> {
  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });
  if (res.status === 402) throw new Error("Workspace is out of AI credits.");
  if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("IRIS gateway error", res.status, errBody);
    return null;
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? null;
}

// --- Form-only classification (allow-list) -------------------------------
const FORM_ONLY_SECTIONS = [
  "ownership disclosure",
  "macbride",
  "affirmative action",
  "business registration",
  "certification of non-involvement",
  "disclosure of investigations",
  "offer and acceptance",
  "contract schedule",
  "state-supplied price sheet",
  "small business",
  "pay to play",
  "source disclosure",
  "iran disclosure",
  "russia",
  "belarus",
  "vendor questionnaire",
];
const NARRATIVE_VERBS = [
  "describe", "submit a plan", "set forth", "provide a narrative",
  "explain", "demonstrate", "address", "discuss", "outline", "detail",
  "identify", "provide information", "include a", "develop a", "present",
];
export function classifySectionFormOnly(name: string, description?: string | null): boolean {
  const n = (name ?? "").toLowerCase();
  const d = (description ?? "").toLowerCase();
  if (FORM_ONLY_SECTIONS.some((k) => n.includes(k))) return true;
  if (NARRATIVE_VERBS.some((v) => d.includes(v))) return false;
  return false;
}

/**
 * Bounded section slice: starts at the section header match and stops at the
 * NEXT section header in `allSectionNumbers`. Caps at 12_000 chars. Returns
 * "" if no header match.
 */
function sliceSectionText(
  fullText: string,
  sectionNumber: string | null,
  allSectionNumbers: string[] = [],
): string {
  if (!sectionNumber) return "";
  const escaped = sectionNumber.replace(/\./g, "\\.");
  const startRe = new RegExp(
    `(?:^|\\n)[ \\t]*(?:Section[ \\t]+)?${escaped}(?![0-9])[\\.\\s\\)\\:\\-]`,
    "i",
  );
  const startMatch = startRe.exec(fullText);
  if (!startMatch) return "";
  const startIdx = startMatch.index;

  // Find the immediately-following section header.
  const sorted = allSectionNumbers
    .filter((n) => n && n !== sectionNumber)
    .sort((a, b) => {
      const ap = a.split(".").map((p) => parseInt(p, 10) || 0);
      const bp = b.split(".").map((p) => parseInt(p, 10) || 0);
      for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        const av = ap[i] ?? 0;
        const bv = bp[i] ?? 0;
        if (av !== bv) return av - bv;
      }
      return 0;
    });
  const curParts = sectionNumber.split(".").map((p) => parseInt(p, 10) || 0);
  const nextSection = sorted.find((n) => {
    const np = n.split(".").map((p) => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(np.length, curParts.length); i++) {
      const a = np[i] ?? 0;
      const b = curParts[i] ?? 0;
      if (a !== b) return a > b;
    }
    return false;
  });

  let endIdx = startIdx + 12_000;
  if (nextSection) {
    const escNext = nextSection.replace(/\./g, "\\.");
    const endRe = new RegExp(
      `(?:^|\\n)[ \\t]*(?:Section[ \\t]+)?${escNext}(?![0-9])[\\.\\s\\)\\:\\-]`,
      "i",
    );
    const tail = fullText.slice(startIdx + 1);
    const endMatch = endRe.exec(tail);
    if (endMatch) endIdx = Math.min(startIdx + 1 + endMatch.index, startIdx + 12_000);
  }

  const slice = fullText.slice(startIdx, endIdx).trim();
  return slice.length < 50 ? "" : slice.slice(0, 12_000);
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        await fn(items[i], i);
      } catch (e) {
        console.error("[iris-pass2] worker item failed", e);
      }
    }
  });
  await Promise.all(workers);
}

export type ProcessResult = {
  ok: boolean;
  counts: {
    volumes: number;
    sections: number;
    sub_sections: number;
    questions: number;
    compliance: number;
    checklist: number;
  };
  disclaimer: string | null;
};

export const processRFPDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ProcessResult> => {
    const { supabase } = context;

    const { data: mission, error: mErr } = await supabase
      .from("missions")
      .select("id, created_by")
      .eq("id", data.mission_id)
      .single();
    if (mErr || !mission) throw new Error("Mission not found or access denied.");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured — built-in AI key missing.");

    const counts = {
      volumes: 0,
      sections: 0,
      sub_sections: 0,
      questions: 0,
      compliance: 0,
      checklist: 0,
    };
    let disclaimer: string | null = null;

    // -------- PASS 1: structure (skip if sections already exist) --------
    const { count: existingSectionCount } = await supabase
      .from("mission_sections")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", data.mission_id);

    if ((existingSectionCount ?? 0) === 0) {
      console.log("[iris] Pass 1: extracting structure");
      const content = await callAI(apiKey, STRUCTURE_SYSTEM, data.primary_rfp_text);
      const parsed = content ? tryParseJSON<Structure>(content) : null;
      if (!parsed) {
        return {
          ok: true,
          counts,
          disclaimer: "IRIS could not parse the document structure. Existing data left unchanged.",
        };
      }

      const volumes = Array.isArray(parsed.volumes) ? parsed.volumes : [];
      for (let vi = 0; vi < volumes.length; vi++) {
        const v = volumes[vi] ?? {} as Volume;
        const { data: vRow, error: vErr } = await supabase
          .from("mission_volumes")
          .insert({
            mission_id: data.mission_id,
            name: String(v.name ?? `Volume ${vi + 1}`).slice(0, 500),
            order_index: vi,
          })
          .select("id")
          .single();
        if (vErr || !vRow) continue;
        counts.volumes++;

        const sections = Array.isArray(v.sections) ? v.sections : [];
        for (let si = 0; si < sections.length; si++) {
          const s = sections[si] ?? ({} as Section);
          const { data: sRow, error: sErr } = await supabase
            .from("mission_sections")
            .insert({
              mission_id: data.mission_id,
              volume_id: vRow.id,
              parent_section_id: null,
              section_number: s.number ? String(s.number).slice(0, 50) : null,
              name: String(s.name ?? `Section ${si + 1}`).slice(0, 500),
              page_limit: safeNum(s.page_limit),
              evaluation_weight: safeNum(s.evaluation_weight),
              description: s.description ? String(s.description).slice(0, 4000) : null,
              iris_confidence: conf(s.confidence),
              is_form_only: s.is_form_only === true,
              order_index: si,
            })
            .select("id")
            .single();
          if (sErr || !sRow) continue;
          counts.sections++;

          const subs = Array.isArray(s.sub_sections) ? s.sub_sections : [];
          for (let ssi = 0; ssi < subs.length; ssi++) {
            const ss = subs[ssi] ?? ({} as SubSection);
            const { error: ssErr } = await supabase.from("mission_sections").insert({
              mission_id: data.mission_id,
              volume_id: vRow.id,
              parent_section_id: sRow.id,
              section_number: ss.number ? String(ss.number).slice(0, 50) : null,
              name: String(ss.name ?? `Sub ${ssi + 1}`).slice(0, 500),
              page_limit: safeNum(ss.page_limit),
              evaluation_weight: safeNum(ss.evaluation_weight),
              description: ss.description ? String(ss.description).slice(0, 4000) : null,
              iris_confidence: conf(ss.confidence),
              is_form_only: ss.is_form_only === true,
              order_index: ssi,
            });
            if (!ssErr) counts.sub_sections++;
          }
        }
      }

      // Compliance + checklist (one-shot, only on first structural pass)
      const compliance = Array.isArray(parsed.compliance_requirements)
        ? parsed.compliance_requirements.map((c) => String(c).trim()).filter(Boolean).slice(0, 200)
        : [];
      if (compliance.length > 0) {
        await supabase
          .from("mission_compliance_requirements")
          .delete()
          .eq("mission_id", data.mission_id)
          .eq("iris_extracted", true);
        const { error } = await supabase.from("mission_compliance_requirements").insert(
          compliance.map((requirement) => ({
            mission_id: data.mission_id,
            requirement: requirement.slice(0, 2000),
            status: "not_addressed",
            iris_extracted: true,
          })),
        );
        if (!error) counts.compliance = compliance.length;
      }

      const checklist = Array.isArray(parsed.submission_checklist_items)
        ? parsed.submission_checklist_items.map((c) => String(c).trim()).filter(Boolean).slice(0, 200)
        : [];
      if (checklist.length > 0) {
        await supabase
          .from("mission_submission_checklist")
          .delete()
          .eq("mission_id", data.mission_id)
          .eq("iris_extracted", true);
        const { error } = await supabase.from("mission_submission_checklist").insert(
          checklist.map((label) => ({
            mission_id: data.mission_id,
            label: label.slice(0, 500),
            iris_extracted: true,
          })),
        );
        if (!error) counts.checklist = checklist.length;
      }

      disclaimer =
        typeof parsed.disclaimer === "string" && parsed.disclaimer.trim().length > 0
          ? parsed.disclaimer.trim().slice(0, 2000)
          : null;
      await supabase
        .from("missions")
        .update({ iris_disclaimer: disclaimer })
        .eq("id", data.mission_id);
    } else {
      console.log(`[iris] Pass 1 skipped — ${existingSectionCount} sections already exist`);
    }

    // PASS 2 is performed per-section by the browser orchestrator via
    // `extractQuestionsForSection` below. Each per-section call is a tiny,
    // fast request so the Worker never exceeds its timeout and the wizard
    // never bounces on a long single-shot.
    return { ok: true, counts, disclaimer };
  });

// ---------------------------------------------------------------------------
// PASS 2 — extract questions for ONE section. Called by the browser
// orchestrator with the pre-sliced section text so the server stays fast.
// ---------------------------------------------------------------------------

const SectionInput = z.object({
  mission_id: z.string().uuid(),
  section_id: z.string().uuid(),
  // Allow very short or empty text — orchestrator may pass an empty string
  // when invoking the inferred fallback path.
  section_text: z.string().max(20_000).default(""),
  is_inferred: z.boolean().optional().default(false),
});

const INFERRED_SYSTEM = `You are IRIS, generating LIKELY proposal questions for one RFP section when the actual section text could not be extracted. Return ONLY valid JSON, no preamble.

{
  "questions": [
    {
      "question_number": "string",
      "question_text": "string",
      "page_limit": null,
      "word_limit": null,
      "evaluation_weight": null,
      "is_mandatory": true,
      "response_type": "narrative|form|table|attachment"
    }
  ]
}

Rules:
- Based on the section name/number, generate the questions a typical NJ Medicaid RFP section with this title would require bidders to address.
- These are inferred — keep them realistic and conservative.
- If the section name strongly suggests forms only (e.g. signature pages, disclosures, certifications), return {"questions": []}.
- question_number format: "[section_number].[sequence]" e.g. "3.14.1".`;

export const extractQuestionsForSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SectionInput.parse(d))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; inserted: number; skipped?: string; inferred?: boolean }> => {
      const { supabase } = context;
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("IRIS is not configured — built-in AI key missing.");

      const { data: section, error: sErr } = await supabase
        .from("mission_sections")
        .select("id, section_number, name, is_form_only, mission_id")
        .eq("id", data.section_id)
        .single();
      if (sErr || !section) throw new Error("Section not found or access denied.");
      if (section.mission_id !== data.mission_id) throw new Error("Section/mission mismatch.");
      if (section.is_form_only) return { ok: true, inserted: 0, skipped: "form_only" };
      if (!section.section_number) return { ok: true, inserted: 0, skipped: "no_number" };

      const isInferred = data.is_inferred === true || (data.section_text ?? "").trim().length < 50;
      const systemPrompt = isInferred ? INFERRED_SYSTEM : QUESTIONS_SYSTEM;
      const userMsg = isInferred
        ? `RFP Section: ${section.section_number} — ${section.name}\n\nThe RFP text for this section could not be extracted. Based on the section name and number above, generate the likely questions a typical NJ Medicaid RFP section with this title would require bidders to address.`
        : `RFP Section: ${section.section_number} — ${section.name}\n\nSection text:\n${data.section_text}`;
      const content = await callAI(apiKey, systemPrompt, userMsg);
      if (!content) return { ok: false, inserted: 0, skipped: "ai_no_response", inferred: isInferred };

      const parsed = tryParseJSON<{ questions?: AIQuestion[] }>(content);
      const qs = Array.isArray(parsed?.questions) ? parsed!.questions : [];
      if (qs.length === 0) return { ok: true, inserted: 0, skipped: "no_questions", inferred: isInferred };

      const rows = qs
        .map((q, i) => {
          const text = String(q.question_text ?? "").trim().slice(0, 4000);
          if (!text) return null;
          const qnum = (q.question_number && String(q.question_number).trim()) ||
            `${section.section_number}.${i + 1}`;
          return {
            mission_id: data.mission_id,
            section_id: section.id,
            question_number: qnum.slice(0, 50),
            question_text: text,
            page_limit: safeNum(q.page_limit),
            word_limit: safeNum(q.word_limit),
            evaluation_weight: safeNum(q.evaluation_weight),
            status: "not_started",
            health_status: "healthy",
            iris_brief_status: "pending",
            iris_extracted: !isInferred,
            iris_extracted_at: new Date().toISOString(),
            is_inferred: isInferred,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const rowsByQuestionNumber = new Map<string, (typeof rows)[number]>();
      for (const row of rows) rowsByQuestionNumber.set(row.question_number, row);
      const uniqueRows = Array.from(rowsByQuestionNumber.values());

      if (uniqueRows.length === 0) return { ok: true, inserted: 0, skipped: "empty_rows", inferred: isInferred };

      const questionNumbers = uniqueRows.map((row) => row.question_number);
      const { error: deleteErr } = await supabase
        .from("mission_questions")
        .delete()
        .eq("mission_id", data.mission_id)
        .in("question_number", questionNumbers);
      if (deleteErr) {
        console.error("[iris-pass2] cleanup failed", section.section_number, deleteErr.message);
        return { ok: false, inserted: 0, skipped: "cleanup_error", inferred: isInferred };
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("mission_questions")
        .insert(uniqueRows)
        .select("id");
      if (insertErr) {
        console.error("[iris-pass2] insert failed", section.section_number, insertErr.message);
        return { ok: false, inserted: 0, skipped: "insert_error", inferred: isInferred };
      }
      return { ok: true, inserted: inserted?.length ?? 0, inferred: isInferred };
    },
  );

// Exported so the browser orchestrator can slice text the same way.
export function sliceSectionTextForClient(
  fullText: string,
  sectionNumber: string | null,
): string {
  return sliceSectionText(fullText, sectionNumber);
}

/**
 * Fallback chain for form-driven RFPs where the canonical line-anchored
 * regex misses. Returns the best slice we can find, or "" if none.
 *   1. line-anchored regex (sliceSectionText)
 *   2. inline regex: section number anywhere in the text
 *   3. proportional slice based on section position
 */
export function sliceSectionTextWithFallbacks(
  fullText: string,
  sectionNumber: string | null,
  sectionIndex: number,
  totalSections: number,
): { text: string; attempt: 1 | 2 | 3 | 0 } {
  if (!sectionNumber) return { text: "", attempt: 0 };

  // Attempt 1 — strict line-anchored regex
  const attempt1 = sliceSectionText(fullText, sectionNumber);
  if (attempt1.length >= 50) return { text: attempt1, attempt: 1 };

  // Attempt 2 — inline regex (section number anywhere)
  try {
    const escaped = sectionNumber.replace(/\./g, "\\.");
    const inline = new RegExp(`${escaped}(?![0-9])[\\.\\s\\)\\:\\-]`, "i");
    const m = inline.exec(fullText);
    if (m) {
      const slice = fullText.slice(m.index, m.index + 4000);
      if (slice.length >= 50) return { text: slice, attempt: 2 };
    }
  } catch {
    // ignore regex errors
  }

  // Attempt 3 — proportional slice based on position
  if (totalSections > 0 && fullText.length > 0) {
    const startPos = Math.floor((sectionIndex / totalSections) * fullText.length);
    const slice = fullText.slice(startPos, startPos + 4000);
    if (slice.length >= 50) return { text: slice, attempt: 3 };
  }

  return { text: "", attempt: 0 };
}
