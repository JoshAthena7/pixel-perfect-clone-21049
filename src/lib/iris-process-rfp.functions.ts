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

const QUESTIONS_SYSTEM = `You are IRIS, extracting proposal questions from one RFP section for a Medicaid procurement response team. Return ONLY valid JSON, no preamble.

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
- Extract every discrete question or requirement the section asks the bidder to address.
- If the section has no discrete questions, return {"questions": []}.
- Do NOT invent questions — only what is explicitly asked.
- question_number format: "[section_number].[sequence]" e.g. "3.14.1", "3.14.2".
- Extract page/word limits and evaluation weight when stated.`;

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

/**
 * Fuzzy text slice: find the section header in `fullText` by digit pattern and
 * return up to 4000 chars starting there. Tolerates "3.14", "Section 3.14",
 * "3.14.", "3.14 NAME", with optional whitespace.
 */
function sliceSectionText(fullText: string, sectionNumber: string | null): string {
  if (!sectionNumber) return "";
  const escaped = sectionNumber.replace(/\./g, "\\.");
  // Look for the number at a line start (with optional "Section " prefix),
  // followed by punctuation/whitespace, not another digit.
  const re = new RegExp(`(?:^|\\n)[ \\t]*(?:Section[ \\t]+)?${escaped}(?![0-9])[\\.\\s\\)\\:\\-]`, "i");
  const m = re.exec(fullText);
  if (!m) return "";
  const start = m.index;
  return fullText.slice(start, start + 4000);
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
  section_text: z.string().trim().min(50).max(20_000),
});

export const extractQuestionsForSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SectionInput.parse(d))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; inserted: number; skipped?: string }> => {
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

      const userMsg = `RFP Section: ${section.section_number} — ${section.name}\n\nSection text:\n${data.section_text}`;
      const content = await callAI(apiKey, QUESTIONS_SYSTEM, userMsg);
      if (!content) return { ok: false, inserted: 0, skipped: "ai_no_response" };

      const parsed = tryParseJSON<{ questions?: AIQuestion[] }>(content);
      const qs = Array.isArray(parsed?.questions) ? parsed!.questions : [];
      if (qs.length === 0) return { ok: true, inserted: 0, skipped: "no_questions" };

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
            iris_extracted: true,
            iris_extracted_at: new Date().toISOString(),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length === 0) return { ok: true, inserted: 0, skipped: "empty_rows" };

      const questionNumbers = rows.map((row) => row.question_number);
      const { error: deleteErr } = await supabase
        .from("mission_questions")
        .delete()
        .eq("mission_id", data.mission_id)
        .eq("iris_extracted", true)
        .in("question_number", questionNumbers);
      if (deleteErr) {
        console.error("[iris-pass2] cleanup failed", section.section_number, deleteErr.message);
        return { ok: false, inserted: 0, skipped: "cleanup_error" };
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("mission_questions")
        .insert(rows)
        .select("id");
      if (insertErr) {
        console.error("[iris-pass2] insert failed", section.section_number, insertErr.message);
        return { ok: false, inserted: 0, skipped: "insert_error" };
      }
      return { ok: true, inserted: inserted?.length ?? 0 };
    },
  );

// Exported so the browser orchestrator can slice text the same way.
export function sliceSectionTextForClient(
  fullText: string,
  sectionNumber: string | null,
): string {
  return sliceSectionText(fullText, sectionNumber);
}
