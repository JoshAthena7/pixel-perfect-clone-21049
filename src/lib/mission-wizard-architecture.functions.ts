import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({ missionId: z.string().uuid() });

type Question = {
  question_number?: string;
  question_name?: string;
  question_text?: string;
  page_limit?: number | null;
  requirements?: string[];
  evaluation_criteria?: string[];
  deliverables?: string[];
  compliance_requirements?: string[];
  notes?: string;
};

type Section = {
  section_name?: string;
  section_number?: string;
  questions?: Question[];
};

type Architecture = {
  mission_overview?: string;
  sections?: Section[];
  total_questions?: number;
  compliance_flags?: string[];
  recommended_win_themes?: string[];
};

export const runWizardQuestionArchitecture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const { data: mission, error: mErr } = await supabase
      .from("missions")
      .select("name,client")
      .eq("id", data.missionId)
      .maybeSingle();
    if (mErr || !mission) throw new Error("Mission not found");

    const { data: docs } = await supabase
      .from("mission_documents")
      .select("doc_type,file_url,notes")
      .eq("mission_id", data.missionId);

    const docLines = (docs ?? [])
      .map((d: { doc_type: string | null; file_url: string | null; notes: string | null }) => {
        const parts = [`- ${d.doc_type ?? "doc"}`];
        if (d.file_url) parts.push(`  URL: ${d.file_url}`);
        if (d.notes) parts.push(`  Notes: ${d.notes}`);
        return parts.join("\n");
      })
      .join("\n");

    const prompt = `You are IRIS, the mission intelligence engine for ATLAS. Analyze the following RFP and source documents for a government proposal.

Mission: ${mission.name ?? ""}
Client: ${mission.client ?? ""}
Documents provided:
${docLines || "(none provided)"}

Extract the complete response architecture. Return ONLY valid JSON, no markdown:
{
  "mission_overview": "string",
  "sections": [
    {
      "section_name": "string",
      "section_number": "string",
      "questions": [
        {
          "question_number": "string",
          "question_name": "string",
          "question_text": "string",
          "page_limit": null or integer,
          "requirements": ["string"],
          "evaluation_criteria": ["string"],
          "deliverables": ["string"],
          "compliance_requirements": ["string"],
          "notes": "string"
        }
      ]
    }
  ],
  "total_questions": integer,
  "compliance_flags": ["string"],
  "recommended_win_themes": ["string"]
}`;

    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are IRIS. Output strict JSON only." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (r.status === 429) throw new Error("Rate limited — please retry shortly.");
      if (r.status === 402) throw new Error("AI credits exhausted.");
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (!res.ok) throw new Error(`AI gateway error ${res.status}`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    let parsed: Architecture;
    try {
      parsed = JSON.parse(raw) as Architecture;
    } catch {
      throw new Error("IRIS returned invalid JSON");
    }

    // Save mission overview + flags + win themes to mission_intelligence (layer = wizard_analysis)
    await supabase.from("mission_intelligence").upsert(
      {
        mission_id: data.missionId,
        layer: "wizard_analysis",
        content: {
          mission_overview: parsed.mission_overview ?? "",
          compliance_flags: parsed.compliance_flags ?? [],
          recommended_win_themes: parsed.recommended_win_themes ?? [],
          total_questions: parsed.total_questions ?? 0,
          sections: parsed.sections ?? [],
        } as never,
      } as never,
      { onConflict: "mission_id,layer" },
    );

    // Clear prior v1 questions for this mission, then insert fresh
    await supabase
      .from("questions")
      .delete()
      .eq("mission_id", data.missionId)
      .eq("architecture_version", "v1");

    const rows: Array<Record<string, unknown>> = [];
    let order = 0;
    let sectionCount = 0;
    let questionCount = 0;
    for (const section of parsed.sections ?? []) {
      sectionCount++;
      const sectionName = section.section_name ?? section.section_number ?? "Section";
      for (const q of section.questions ?? []) {
        questionCount++;
        rows.push({
          mission_id: data.missionId,
          question_number: q.question_number ?? null,
          question_name: q.question_name ?? null,
          question_text: q.question_text ?? null,
          section: sectionName,
          subsection: section.section_number ?? null,
          page_limit: typeof q.page_limit === "number" ? q.page_limit : null,
          requirements: q.requirements ?? [],
          evaluation_criteria: q.evaluation_criteria ?? [],
          deliverables: q.deliverables ?? [],
          compliance_requirements: q.compliance_requirements ?? [],
          admin_notes: q.notes ?? null,
          architecture_version: "v1",
          status: "draft",
          sort_order: order++,
        });
      }
    }

    if (rows.length > 0) {
      const { error: qErr } = await supabase.from("questions").insert(rows as never);
      if (qErr) throw new Error(qErr.message);
    }

    await supabase
      .from("missions")
      .update({ mission_status: "Ready for Review", wizard_step: 3 } as never)
      .eq("id", data.missionId);

    return {
      sectionCount,
      questionCount,
      missionOverview: parsed.mission_overview ?? "",
    };
  });
