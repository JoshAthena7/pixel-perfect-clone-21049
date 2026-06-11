/**
 * IRIS Evaluator Picture — server functions.
 *
 * Builds an honest, sourced, confidence-labeled picture of the scoring panel
 * mindset for a procurement. NOT a simulation of named individuals; a
 * structural inference from documented signals IRIS can actually read.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const CACHE_HOURS = 48;
const REGENERATE_AFTER_DAYS = 7;
const HIGH_RELEVANCE_THRESHOLD = 80;

type Confidence = "high" | "medium" | "low";

interface SignalEntry {
  signal: string;
  what_it_reveals: string;
  confidence: Confidence;
  source?: string;
}
interface NamedIndividual {
  name: string;
  role: string;
  what_iris_knows: string;
  relevance_to_scoring: string;
}
interface PressureEntry {
  pressure?: string;
  fear?: string;
  need?: string;
  confidence: Confidence;
  source: string;
}
interface GapAction {
  action: string;
  what_it_would_reveal: string;
}
interface QuestionSnapshot {
  section_id: string;
  relevance: "high" | "medium" | "low";
  one_thing_to_know: string;
}
interface EvaluatorPictureJson {
  rfp_signals?: SignalEntry[];
  prior_procurement_signals?: SignalEntry[];
  public_record_signals?: SignalEntry[];
  political_signals?: SignalEntry[];
  named_individual_signals?: NamedIndividual[];
  inferred_panel_mindset?: string;
  inferred_pressures?: PressureEntry[];
  inferred_fears?: PressureEntry[];
  inferred_defensibility_needs?: PressureEntry[];
  scoring_lens?: string;
  what_iris_does_not_know?: string;
  how_to_fill_gaps?: GapAction[];
  confidence_overall?: Confidence;
  one_sentence_bottom_line?: string;
}

async function callGemini(system: string, user: string, jsonMode = true): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured.");
  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
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
  if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

function extractJson<T = unknown>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]) as T; } catch { return null; }
  }
}

function validatePicture(j: EvaluatorPictureJson | null): j is Required<
  Pick<EvaluatorPictureJson, "inferred_panel_mindset" | "scoring_lens" | "what_iris_does_not_know" | "one_sentence_bottom_line">
> & EvaluatorPictureJson {
  if (!j) return false;
  if (typeof j.inferred_panel_mindset !== "string" || j.inferred_panel_mindset.trim().length < 10) return false;
  if (typeof j.scoring_lens !== "string" || j.scoring_lens.trim().length < 10) return false;
  if (typeof j.what_iris_does_not_know !== "string" || j.what_iris_does_not_know.trim().length < 5) return false;
  if (typeof j.one_sentence_bottom_line !== "string" || j.one_sentence_bottom_line.trim().length < 5) return false;
  return true;
}

const SYSTEM_PROMPT = `You are IRIS, the intelligence co-pilot for Athena Strategy Group. Athena helps organizations win complex Medicaid procurements. Your job is to build an honest picture of how the scoring panel for this specific procurement thinks — not who they are as individuals, but how the institutional context shapes their evaluation behavior.

This is not speculation. This is structured inference from documented signals. You must:

- Label everything as either known (from a specific document or public record) or inferred (from pattern and context)
- Assign a confidence level to every inference: high (strong documented basis), medium (reasonable inference from multiple signals), or low (plausible but thin evidence)
- Be explicit about what you do not know and what the team could do to learn more
- Never invent facts. Never pretend certainty you do not have.

Write in the Athena voice: direct, specific, grounded. No corporate jargon. Short sentences.

The most important thing you must answer: what would a member of this scoring panel have to defend to their supervisor, their legislature, and to federal auditors if they awarded this contract to Athena? Write to that question above all others.

Return ONLY valid JSON with no other text, no markdown, no backticks.`;

export const buildEvaluatorPicture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid(),
      forceRegenerate: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { missionId, forceRegenerate } = data;

    // Cache short-circuit
    if (!forceRegenerate) {
      const { data: existing } = await supabase
        .from("evaluator_pictures")
        .select("*")
        .eq("mission_id", missionId)
        .maybeSingle();
      if (existing && existing.generated_at) {
        const ageHours = (Date.now() - new Date(existing.generated_at).getTime()) / 3_600_000;
        if (ageHours < CACHE_HOURS) {
          return { picture: existing, cached: true };
        }
      }
    }

    // Step A — gather signals
    const [
      missionRes, winRes, sectionsRes, evoRes, stakeholdersRes,
      competitorsRes, feedRes, graphRes,
    ] = await Promise.all([
      supabase.from("missions").select("id,name,client_name,state,state_code,program_type,submission_deadline,agency_name").eq("id", missionId).single(),
      supabase.from("mission_win_strategy").select("north_star_message,central_claim,win_themes,known_competitors").eq("mission_id", missionId).maybeSingle(),
      supabase.from("mission_sections").select("id,title,description").eq("mission_id", missionId).order("sort_order", { ascending: true }),
      supabase.from("procurement_evolution_records").select("iris_summary,iris_signals,iris_recommendations,material_changes").eq("mission_id", missionId).maybeSingle(),
      supabase.from("stakeholder_profiles").select("name,role,stakeholder_type,public_priorities,known_concerns,background").eq("mission_id", missionId).order("stakeholder_type", { ascending: true }),
      supabase.from("competitor_profiles").select("organization_name,competitor_type,strengths,weaknesses,prior_relationships").eq("mission_id", missionId),
      supabase.from("intelligence_feed_items").select("headline,summary,category,iris_relevance_score,source_name,published_at").eq("mission_id", missionId).gte("iris_relevance_score", 65).order("iris_relevance_score", { ascending: false }).limit(10),
      supabase.from("intelligence_graph_nodes").select("title,description,node_type").eq("mission_id", missionId).in("node_type", ["policy", "risk"]).limit(15),
    ]);

    const mission = missionRes.data;
    if (!mission) throw new Error("Mission not found.");

    const days = mission.submission_deadline
      ? Math.max(0, Math.ceil((new Date(mission.submission_deadline).getTime() - Date.now()) / 86_400_000))
      : null;

    const sections = sectionsRes.data ?? [];
    const stakeholders = stakeholdersRes.data ?? [];
    const competitors = competitorsRes.data ?? [];
    const feedItems = feedRes.data ?? [];
    const graphNodes = graphRes.data ?? [];

    const policyNodes = graphNodes.filter((n) => n.node_type === "policy");
    const riskNodes = graphNodes.filter((n) => n.node_type === "risk");

    const agencyFeedItems = feedItems.filter((f) =>
      /audit|hearing|legislat|oversight|advocacy|criticism|complaint|investigat/i.test(`${f.headline} ${f.summary ?? ""}`),
    );

    const signalsCount =
      sections.length + stakeholders.length + competitors.length +
      feedItems.length + graphNodes.length + (evoRes.data ? 1 : 0);

    // Step B — build prompt
    const userPrompt = `Build the Evaluator Picture for this Medicaid procurement.

Mission: ${mission.name}
Client agency: ${mission.agency_name ?? mission.client_name}, ${mission.state ?? "—"}
Program type: ${mission.program_type ?? "—"}
Days to submission: ${days ?? "—"}

RFP structure signals:
Sections and their relative length and specificity:
${sections.map((s) => `- ${s.title}: ${(s.description ?? "").slice(0, 220)}`).join("\n") || "No sections imported"}
Material changes from prior RFP: ${evoRes.data?.material_changes ? JSON.stringify(evoRes.data.material_changes).slice(0, 1200) : "Unknown"}

Prior procurement record:
IRIS summary: ${evoRes.data?.iris_summary ?? "Unknown"}
IRIS signals: ${evoRes.data?.iris_signals ? JSON.stringify(evoRes.data.iris_signals).slice(0, 1500) : "Unknown"}

Known competitors and their history:
${competitors.map((c) => `- ${c.organization_name} (${c.competitor_type ?? "?"}): strengths=${(c.strengths ?? "").toString().slice(0, 120)}, prior=${(c.prior_relationships ?? "").toString().slice(0, 120)}`).join("\n") || "None tracked"}

Public record of agency problems (audits, hearings, oversight):
${agencyFeedItems.map((f) => `- [${f.iris_relevance_score}] ${f.headline} (${f.source_name ?? "?"})`).join("\n") || "None tracked"}

Risk nodes related to agency accountability:
${riskNodes.map((n) => `- ${n.title}: ${(n.description ?? "").slice(0, 180)}`).join("\n") || "None"}

Political environment:
Policy nodes: ${policyNodes.map((n) => `${n.title}: ${(n.description ?? "").slice(0, 120)}`).join(" | ") || "None"}
Political signals from feed: ${feedItems.filter((f) => /elect|legislat|governor|polic/i.test(f.category ?? "")).map((f) => f.headline).join(" | ") || "None"}

Named individuals with public records:
${stakeholders.length === 0
  ? "NO NAMED EVALUATORS IDENTIFIED. The named_individual_signals array MUST be empty."
  : stakeholders.map((s) => `- ${s.name} (${s.role ?? s.stakeholder_type ?? "?"}): priorities=${(s.public_priorities ?? "").toString().slice(0, 160)} | concerns=${(s.known_concerns ?? "").toString().slice(0, 160)}`).join("\n")}

Win Strategy context (so IRIS can assess fit):
North Star: ${winRes.data?.north_star_message ?? "—"}
Central Claim: ${winRes.data?.central_claim ?? "—"}
Win Themes: ${winRes.data?.win_themes ? JSON.stringify(winRes.data.win_themes).slice(0, 600) : "—"}

Based on all of this return exactly this JSON structure:
{
  "rfp_signals": [{"signal": "string", "what_it_reveals": "string", "confidence": "high|medium|low"}],
  "prior_procurement_signals": [{"signal": "string", "what_it_reveals": "string", "confidence": "high|medium|low"}],
  "public_record_signals": [{"signal": "string", "what_it_reveals": "string", "source": "string", "confidence": "high|medium|low"}],
  "political_signals": [{"signal": "string", "what_it_reveals": "string", "confidence": "high|medium|low"}],
  "named_individual_signals": [{"name": "string", "role": "string", "what_iris_knows": "string", "relevance_to_scoring": "string"}],
  "inferred_panel_mindset": "string (2-3 sentences, direct, no jargon)",
  "inferred_pressures": [{"pressure": "string", "confidence": "high|medium|low", "source": "string"}],
  "inferred_fears": [{"fear": "string", "confidence": "high|medium|low", "source": "string"}],
  "inferred_defensibility_needs": [{"need": "string", "confidence": "high|medium|low", "source": "string"}],
  "scoring_lens": "string (1 paragraph)",
  "what_iris_does_not_know": "string (honest explicit statement)",
  "how_to_fill_gaps": [{"action": "string", "what_it_would_reveal": "string"}],
  "confidence_overall": "high|medium|low",
  "one_sentence_bottom_line": "string (max 160 chars)"
}`;

    // Step C — generate + validate with one retry
    let parsed: EvaluatorPictureJson | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callGemini(SYSTEM_PROMPT, userPrompt, true);
        parsed = extractJson<EvaluatorPictureJson>(raw);
        if (validatePicture(parsed)) break;
        parsed = null;
      } catch (e) {
        console.error("[buildEvaluatorPicture] AI call failed attempt", attempt, e);
      }
    }
    if (!parsed || !validatePicture(parsed)) {
      console.error("[buildEvaluatorPicture] validation failed after retries");
      return { picture: null, cached: false };
    }

    // Step D — per-section question snapshots in parallel
    const sectionSystem = "You are IRIS. Return ONLY a JSON object {\"section_id\":\"...\",\"relevance\":\"high|medium|low\",\"one_thing_to_know\":\"...\"}. No prose, no markdown.";
    const snapshotPromises = sections.slice(0, 12).map(async (s): Promise<QuestionSnapshot | null> => {
      const prompt = `Mission: ${mission.name}
Evaluator panel mindset: ${parsed.inferred_panel_mindset}
Top 2 fears: ${(parsed.inferred_fears ?? []).slice(0, 2).map((f) => f.fear).join(" | ") || "—"}
Top 2 defensibility needs: ${(parsed.inferred_defensibility_needs ?? []).slice(0, 2).map((n) => n.need).join(" | ") || "—"}

Section: ${s.title}
Section description: ${(s.description ?? "").slice(0, 400)}

What is the single most important thing a writer should know about how this panel will read this section? Maximum 2 sentences. Grounded in the evaluator picture. Section_id is "${s.id}".`;
      try {
        const raw = await callGemini(sectionSystem, prompt, true);
        const j = extractJson<QuestionSnapshot>(raw);
        if (!j || typeof j.one_thing_to_know !== "string" || !j.one_thing_to_know.trim()) return null;
        return { section_id: s.id, relevance: j.relevance ?? "medium", one_thing_to_know: j.one_thing_to_know };
      } catch (e) {
        console.error("[buildEvaluatorPicture] section snapshot failed", s.id, e);
        return null;
      }
    });
    const snapshots = (await Promise.all(snapshotPromises)).filter((s): s is QuestionSnapshot => !!s);

    // Step E — upsert
    const upsertPayload = {
      mission_id: missionId,
      generated_at: new Date().toISOString(),
      generated_by: "IRIS",
      rfp_signals: parsed.rfp_signals ?? [],
      prior_procurement_signals: parsed.prior_procurement_signals ?? [],
      public_record_signals: parsed.public_record_signals ?? [],
      political_signals: parsed.political_signals ?? [],
      named_individual_signals: parsed.named_individual_signals ?? [],
      inferred_panel_mindset: parsed.inferred_panel_mindset,
      inferred_pressures: parsed.inferred_pressures ?? [],
      inferred_fears: parsed.inferred_fears ?? [],
      inferred_defensibility_needs: parsed.inferred_defensibility_needs ?? [],
      scoring_lens: parsed.scoring_lens,
      what_iris_does_not_know: parsed.what_iris_does_not_know,
      how_to_fill_gaps: parsed.how_to_fill_gaps ?? [],
      question_snapshots: snapshots,
      confidence_overall: parsed.confidence_overall ?? "low",
      one_sentence_bottom_line: parsed.one_sentence_bottom_line,
      signals_count: signalsCount,
      updated_at: new Date().toISOString(),
    };

    // Use admin client so service role can bypass admin-only INSERT/UPDATE RLS
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upserted, error: upsertErr } = await supabaseAdmin
      .from("evaluator_pictures")
      .upsert(upsertPayload, { onConflict: "mission_id" })
      .select("*")
      .single();
    if (upsertErr) {
      console.error("[buildEvaluatorPicture] upsert failed", upsertErr);
      return { picture: null, cached: false };
    }

    return { picture: upserted, cached: false };
  });

/**
 * Server-only helper for monitoring hooks: regenerate the picture when a
 * high-relevance feed item arrives AND the existing picture is stale.
 * Called from monitoring-utils.server.ts after a feed item is created.
 */
export { HIGH_RELEVANCE_THRESHOLD, REGENERATE_AFTER_DAYS };
