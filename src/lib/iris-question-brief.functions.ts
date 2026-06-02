import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Brief = { current_focus: string; next_step: string; waiting_on: string };

async function callGemini(system: string, user: string): Promise<Brief | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "morning_brief",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              current_focus: { type: "string" },
              next_step: { type: "string" },
              waiting_on: { type: "string" },
            },
            required: ["current_focus", "next_step", "waiting_on"],
          },
        },
      },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw);
    return {
      current_focus: String(parsed.current_focus ?? "").slice(0, 500),
      next_step: String(parsed.next_step ?? "").slice(0, 500),
      waiting_on: String(parsed.waiting_on ?? "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

export const generateMissionQuestionBriefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid(),
      overwrite: z.boolean().optional().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: mission } = await supabase
      .from("missions")
      .select("name,client,state,submission_date,win_themes,priority_topics")
      .eq("id", data.missionId)
      .maybeSingle();
    if (!mission) throw new Error("Mission not found");

    // Pull Oracle context (top sections) to ground briefs
    const { data: sections } = await supabase
      .from("briefing_book_sections")
      .select("section_key,content")
      .eq("mission_id", data.missionId)
      .eq("status", "ready");
    const oracleCtx = (sections ?? [])
      .map((s) => `## ${s.section_key}\n${(s.content ?? "").slice(0, 800)}`)
      .join("\n\n")
      .slice(0, 6000);

    const query = supabase
      .from("question_records")
      .select("id,question_number,title,question_text,page_limit,word_limit,evaluation_weight,current_focus")
      .eq("mission_id", data.missionId)
      .order("sort_order", { ascending: true });
    const { data: questions } = data.overwrite
      ? await query
      : await query.is("current_focus", null);
    const qs = questions ?? [];
    if (qs.length === 0) return { updated: 0, total: 0, message: "No questions to brief." };

    const system = `You are IRIS, a proposal strategist. For each RFP question, produce a tight 'morning brief' so the writer knows exactly what to do today.
Return JSON only. Three fields, each one crisp sentence (≤140 chars):
- current_focus: the specific angle/topic the writer should be advancing TODAY
- next_step: the single concrete next action (verb-led)
- waiting_on: who or what is blocking progress (or "Nothing outstanding")
Be specific to the question text. Use the Oracle context to ground positioning. No preface, no bullets.`;

    let updated = 0;
    let failed = 0;
    // Sequential to respect rate limits
    for (const q of qs) {
      const user = `Mission: ${mission.name} · ${mission.client} · ${mission.state ?? "—"}
Submission: ${mission.submission_date ?? "TBD"}
Win themes: ${(mission.win_themes ?? []).join("; ") || "(none)"}
Priority topics: ${(mission.priority_topics ?? []).join("; ") || "(none)"}

Oracle Intelligence Context:
${oracleCtx || "(none yet — rely on general Medicaid proposal strategy)"}

QUESTION ${q.question_number} — ${q.title}
${q.question_text}
${q.page_limit ? `Page limit: ${q.page_limit}` : ""} ${q.word_limit ? `Word limit: ${q.word_limit}` : ""} ${q.evaluation_weight ? `Weight: ${q.evaluation_weight}` : ""}`;

      const brief = await callGemini(system, user);
      if (!brief) {
        failed++;
        continue;
      }
      const { error } = await supabase
        .from("question_records")
        .update({
          current_focus: brief.current_focus,
          next_step: brief.next_step,
          waiting_on: brief.waiting_on,
          updated_at: new Date().toISOString(),
        })
        .eq("id", q.id);
      if (error) failed++;
      else updated++;
    }

    await supabase.from("olympus_audit_log").insert({
      mission_id: data.missionId,
      user_id: userId,
      action_type: "morning_briefs_generated",
      action_summary: `Generated ${updated} morning briefs (${failed} failed) for ${mission.name}`,
      target_table: "question_records",
    });

    return { updated, failed, total: qs.length };
  });
