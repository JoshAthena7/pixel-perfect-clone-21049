/**
 * Mission Brief auto-enrichment via Perplexity.
 *
 * Fires 3 grounded Perplexity calls right after a mission is created/launched
 * and writes the cited results into:
 *   - missions.why_it_matters    ← state landscape
 *   - missions.biggest_concerns  ← incumbent intelligence (Flight Risks)
 *   - oracle_knowledge_base      ← population-specific academic research cards
 *
 * Server-only. Fail-soft: any single call failing should never block the others.
 */
import { askPerplexity } from "./perplexity.server";

type EnrichInput = {
  missionId: string;
  state: string | null;
  stateCode: string | null;
  programType: string | null;
  incumbent: string | null;
  population: string | null;
};

function appendCitations(body: string, citations: string[]): string {
  const urls = citations.filter((u) => typeof u === "string" && u.startsWith("http"));
  if (urls.length === 0) return body;
  const list = urls.slice(0, 8).map((u, i) => `[${i + 1}] ${u}`).join("\n");
  return `${body.trim()}\n\nSources (live, via IRIS):\n${list}`;
}

export async function enrichMissionBrief(input: EnrichInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { missionId, state, programType, incumbent, population } = input;

  const stateLabel = state ?? input.stateCode ?? "the state";
  const program = programType ?? "Medicaid managed care";

  // ---- Call 1: State landscape ----
  const stateDomains = [
    "medicaid.gov",
    "cms.gov",
    "kff.org",
    "nashp.org",
    "macpac.gov",
  ];
  // Best-effort: add the state's own medicaid site if we can guess it
  if (input.stateCode) {
    stateDomains.push(`medicaid.${input.stateCode.toLowerCase()}.gov`);
  }

  const stateIntel = await askPerplexity(
    `${stateLabel} ${program} current status, recent procurements, waiver history, and enrollment trends 2024-2025. Be specific with dates, dollar amounts, and named programs.`,
    {
      model: "sonar-pro",
      recencyFilter: "month",
      domainFilter: stateDomains,
      system:
        "You are IRIS, briefing a proposal team. Write a tight 4-6 sentence situation read. Cite inline. No preamble.",
    },
  );

  if (stateIntel?.content) {
    const body = appendCitations(stateIntel.content, stateIntel.citations ?? []);
    await supabaseAdmin
      .from("missions")
      .update({ why_it_matters: body, updated_at: new Date().toISOString() })
      .eq("id", missionId);
  }

  // ---- Call 2: Incumbent intelligence ----
  if (incumbent && incumbent.trim().length > 0) {
    const incumbentIntel = await askPerplexity(
      `${incumbent} Medicaid managed care contract performance in ${stateLabel} 2023-2025. Include sanctions, corrective action plans, member complaints, quality scores, network adequacy issues, and re-procurement signals.`,
      {
        model: "sonar-pro",
        recencyFilter: "year",
        system:
          "You are IRIS surfacing Flight Risks. Write 4-6 sentences focused on incumbent vulnerabilities and risks for the challenger. Cite inline. No preamble.",
      },
    );
    if (incumbentIntel?.content) {
      const body = appendCitations(incumbentIntel.content, incumbentIntel.citations ?? []);
      await supabaseAdmin
        .from("missions")
        .update({ biggest_concerns: body, updated_at: new Date().toISOString() })
        .eq("id", missionId);
    }
  }

  // ---- Call 3: Population academic research → oracle_knowledge_base ----
  const pop = population ?? program; // fallback to program area
  if (pop) {
    const popResearch = await askPerplexity(
      `${pop} Medicaid outcomes research and evidence base 2023-2025. Summarize peer-reviewed findings on effectiveness, equity, access, and program design.`,
      {
        model: "sonar-pro",
        searchMode: "academic",
        recencyFilter: "year",
        system:
          "You are IRIS curating an academic evidence brief. Write 5-8 sentences citing specific studies (author/year/journal where possible). Cite inline. No preamble.",
      },
    );
    if (popResearch?.content) {
      const sources = (popResearch.citations ?? [])
        .filter((u) => typeof u === "string" && u.startsWith("http"))
        .slice(0, 10);
      await supabaseAdmin.from("oracle_knowledge_base").insert({
        mission_id: missionId,
        core_insight: popResearch.content,
        topic_tags: [pop, "evidence-base", "academic"],
        applicable_mission_types: [program],
        confidence: "medium",
        source_summary:
          sources.length > 0
            ? `Perplexity academic search · ${sources.length} sources\n${sources.join("\n")}`
            : "Perplexity academic search",
        extracted_by: "iris-perplexity-enrichment",
      });
    }
  }

  return {
    state: Boolean(stateIntel?.content),
    incumbent: Boolean(incumbent),
    population: Boolean(pop),
  };
}
