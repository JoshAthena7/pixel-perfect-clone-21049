// IRIS RFP processing: takes pre-extracted primary RFP text(s), calls Lovable
// AI for structured extraction, and writes results into mission_volumes /
// mission_sections / mission_questions / mission_compliance_requirements /
// mission_submission_checklist. Also stores any disclaimer on missions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({
  mission_id: z.string().uuid(),
  primary_rfp_text: z.string().trim().min(50).max(800_000),
});

const SYSTEM = `You are analyzing a government RFP document. Extract the proposal structure and return ONLY valid JSON in exactly this format with no other text. Use confidence "high" when an item is explicitly labeled in the text, "medium" when inferred from headings, "low" when guessed. Keep arrays sized to what the document actually contains — do not invent.

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
          "confidence": "high|medium|low",
          "sub_sections": [
            {
              "number": "string",
              "name": "string",
              "page_limit": null,
              "evaluation_weight": null,
              "description": "string",
              "confidence": "high|medium|low",
              "questions": [
                {
                  "number": "string",
                  "text": "string",
                  "word_limit": null,
                  "page_limit": null,
                  "evaluation_criteria": "string",
                  "confidence": "high|medium|low"
                }
              ]
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

type Conf = "high" | "medium" | "low";
type Question = {
  number?: string;
  text: string;
  word_limit?: number | null;
  page_limit?: number | null;
  evaluation_criteria?: string | null;
  confidence?: Conf;
};
type SubSection = {
  number?: string;
  name: string;
  page_limit?: number | null;
  evaluation_weight?: number | null;
  description?: string;
  confidence?: Conf;
  questions?: Question[];
};
type Section = SubSection & { sub_sections?: SubSection[] };
type Volume = { name: string; sections?: Section[] };
type Extracted = {
  volumes?: Volume[];
  compliance_requirements?: string[];
  submission_checklist_items?: string[];
  disclaimer?: string | null;
};

function safeNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
function conf(v: unknown): Conf {
  return v === "high" || v === "medium" || v === "low" ? v : "low";
}

function tryParseJSON(s: string): Extracted | null {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Extracted;
  } catch {
    // Try to find the first { ... } block.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Extracted;
    } catch {
      return null;
    }
  }
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
    const { supabase, userId } = context;

    // Verify the caller owns or admins this mission.
    const { data: mission, error: mErr } = await supabase
      .from("missions")
      .select("id, created_by")
      .eq("id", data.mission_id)
      .single();
    if (mErr || !mission) throw new Error("Mission not found or access denied.");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured — built-in AI key missing.");

    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: data.primary_rfp_text },
          ],
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });

    if (res.status === 402) throw new Error("Workspace is out of AI credits.");
    if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
    if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = tryParseJSON(content);
    if (!parsed) throw new Error("IRIS could not extract a valid structure.");

    // Wipe any previously-extracted IRIS data for idempotency.
    await supabase.from("mission_submission_checklist").delete().eq("mission_id", data.mission_id).eq("iris_extracted", true);
    await supabase.from("mission_compliance_requirements").delete().eq("mission_id", data.mission_id).eq("iris_extracted", true);
    await supabase.from("mission_questions").delete().eq("mission_id", data.mission_id);
    await supabase.from("mission_sections").delete().eq("mission_id", data.mission_id);
    await supabase.from("mission_volumes").delete().eq("mission_id", data.mission_id);

    const counts = { volumes: 0, sections: 0, sub_sections: 0, questions: 0, compliance: 0, checklist: 0 };

    const volumes = Array.isArray(parsed.volumes) ? parsed.volumes : [];
    for (let vi = 0; vi < volumes.length; vi++) {
      const v = volumes[vi] ?? {};
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
            order_index: si,
          })
          .select("id")
          .single();
        if (sErr || !sRow) continue;
        counts.sections++;

        const subs = Array.isArray(s.sub_sections) ? s.sub_sections : [];
        for (let ssi = 0; ssi < subs.length; ssi++) {
          const ss = subs[ssi] ?? ({} as SubSection);
          const { data: ssRow, error: ssErr } = await supabase
            .from("mission_sections")
            .insert({
              mission_id: data.mission_id,
              volume_id: vRow.id,
              parent_section_id: sRow.id,
              section_number: ss.number ? String(ss.number).slice(0, 50) : null,
              name: String(ss.name ?? `Sub ${ssi + 1}`).slice(0, 500),
              page_limit: safeNum(ss.page_limit),
              evaluation_weight: safeNum(ss.evaluation_weight),
              description: ss.description ? String(ss.description).slice(0, 4000) : null,
              iris_confidence: conf(ss.confidence),
              order_index: ssi,
            })
            .select("id")
            .single();
          if (ssErr || !ssRow) continue;
          counts.sub_sections++;

          const qs = Array.isArray(ss.questions) ? ss.questions : [];
          if (qs.length === 0) continue;
          const qRows = qs
            .map((q) => ({
              mission_id: data.mission_id,
              section_id: ssRow.id,
              question_number: q.number ? String(q.number).slice(0, 50) : null,
              question_text: String(q.text ?? "").slice(0, 4000),
              word_limit: safeNum(q.word_limit),
              page_limit: safeNum(q.page_limit),
              evaluation_criteria: q.evaluation_criteria ? String(q.evaluation_criteria).slice(0, 2000) : null,
              iris_confidence: conf(q.confidence),
              status: "not_started",
            }))
            .filter((r) => r.question_text.trim().length > 0);
          if (qRows.length > 0) {
            const { error: qErr } = await supabase.from("mission_questions").insert(qRows);
            if (!qErr) counts.questions += qRows.length;
          }
        }
      }
    }

    const compliance = Array.isArray(parsed.compliance_requirements)
      ? parsed.compliance_requirements.map((c) => String(c).trim()).filter(Boolean).slice(0, 200)
      : [];
    if (compliance.length > 0) {
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
      const { error } = await supabase.from("mission_submission_checklist").insert(
        checklist.map((label) => ({
          mission_id: data.mission_id,
          label: label.slice(0, 500),
          iris_extracted: true,
        })),
      );
      if (!error) counts.checklist = checklist.length;
    }

    const disclaimer =
      typeof parsed.disclaimer === "string" && parsed.disclaimer.trim().length > 0
        ? parsed.disclaimer.trim().slice(0, 2000)
        : null;
    await supabase.from("missions").update({ iris_disclaimer: disclaimer }).eq("id", data.mission_id);

    void userId;
    return { ok: true, counts, disclaimer };
  });
