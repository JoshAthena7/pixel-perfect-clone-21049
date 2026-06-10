// IRIS Intelligence Brief — single server fn that returns all six section
// bodies for a (mission, section, question) triple in one AI call.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BriefBody = {
  whats_asked: string;
  evaluator_intel: string[];
  policy_context: string;
  research_evidence: Array<{ source: string; year?: string; finding: string; source_url?: string | null }>;
  competitive: string;
  iris_recommends: string;
  has_evaluators: boolean;
  has_competitors: boolean;
};

export const generateIntelligenceBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    sectionId: z.string().uuid().nullable().optional(),
    questionId: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<BriefBody> => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");

    // Gather all context in parallel.
    const [mission, ws, sg, section, question, stakeholders, competitors, evol, feed, researchNodes] = await Promise.all([
      supabase.from("missions").select("name,state,agency_name,program_type,client_name").eq("id", data.missionId).maybeSingle(),
      supabase.from("mission_win_strategy").select("win_themes,central_claim,north_star_message,discriminators").eq("mission_id", data.missionId).maybeSingle(),
      supabase.from("mission_style_guide").select("voice_and_tone,political_sensitivities,cultural_sensitivities").eq("mission_id", data.missionId).maybeSingle(),
      data.sectionId
        ? supabase.from("mission_sections").select("section_name,name,description,section_number").eq("id", data.sectionId).maybeSingle()
        : Promise.resolve({ data: null }),
      data.questionId
        ? supabase.from("questions").select("question_text,question_number").eq("id", data.questionId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("stakeholder_profiles").select("name,title,organization,stakeholder_type,public_priorities,known_concerns").eq("mission_id", data.missionId),
      supabase.from("competitor_profiles").select("organization_name,competitor_type,likely_narrative,known_weaknesses,differentiation_strategy").eq("mission_id", data.missionId),
      supabase.from("procurement_evolution_records").select("iris_signals,iris_summary").eq("mission_id", data.missionId).maybeSingle(),
      supabase.from("intelligence_feed_items").select("category,headline,source_name,source_url,iris_assessment,iris_relevance_score,published_at").eq("mission_id", data.missionId).gte("iris_relevance_score", 50).order("iris_relevance_score", { ascending: false }).limit(50),
      supabase.from("intelligence_graph_nodes").select("label,description").eq("mission_id", data.missionId).eq("node_type", "research").limit(15),
    ]);

    const m = mission?.data as { name?: string; state?: string | null; agency_name?: string | null; program_type?: string | null; client_name?: string | null } | null;
    const w = ws?.data as { win_themes?: unknown; central_claim?: string | null; north_star_message?: string | null; discriminators?: string | null } | null;
    const style = sg?.data as { voice_and_tone?: string | null; political_sensitivities?: string | null; cultural_sensitivities?: string | null } | null;
    const sec = section?.data as { section_name?: string | null; name?: string | null; description?: string | null; section_number?: string | null } | null;
    const qn = question?.data as { question_text?: string | null; question_number?: string | null } | null;
    const evaluators = (stakeholders?.data ?? []).filter((s) => s.stakeholder_type === "evaluator" || s.stakeholder_type === "influencer");
    const comps = competitors?.data ?? [];
    const ev = evol?.data as { iris_signals?: string | null; iris_summary?: string | null } | null;
    const items = (feed?.data ?? []) as Array<{ category: string; headline: string; source_name: string | null; source_url: string | null; iris_assessment: string | null; iris_relevance_score: number; published_at: string | null }>;
    const fedItems = items.filter((i) => i.category === "federal_policy").slice(0, 3);
    const stateItems = items.filter((i) => i.category === "state_policy" || i.category === "state_legislative").slice(0, 2);
    const researchItems = items.filter((i) => i.category === "research").slice(0, 4);

    const winThemesArr = Array.isArray(w?.win_themes)
      ? (w?.win_themes as unknown[]).map((x) => typeof x === "string" ? x : (x as { theme?: string; title?: string })?.theme ?? (x as { title?: string })?.title ?? "").filter(Boolean)
      : [];

    const sectionName = sec?.section_name ?? sec?.name ?? "(unspecified section)";
    const sectionDescription = sec?.description ?? "";
    const questionText = qn?.question_text ?? "";

    const system =
      "You are IRIS, a Medicaid procurement intelligence analyst. Return ONLY valid JSON with this exact shape: " +
      `{ "whats_asked": string, "evaluator_intel": string[], "policy_context": string, "research_evidence": [{"source": string, "year": string, "finding": string, "source_url": string|null}], "competitive": string, "iris_recommends": string }. ` +
      "whats_asked: 2-4 plain-language sentences explaining what this section/question is really asking, beyond the literal words. Do not start with 'This section' or 'This question'. " +
      "evaluator_intel: 2-4 short bullet strings of actionable insights based on evaluator priorities/concerns. If no evaluators given, return []. " +
      "policy_context: 2-3 sentences of federal/state policy context driving this requirement. Reference specific policy names when known. " +
      "research_evidence: 2-4 entries citing real studies/reports with source name, approximate year, and a concise finding. Set source_url if you got the item from the provided feed items. " +
      "competitive: 2-3 sentences on how to differentiate from likely competitors. Empty string if no competitor data. " +
      "iris_recommends: The single most useful, direct, specific strategic recommendation for the writer. Reference win strategy, evaluator priority, and the strongest research. Do not hedge. 3-5 sentences.";

    const user = `Mission: ${m?.name ?? ""} | Client: ${m?.client_name ?? ""} | State: ${m?.state ?? ""} | Agency: ${m?.agency_name ?? ""} | Program: ${m?.program_type ?? ""}
Section ${sec?.section_number ?? ""}: ${sectionName}${sectionDescription ? ` — ${sectionDescription}` : ""}
${qn ? `Question ${qn.question_number ?? ""}: ${questionText}` : ""}

Win Strategy:
- Central Claim: ${w?.central_claim ?? ""}
- North Star: ${w?.north_star_message ?? ""}
- Discriminators: ${w?.discriminators ?? ""}
- Win Themes: ${winThemesArr.join(" | ") || "(none)"}

Style Guide:
- Voice/Tone: ${style?.voice_and_tone ?? ""}
- Political sensitivities: ${style?.political_sensitivities ?? ""}
- Cultural sensitivities: ${style?.cultural_sensitivities ?? ""}

Procurement Evolution signals: ${ev?.iris_signals ?? ev?.iris_summary ?? "(none)"}

Evaluators / Influencers:
${evaluators.length === 0 ? "(none)" : evaluators.map((e) => `- ${e.name}${e.title ? `, ${e.title}` : ""}${e.organization ? ` (${e.organization})` : ""} | type=${e.stakeholder_type} | priorities=${e.public_priorities ?? "?"} | concerns=${e.known_concerns ?? "?"}`).join("\n")}

Competitors:
${comps.length === 0 ? "(none)" : comps.map((c) => `- ${c.organization_name} | type=${c.competitor_type} | narrative=${c.likely_narrative ?? "?"} | weaknesses=${c.known_weaknesses ?? "?"}`).join("\n")}

Recent federal policy items:
${fedItems.map((i) => `- ${i.headline} (${i.source_name ?? "?"}): ${i.iris_assessment ?? ""} [url:${i.source_url ?? ""}]`).join("\n") || "(none)"}

Recent state policy items:
${stateItems.map((i) => `- ${i.headline} (${i.source_name ?? "?"}): ${i.iris_assessment ?? ""} [url:${i.source_url ?? ""}]`).join("\n") || "(none)"}

Recent research items:
${researchItems.map((i) => `- ${i.headline} (${i.source_name ?? "?"}, ${i.published_at?.slice(0, 4) ?? "?"}): ${i.iris_assessment ?? ""} [url:${i.source_url ?? ""}]`).join("\n") || "(none)"}

Research graph nodes:
${(researchNodes?.data ?? []).map((n) => `- ${n.label}${n.description ? `: ${n.description}` : ""}`).join("\n") || "(none)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        max_tokens: 2000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.status === 402) throw new Error("Workspace is out of AI credits.");
    if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
    if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);

    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("IRIS returned a malformed response.");
    const parsed = JSON.parse(match[0]) as Partial<BriefBody>;

    return {
      whats_asked: String(parsed.whats_asked ?? ""),
      evaluator_intel: Array.isArray(parsed.evaluator_intel) ? parsed.evaluator_intel.map(String) : [],
      policy_context: String(parsed.policy_context ?? ""),
      research_evidence: Array.isArray(parsed.research_evidence)
        ? parsed.research_evidence.map((r) => {
            const rec = r as { source?: string; year?: string; finding?: string; source_url?: string | null };
            return {
              source: String(rec.source ?? ""),
              year: rec.year ? String(rec.year) : undefined,
              finding: String(rec.finding ?? ""),
              source_url: rec.source_url ?? null,
            };
          })
        : [],
      competitive: String(parsed.competitive ?? ""),
      iris_recommends: String(parsed.iris_recommends ?? ""),
      has_evaluators: evaluators.length > 0,
      has_competitors: comps.length > 0,
    };
  });
