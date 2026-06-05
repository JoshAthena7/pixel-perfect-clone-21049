import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { IRIS_BASE_PROMPT } from "./iris-prompts";
import { withAICircuit } from "@/lib/ai-circuit-breaker";
import { loadLayeredContext } from "./iris-layered-context";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

type Coaching = {
  state_priority: string;
  procurement_signal: string;
  differentiation: string;
  compliance_note?: string;
};

async function callForCoaching(system: string, user: string): Promise<Coaching | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `${IRIS_BASE_PROMPT}\n\n${system}` },
            { role: "user", content: user },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "emit_coaching",
                description: "Emit IRIS coaching insights for this question.",
                parameters: {
                  type: "object",
                  properties: {
                    state_priority: { type: "string", description: "2-4 sentences on what the state prioritizes on this topic." },
                    procurement_signal: { type: "string", description: "2-4 sentences on what evaluators have weighted in similar procurements." },
                    differentiation: { type: "string", description: "2-4 sentences on the competitive opportunity for this writer." },
                    compliance_note: { type: "string", description: "Optional: compliance requirements the writer must address. Omit if none." },
                  },
                  required: ["state_priority", "procurement_signal", "differentiation"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "emit_coaching" } },
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args);
    return {
      state_priority: String(parsed.state_priority ?? "").slice(0, 1200),
      procurement_signal: String(parsed.procurement_signal ?? "").slice(0, 1200),
      differentiation: String(parsed.differentiation ?? "").slice(0, 1200),
      compliance_note: parsed.compliance_note ? String(parsed.compliance_note).slice(0, 1200) : undefined,
    };
  } catch {
    return null;
  }
}

export const generateQuestionCoaching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      questionId: z.string().uuid(),
      force: z.boolean().optional().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    if (!data.force) {
      const { data: existing } = await supabase
        .from("question_intelligence")
        .select("generated_at, iris_brief, state_priorities, procurement_priorities, competitor_signals, compliance_flags")
        .eq("question_id", data.questionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.generated_at) {
        const age = Date.now() - new Date(existing.generated_at).getTime();
        if (age < CACHE_TTL_MS && existing.state_priorities) {
          return { cached: true, intel: existing };
        }
      }
    }

    const { data: q } = await supabase
      .from("question_records")
      .select("id,mission_id,question_number,title,question_text,requirements,mandatory_language,scoring_criteria,page_limit,evaluation_weight")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!q) throw new Error("Question not found");

    const { data: mission } = await supabase
      .from("missions")
      .select("name,client,state,win_themes,priority_topics,competitors")
      .eq("id", q.mission_id)
      .maybeSingle();

    const { data: themes } = await supabase
      .from("win_themes")
      .select("title,key_message")
      .eq("mission_id", q.mission_id)
      .eq("status", "active");

    const userMsg = `MISSION: ${mission?.name} · ${mission?.client} · ${mission?.state ?? "—"}
Win themes: ${(mission?.win_themes ?? []).join("; ") || "(none)"}
Priority topics: ${(mission?.priority_topics ?? []).join("; ") || "(none)"}
Known competitors: ${(mission?.competitors ?? []).join("; ") || "(none)"}

Mission win themes:
${(themes ?? []).map((t) => `- ${t.title}${t.key_message ? `: ${t.key_message}` : ""}`).join("\n") || "(none defined)"}

QUESTION ${q.question_number} — ${q.title}
${q.question_text}

Requirements: ${(q.requirements ?? []).join("; ") || "(none listed)"}
Mandatory language: ${(q.mandatory_language ?? []).join("; ") || "(none)"}
Scoring criteria: ${q.scoring_criteria ?? "(not specified)"}
${q.page_limit ? `Page limit: ${q.page_limit}` : ""}${q.evaluation_weight ? ` · Weight: ${q.evaluation_weight}` : ""}`;

    const sys = `WRITER INTELLIGENCE DISCIPLINE
You are briefing a writer who has 5 minutes before they open their document. They are a skilled writer, not a researcher. Your job: tell them exactly what to do to score a 4.7 on this question. Nothing else.

RULES (non-negotiable):
1. THREE INSIGHTS ONLY. Exactly three. Synthesize 47 facts into the 3 that move the score most. Prioritize by score impact — biggest mover first.
2. EACH INSIGHT IS 2-4 SENTENCES. Direct. Specific. Actionable. Every sentence must answer "so what does this mean for what I write today?" If it doesn't, cut it.
3. BE SPECIFIC, NEVER GENERIC. Names, numbers, dates, citations. Bad: "State evaluators value community partnerships." Good: "${mission?.state ?? "[State]"} weighted county-level deployment data above national framework narratives in 2022 by 1.4 points. Lead with your state numbers, not your national program."
4. ONE COMPLIANCE NOTE MAX. If a mandatory requirement exists, return exactly one sentence in compliance_note — the one whose absence most hurts the score. Plain language. If none, omit the field. Never a list.
5. NO PREAMBLE. Do not start with "Based on…", "IRIS has found…", "Here is…". Start with the insight.
6. NO HEDGING. No "may", "might", "consider". Write "Lead with X." "Reference Y by name." "Avoid Z."
7. WRITER TEST. If a writer reads only one sentence, do they write a better response? If no, rewrite it.
8. CONFIDENCE IS BINARY. State as fact when you have authoritative source support. If inferring, prefix "IRIS inference — verify before citing."
9. NEVER LIST REQUIREMENTS. The Source Library has the list. Writers get the ONE that affects their score.
10. END WITH A DIRECTION. The last sentence of differentiation must answer "what should I do first when I open my document?"

THE THREE INSIGHTS (in order):
(1) state_priority — what does ${mission?.state ?? "the state"} specifically prioritize on this topic? Reference governor stance, state plans, legislation by name.
(2) procurement_signal — what have evaluators weighted in similar procurements? Specific metrics, evidence types, language patterns.
(3) differentiation — the competitive opportunity. Name a competitor's expected move. End with the explicit first-sentence direction.

Be the strategist who knows what wins. Not the consultant who hedges.`;

    const coaching = await callForCoaching(sys, userMsg);
    if (!coaching) {
      return { cached: false, intel: null, error: "IRIS could not generate coaching (check LOVABLE_API_KEY)." };
    }

    const intel = {
      question_id: q.id,
      mission_id: q.mission_id,
      iris_brief: `${coaching.state_priority}\n\n${coaching.procurement_signal}\n\n${coaching.differentiation}`,
      state_priorities: coaching.state_priority,
      procurement_priorities: coaching.procurement_signal,
      competitor_signals: coaching.differentiation,
      compliance_flags: coaching.compliance_note ? [coaching.compliance_note] : null,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    };

    // Upsert by deleting prior rows for this question, then insert fresh
    await supabase.from("question_intelligence").delete().eq("question_id", q.id);
    const { data: inserted } = await supabase
      .from("question_intelligence")
      .insert(intel)
      .select()
      .maybeSingle();

    return { cached: false, intel: inserted ?? intel };
  });
