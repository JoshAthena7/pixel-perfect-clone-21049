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
  const cleaned = s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
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

function questionKey(q: Partial<Question> & { question_number?: string | null; question_text?: string | null }) {
  const number = q.question_number ?? q.number;
  const text = q.question_text ?? q.text;
  return `${String(number ?? "").trim().toLowerCase()}::${String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
}

function countPlannedQuestions(volumes: Volume[]) {
  return volumes.reduce((total, volume) => {
    return total + (volume.sections ?? []).reduce((sectionTotal, section) => {
      const direct = Array.isArray(section.questions) ? section.questions.length : 0;
      const nested = (section.sub_sections ?? []).reduce(
        (subTotal, sub) => subTotal + (Array.isArray(sub.questions) ? sub.questions.length : 0),
        0,
      );
      return sectionTotal + direct + nested;
    }, 0);
  }, 0);
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

    const volumes = Array.isArray(parsed.volumes) ? parsed.volumes : [];
    const plannedQuestionCount = countPlannedQuestions(volumes);
    const [
      { data: previousQuestions },
      { data: previousAssignments },
      { data: previousSections },
      { data: previousVolumes },
    ] = await Promise.all([
      supabase
        .from("mission_questions")
        .select("id, question_number, question_text")
        .eq("mission_id", data.mission_id),
      supabase
        .from("mission_assignments")
        .select("question_id, assigned_writer_id, sme_member_ids, acceptance_status, writer_confidence, due_date, assigned_by, assigned_at")
        .eq("mission_id", data.mission_id),
      supabase.from("mission_sections").select("id").eq("mission_id", data.mission_id),
      supabase.from("mission_volumes").select("id").eq("mission_id", data.mission_id),
    ]);
    if (plannedQuestionCount === 0 && (previousQuestions?.length ?? 0) > 0) {
      // Safety: AI extraction returned nothing, but existing questions exist.
      // Return a soft no-op so the UI doesn't crash; existing data is preserved.
      return {
        ok: false,
        counts: { volumes: 0, sections: 0, sub_sections: 0, questions: 0, compliance: 0, checklist: 0 },
        disclaimer: "IRIS did not find replacement questions in this run. Your existing questions and assignments were left unchanged.",
      };
    }

    const questionKeyById = new Map((previousQuestions ?? []).map((q) => [q.id, questionKey(q)]));
    const previousAssignmentByQuestionKey = new Map(
      (previousAssignments ?? [])
        .map((assignment) => {
          const key = questionKeyById.get(assignment.question_id);
          return key ? [key, assignment] as const : null;
        })
        .filter(Boolean) as Array<readonly [string, NonNullable<typeof previousAssignments>[number]]>,
    );

    const counts = {
      volumes: 0,
      sections: 0,
      sub_sections: 0,
      questions: 0,
      compliance: 0,
      checklist: 0,
    };
    const newVolumeIds: string[] = [];
    const newSectionIds: string[] = [];

    const insertQuestions = async (sectionId: string, qs: Question[]) => {
      if (qs.length === 0) return;
      const rowsWithKeys = qs
        .map((q) => ({
          key: questionKey(q),
          row: {
            mission_id: data.mission_id,
            section_id: sectionId,
            question_number: q.number ? String(q.number).slice(0, 50) : null,
            question_text: String(q.text ?? "").slice(0, 4000),
            word_limit: safeNum(q.word_limit),
            page_limit: safeNum(q.page_limit),
            evaluation_criteria: q.evaluation_criteria
              ? String(q.evaluation_criteria).slice(0, 2000)
              : null,
            iris_confidence: conf(q.confidence),
            status: "not_started",
          },
        }))
        .filter((r) => r.row.question_text.trim().length > 0);
      if (rowsWithKeys.length === 0) return;
      const { data: inserted, error: qErr } = await supabase
        .from("mission_questions")
        .insert(rowsWithKeys.map((r) => r.row))
        .select("id, question_number, question_text");
      if (qErr) throw qErr;
      counts.questions += inserted?.length ?? 0;
      const restoreRows: Array<{
        mission_id: string;
        question_id: string;
        assigned_writer_id: string | null;
        sme_member_ids: string[];
        acceptance_status: string;
        writer_confidence: string;
        due_date: string | null;
        assigned_by: string | null;
        assigned_at: string;
      }> = [];
      for (const newQuestion of inserted ?? []) {
        const previous = previousAssignmentByQuestionKey.get(questionKey(newQuestion));
        if (!previous) continue;
        restoreRows.push({
          mission_id: data.mission_id,
          question_id: newQuestion.id,
          assigned_writer_id: previous.assigned_writer_id,
          sme_member_ids: previous.sme_member_ids ?? [],
          acceptance_status: previous.acceptance_status ?? "pending",
          writer_confidence: previous.writer_confidence ?? "not_set",
          due_date: previous.due_date,
          assigned_by: previous.assigned_by,
          assigned_at: previous.assigned_at ?? new Date().toISOString(),
        });
      }
      if (restoreRows.length > 0) {
        const { error: restoreErr } = await supabase.from("mission_assignments").upsert(restoreRows, {
          onConflict: "mission_id,question_id",
        });
        if (restoreErr) throw restoreErr;
      }
    };
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
      newVolumeIds.push(vRow.id);

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
        newSectionIds.push(sRow.id);

        await insertQuestions(sRow.id, Array.isArray(s.questions) ? s.questions : []);

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
          newSectionIds.push(ssRow.id);

          await insertQuestions(ssRow.id, Array.isArray(ss.questions) ? ss.questions : []);
        }
      }
    }

    if (counts.questions === 0 && (previousQuestions?.length ?? 0) > 0) {
      if (newSectionIds.length > 0) await supabase.from("mission_sections").delete().in("id", newSectionIds);
      if (newVolumeIds.length > 0) await supabase.from("mission_volumes").delete().in("id", newVolumeIds);
      throw new Error("IRIS did not write replacement questions, so existing questions and assignments were left unchanged.");
    }

    await supabase
      .from("mission_submission_checklist")
      .delete()
      .eq("mission_id", data.mission_id)
      .eq("iris_extracted", true);
    await supabase
      .from("mission_compliance_requirements")
      .delete()
      .eq("mission_id", data.mission_id)
      .eq("iris_extracted", true);
    const previousQuestionIds = (previousQuestions ?? []).map((q) => q.id);
    const previousSectionIds = (previousSections ?? []).map((s) => s.id);
    const previousVolumeIds = (previousVolumes ?? []).map((v) => v.id);
    if (previousQuestionIds.length > 0) await supabase.from("mission_questions").delete().in("id", previousQuestionIds);
    if (previousSectionIds.length > 0) await supabase.from("mission_sections").delete().in("id", previousSectionIds);
    if (previousVolumeIds.length > 0) await supabase.from("mission_volumes").delete().in("id", previousVolumeIds);

    const compliance = Array.isArray(parsed.compliance_requirements)
      ? parsed.compliance_requirements
          .map((c) => String(c).trim())
          .filter(Boolean)
          .slice(0, 200)
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
      ? parsed.submission_checklist_items
          .map((c) => String(c).trim())
          .filter(Boolean)
          .slice(0, 200)
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
    await supabase
      .from("missions")
      .update({ iris_disclaimer: disclaimer })
      .eq("id", data.mission_id);

    void userId;
    return { ok: true, counts, disclaimer };
  });
