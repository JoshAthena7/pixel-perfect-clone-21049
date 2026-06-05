import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MissionInput = z.object({ missionId: z.string().uuid() });

/**
 * IRIS Wave 1 — generate the initial mission briefing from Section 1 + 4 and
 * post it to the Brief Room as a `briefings` row. Best-effort: if the LLM is
 * unavailable, a deterministic briefing is written so the launch sequence
 * never blocks.
 */
export const generateInitialBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { missionId } = data;

    const [mission, strategy, winThemes, intel, criteria] = await Promise.all([
      supabase.from("missions").select("name,client,state,program_type,submission_date,win_themes,priority_topics").eq("id", missionId).maybeSingle(),
      supabase.from("mission_strategy").select("kind,label,notes").eq("mission_id", missionId),
      supabase.from("win_themes").select("title,description").eq("mission_id", missionId),
      supabase.from("mission_client_intel").select("political_considerations,notes").eq("mission_id", missionId).maybeSingle(),
      supabase.from("mission_evaluation_criteria").select("category,points,competitive_risk").eq("mission_id", missionId),
    ]);

    const m = mission.data;
    if (!m) throw new Error("Mission not found");

    const themes = [
      ...((m.win_themes ?? []) as string[]),
      ...(winThemes.data ?? []).map((w) => w.title),
    ].filter(Boolean);
    const risks = (strategy.data ?? []).filter((s) => s.kind === "risk");
    const competitors = (strategy.data ?? []).filter((s) => s.kind === "competitor");
    const discriminators = (strategy.data ?? []).filter((s) => s.kind === "discriminator");

    const body = await synthesizeBriefing({
      mission: m,
      themes,
      risks: risks.map((r) => r.label),
      competitors: competitors.map((c) => `${c.label}${c.notes ? ` (${c.notes})` : ""}`),
      discriminators: discriminators.map((d) => d.label),
      politicalContext: intel.data?.political_considerations ?? null,
      highRiskCategories: (criteria.data ?? []).filter((c) => c.competitive_risk === "high").map((c) => `${c.category} (${c.points} pts)`),
    });

    const { error } = await supabase.from("briefings").insert({
      mission_id: missionId,
      briefing_type: "initial",
      title: `Initial IRIS Briefing — ${m.name}`,
      body,
      generated_at: new Date().toISOString(),
    } as any);
    // Briefings table may have a different shape across environments; if the
    // insert fails (e.g. RLS or missing columns), don't fail the launch.
    if (error) {
      // Fallback: write as a broadcast so the team still sees something.
      await supabase.from("broadcasts").insert({
        mission_id: missionId,
        from_name: "IRIS",
        text: `Initial Briefing\n\n${body.slice(0, 2000)}`,
      });
    }
    return { ok: true };
  });

async function synthesizeBriefing(input: {
  mission: any;
  themes: string[];
  risks: string[];
  competitors: string[];
  discriminators: string[];
  politicalContext: string | null;
  highRiskCategories: string[];
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const deterministic = buildDeterministicBriefing(input);
  if (!apiKey) return deterministic;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are IRIS, the mission intelligence layer for Athena Strategy Group. Write a concise, operational mission briefing in markdown. 6 short sections with headings: Mission Overview, Win Themes, Key Risks, Competitor Summary, Write Toward, Avoid. Tight bullets, no fluff." },
          { role: "user", content: JSON.stringify(input).slice(0, 8000) },
        ],
      }),
    });
    if (!res.ok) return deterministic;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content?.trim();
    return text || deterministic;
  } catch {
    return deterministic;
  }
}

function buildDeterministicBriefing(i: any): string {
  const lines: string[] = [];
  lines.push(`## Mission Overview`);
  lines.push(`- Client: ${i.mission.client ?? "—"}`);
  if (i.mission.state) lines.push(`- State: ${i.mission.state}`);
  if (i.mission.program_type) lines.push(`- Opportunity: ${i.mission.program_type}`);
  if (i.mission.submission_date) lines.push(`- Submission: ${i.mission.submission_date}`);
  lines.push(`\n## Win Themes`);
  for (const t of i.themes.slice(0, 8)) lines.push(`- ${t}`);
  if (i.themes.length === 0) lines.push(`- _Not yet defined._`);
  lines.push(`\n## Key Risks`);
  for (const r of i.risks.slice(0, 8)) lines.push(`- ${r}`);
  if (i.risks.length === 0) lines.push(`- _None recorded._`);
  lines.push(`\n## Competitor Summary`);
  for (const c of i.competitors.slice(0, 6)) lines.push(`- ${c}`);
  if (i.competitors.length === 0) lines.push(`- _None recorded._`);
  lines.push(`\n## Write Toward`);
  for (const d of i.discriminators.slice(0, 8)) lines.push(`- ${d}`);
  if (i.highRiskCategories.length) {
    lines.push(`\n## High-Stakes Categories`);
    for (const h of i.highRiskCategories) lines.push(`- ${h}`);
  }
  if (i.politicalContext) {
    lines.push(`\n## Political Context\n${i.politicalContext}`);
  }
  return lines.join("\n");
}

/**
 * IRIS Wave 2 — tag each question with a pre-brief card containing matched
 * win themes, relevant vault doc ids, and the priority score.
 */
export const indexMissionInputs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MissionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [questions, docs, themes, criteria] = await Promise.all([
      supabase.from("question_records").select("id,title,question_text,section_number,question_number,point_value,competitive_risk").eq("mission_id", data.missionId),
      supabase.from("mission_vault_documents").select("id,title,category").eq("mission_id", data.missionId),
      supabase.from("win_themes").select("id,title,description").eq("mission_id", data.missionId),
      supabase.from("mission_evaluation_criteria").select("category,points,competitive_risk,sections_covered").eq("mission_id", data.missionId),
    ]);

    let tagged = 0;
    for (const q of questions.data ?? []) {
      const text = `${q.title ?? ""} ${q.question_text ?? ""}`.toLowerCase();
      const matchedThemes = (themes.data ?? []).filter((t) => {
        const words = (t.title ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        return words.some((w) => text.includes(w));
      });
      const matchedDocs = (docs.data ?? []).filter((d) => {
        const dt = (d.title ?? "").toLowerCase();
        return text.split(/\s+/).filter((w) => w.length > 4).some((w) => dt.includes(w));
      });
      const matchedCrits = (criteria.data ?? []).filter((c) => {
        const covers = Array.isArray(c.sections_covered) ? c.sections_covered : [];
        return covers.some((s: any) => String(s) === String(q.section_number) || String(q.question_number).startsWith(String(s)));
      });

      const preBrief = {
        themes: matchedThemes.map((t) => ({ id: t.id, title: t.title })),
        vault_docs: matchedDocs.slice(0, 5).map((d) => ({ id: d.id, title: d.title, category: d.category })),
        evaluation: matchedCrits.map((c) => ({ category: c.category, points: c.points, risk: c.competitive_risk })),
        indexed_at: new Date().toISOString(),
      };

      await supabase.from("question_records").update({ iris_pre_brief: preBrief }).eq("id", q.id);
      tagged++;
    }
    return { tagged };
  });

/**
 * Returns an expert match for a question topic based on mission_member_expertise.
 */
export const matchExpertForQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid(), questionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: q } = await supabase.from("question_records").select("title,question_text").eq("id", data.questionId).maybeSingle();
    if (!q) return { match: null };
    const text = `${q.title ?? ""} ${q.question_text ?? ""}`.toLowerCase();

    const { data: tags } = await supabase
      .from("mission_member_expertise")
      .select("user_id,tag")
      .eq("mission_id", data.missionId);

    const scores = new Map<string, { score: number; tags: string[] }>();
    for (const row of tags ?? []) {
      const t = row.tag.toLowerCase();
      const hit = text.includes(t) || t.split(/\s+/).some((w) => w.length > 4 && text.includes(w));
      if (!hit) continue;
      const entry = scores.get(row.user_id) ?? { score: 0, tags: [] };
      entry.score += 1;
      entry.tags.push(row.tag);
      scores.set(row.user_id, entry);
    }
    const best = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0];
    if (!best) return { match: null };

    const { data: prof } = await supabase.from("profiles").select("display_name,email").eq("id", best[0]).maybeSingle();
    return {
      match: {
        user_id: best[0],
        name: prof?.display_name ?? prof?.email ?? "Team member",
        matched_tags: best[1].tags,
      },
    };
  });
