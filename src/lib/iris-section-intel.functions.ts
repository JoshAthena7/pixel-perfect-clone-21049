// IRIS per-section intelligence: generates a plain-language summary,
// key requirements and risks for one mission section. Cached in component state.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({
  mission_id: z.string().uuid(),
  section_id: z.string().uuid(),
});

export type SectionIntel = {
  summary: string;
  requirements: string[];
  risks: string[];
};

const SYSTEM = `You are IRIS, an RFP intelligence analyst. Given an RFP section's name, description and questions, respond with ONLY valid JSON in this exact shape and no other text:

{
  "summary": "2-3 sentence plain-language explanation of what this section is really asking the proposer to demonstrate. Be specific and practical.",
  "requirements": ["3-5 specific key requirements this section must address to be competitive"],
  "risks": ["2-3 risks or common mistakes proposers make on this type of section"]
}`;

function tryParse(s: string): SectionIntel | null {
  try {
    const j = JSON.parse(s);
    if (typeof j?.summary !== "string") return null;
    return {
      summary: j.summary,
      requirements: Array.isArray(j.requirements) ? j.requirements.map(String).slice(0, 5) : [],
      risks: Array.isArray(j.risks) ? j.risks.map(String).slice(0, 3) : [],
    };
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return tryParse(m[0]);
    } catch {
      return null;
    }
  }
}

export const generateSectionIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<SectionIntel> => {
    const { supabase } = context;

    const { data: section, error: sErr } = await supabase
      .from("mission_sections")
      .select("id, section_number, name, description")
      .eq("id", data.section_id)
      .eq("mission_id", data.mission_id)
      .single();
    if (sErr || !section) throw new Error("Section not found.");

    const { data: questions } = await supabase
      .from("mission_questions")
      .select("question_number, question_text, evaluation_criteria")
      .eq("section_id", data.section_id)
      .order("question_number", { ascending: true });

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");

    const prompt = [
      `Section: ${section.section_number ?? ""} ${section.name ?? ""}`.trim(),
      section.description ? `Description: ${section.description}` : "",
      questions && questions.length
        ? `Questions:\n${questions
            .map(
              (q) =>
                `- ${q.question_number ?? ""} ${q.question_text ?? ""}${
                  q.evaluation_criteria ? ` [criteria: ${q.evaluation_criteria}]` : ""
                }`,
            )
            .join("\n")}`
        : "Questions: (none extracted)",
    ]
      .filter(Boolean)
      .join("\n\n");

    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
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
    const parsed = tryParse(content);
    if (!parsed) throw new Error("IRIS could not produce intelligence for this section.");
    return parsed;
  });
