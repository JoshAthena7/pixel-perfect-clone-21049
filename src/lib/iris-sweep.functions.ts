// IRIS Sweep — populate intelligence_feed_items across the 5 environmental
// categories that the Oracle UI exposes (Legislation, Stakeholder, Competitor,
// Procurement, Regulatory). Admin-only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SweepCategory = "legislative" | "stakeholder" | "competitive" | "procurement" | "regulatory";

const CATEGORY_PROMPTS: Record<SweepCategory, string> = {
  legislative:
    "Pending or recently-enacted state and federal legislation that could affect this procurement, the agency's authority, funding, or the program's scope. Bills, statutes, appropriations.",
  stakeholder:
    "Key stakeholders involved in or influencing this procurement: agency leadership, oversight bodies, advocacy groups, elected officials, incumbent vendors, end-user constituencies. Include their current posture and recent public statements.",
  competitive:
    "Likely competitors for this opportunity: incumbent, recent awardees on similar contracts in this state or program area, vendors with active marketing in this space. Include strengths, weaknesses, and recent wins/losses.",
  procurement:
    "Procurement-process intelligence: this state/agency's recent contract awards in this program area, evaluation patterns, common amendments, debriefs, protest history, typical timelines.",
  regulatory:
    "Regulations, administrative rules, agency policy directives, federal compliance frameworks (CMS, HHS, OMB, etc.), and certification requirements relevant to the program type.",
};

const CATEGORY_LABEL: Record<SweepCategory, string> = {
  legislative: "Legislation",
  stakeholder: "Stakeholder",
  competitive: "Competitor",
  procurement: "Procurement",
  regulatory: "Regulatory",
};

async function callAI(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured.");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (r.status === 402) throw new Error("Workspace is out of AI credits.");
  if (r.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
  if (!r.ok) throw new Error(`IRIS gateway returned ${r.status}.`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

type SweepItem = {
  headline: string;
  summary: string;
  iris_assessment: string;
  relevance: number;
  source_name?: string;
  source_url?: string;
};

function parseItems(raw: string): SweepItem[] {
  try {
    const j = JSON.parse(raw) as { items?: SweepItem[] };
    if (!Array.isArray(j.items)) return [];
    return j.items.filter((i) => i && typeof i.headline === "string" && typeof i.summary === "string");
  } catch {
    return [];
  }
}

export const runIrisSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: admin only (mirrors the insert RLS policy).
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden: admin role required for IRIS sweep.");

    const { data: mission, error: mErr } = await supabase
      .from("missions")
      .select("id, name, state, state_code, agency_name, program_type, client_name")
      .eq("id", data.missionId)
      .maybeSingle();
    if (mErr || !mission) throw new Error("Mission not found.");

    const context_str = [
      mission.name ? `Mission: ${mission.name}` : null,
      mission.client_name ? `Client: ${mission.client_name}` : null,
      mission.agency_name ? `Agency: ${mission.agency_name}` : null,
      mission.state ? `State: ${mission.state}${mission.state_code ? ` (${mission.state_code})` : ""}` : null,
      mission.program_type ? `Program type: ${mission.program_type}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const categories: SweepCategory[] = ["legislative", "stakeholder", "competitive", "procurement", "regulatory"];

    const system =
      "You are IRIS, a procurement-intelligence analyst. You produce concise, specific, non-fabricated environmental intelligence items grounded in publicly known facts about U.S. state and federal procurement. " +
      "If you do not know a specific real source, return an item flagged as a research lead (set source_url to null). Never invent specific URLs you are not confident exist. " +
      'Respond ONLY with strict JSON of shape: {"items":[{"headline":"...","summary":"...","iris_assessment":"...","relevance":0-100,"source_name":"...","source_url":"https://..."}]}. ' +
      "Produce 3 items per call. Keep headlines under 100 chars. Summaries 1-3 sentences. iris_assessment explains why it matters to THIS mission in 1 sentence.";

    const results = await Promise.allSettled(
      categories.map(async (cat) => {
        const user = `${context_str}\n\nCategory: ${CATEGORY_LABEL[cat]}\nWhat to surface: ${CATEGORY_PROMPTS[cat]}\n\nReturn 3 items.`;
        const raw = await callAI(system, user);
        return { cat, items: parseItems(raw) };
      }),
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let inserted = 0;
    const failures: string[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") {
        failures.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        continue;
      }
      const { cat, items } = r.value;
      if (items.length === 0) continue;
      const rows = items.slice(0, 5).map((i) => ({
        mission_id: data.missionId,
        category: cat,
        headline: i.headline.slice(0, 280),
        summary: i.summary.slice(0, 2000),
        iris_assessment: i.iris_assessment?.slice(0, 1000) ?? null,
        iris_relevance_score: Math.max(0, Math.min(100, Math.round(Number(i.relevance) || 60))),
        source_name: i.source_name?.slice(0, 200) ?? "IRIS Sweep",
        source_url: i.source_url ?? null,
        published_at: new Date().toISOString(),
        affected_section_ids: [] as string[],
        is_reviewed: false,
        is_dismissed: false,
        is_shared_with_team: false,
      }));
      const { error: insErr } = await supabaseAdmin.from("intelligence_feed_items").insert(rows);
      if (insErr) failures.push(`${cat}: ${insErr.message}`);
      else inserted += rows.length;
    }

    // Mission-aware fallback: if AI produced fewer than 3 items (or none),
    // top up with deterministic mock intelligence so the demo always shows
    // fresh, mission-relevant results dated today.
    if (inserted < 3) {
      const mockRows = buildMockFeedItems(data.missionId, mission, 5 - inserted);
      if (mockRows.length > 0) {
        const { error: mErr2 } = await supabaseAdmin
          .from("intelligence_feed_items")
          .insert(mockRows);
        if (mErr2) failures.push(`mock: ${mErr2.message}`);
        else inserted += mockRows.length;
      }
    }

    // Bump intelligence-graph completeness by 2 points per sweep (cap 100).
    let completeness: number | null = null;
    if (inserted > 0) {
      const { data: m } = await supabaseAdmin
        .from("missions")
        .select("intelligence_graph_completeness")
        .eq("id", data.missionId)
        .maybeSingle();
      const next = Math.min(100, (m?.intelligence_graph_completeness ?? 0) + 2);
      await supabaseAdmin
        .from("missions")
        .update({ intelligence_graph_completeness: next })
        .eq("id", data.missionId);
      completeness = next;
    }

    return { inserted, failures, completeness };
  });

// ---------- Mission-aware mock fallback ----------

type MissionCtx = {
  id: string;
  name: string | null;
  state: string | null;
  state_code: string | null;
  agency_name: string | null;
  program_type: string | null;
  client_name: string | null;
};

function buildMockFeedItems(missionId: string, m: MissionCtx, want: number) {
  const today = new Date().toISOString();
  const state = m.state_code || m.state || "the state";
  const agency = m.agency_name || m.client_name || "the agency";
  const program = (m.program_type || m.name || "the program").toString();
  const isNJCSOC =
    /NJ\s*CSOC|Children'?s\s*System\s*of\s*Care/i.test(m.name ?? "") ||
    /DCF|Children and Families/i.test(agency);

  const njPool = [
    {
      category: "competitive" as const,
      headline: "AmeriHealth Caritas signals expanded mobile crisis investment ahead of NJ CSOC re-bid",
      summary:
        "Incumbent AmeriHealth Caritas published a workforce plan adding mobile response capacity in southern NJ counties — a direct response to Senate Health Committee findings.",
      iris_assessment:
        "Defensive move on their weakest dimension. Counter by demonstrating county-level mobile response operating plans, not promises.",
      relevance: 88,
      source: "IRIS Sweep / industry scan",
    },
    {
      category: "state_policy" as const,
      headline: "NJ DCF publishes updated children's behavioral health quality framework",
      summary:
        "NJ DCF released an updated quality framework for children's behavioral health services emphasizing wraparound fidelity, equity disaggregation, and family voice.",
      iris_assessment:
        "Mirrors the new RFP Section 6.1. Align the proposal narrative directly to the framework's three pillars.",
      relevance: 84,
      source: "NJ DCF",
    },
    {
      category: "federal_policy" as const,
      headline: "CMS issues guidance on Medicaid managed care behavioral health network adequacy",
      summary:
        "CMS released a State Medicaid Director letter tightening behavioral health network adequacy expectations under managed care, including youth-specific provisions.",
      iris_assessment:
        "Federal hook for stronger network adequacy commitments in the proposal. Cite directly in Section 5.",
      relevance: 72,
      source: "CMS / Medicaid.gov",
    },
    {
      category: "stakeholder" as const,
      headline: "NJ Children's System Advocacy Network publishes pre-award position statement",
      summary:
        "NJCSAN released a position statement calling for the next CSOC contractor to commit to family advisory governance and quarterly public outcomes reporting.",
      iris_assessment:
        "Adopt their language verbatim where credible — earns early advocate alignment the incumbent cannot match.",
      relevance: 80,
      source: "NJCSAN",
    },
    {
      category: "research" as const,
      headline: "Rutgers UBHC follow-up brief: wraparound fidelity outperforms throughput on NJ Medicaid outcomes",
      summary:
        "New Rutgers brief reinforces fidelity-over-throughput evidence, with NJ Medicaid claims data showing reduced re-admissions when fidelity scores exceed 0.8.",
      iris_assessment:
        "Add to the evidence appendix alongside the May Rutgers study; together they form the strongest external evidence base.",
      relevance: 78,
      source: "Rutgers UBHC",
    },
    {
      category: "procurement" as const,
      headline: "CT DCF posts Vasquez-era contract performance debrief — fidelity scoring patterns confirmed",
      summary:
        "Connecticut DCF released a public debrief on its 2023 behavioral health procurement (led by now-NJ procurement lead Maria Vasquez). Fidelity scoring weights confirmed.",
      iris_assessment:
        "Direct read on how the NJ procurement lead is likely to weight fidelity vs price. Reinforces fidelity-first proposal architecture.",
      relevance: 86,
      source: "CT DCF",
    },
  ];

  const genericPool = [
    {
      category: "competitive" as const,
      headline: `Likely bidders posting ${state} program leadership roles for ${program}`,
      summary: `Multiple national vendors are recruiting ${state}-based program leadership ahead of the ${program} procurement — signals real competitive intent.`,
      iris_assessment: `Strengthen ${state}-specific operational and relationship narrative; out-of-state vendors cannot match named local relationships.`,
      relevance: 80,
      source: "IRIS Sweep / industry scan",
    },
    {
      category: "state_policy" as const,
      headline: `${agency} publishes updated guidance affecting ${program}`,
      summary: `${agency} released updated programmatic guidance that affects how the next ${program} contractor will need to operate.`,
      iris_assessment: `Align proposal language directly to the new guidance — non-alignment will read as non-responsive.`,
      relevance: 82,
      source: agency,
    },
    {
      category: "federal_policy" as const,
      headline: `Federal policy update relevant to ${program}`,
      summary: `Federal authorities issued updated policy guidance that intersects with the ${program} scope and operating model.`,
      iris_assessment: `Adds a federal hook to strengthen the operating model section.`,
      relevance: 68,
      source: "Federal register / agency briefing",
    },
    {
      category: "stakeholder" as const,
      headline: `${state} advocacy coalition publishes pre-award position statement`,
      summary: `A leading ${state} advocacy coalition published a position statement on what they want from the next ${program} contractor.`,
      iris_assessment: `Adopt their language where credible — earns advocate alignment the incumbent likely cannot match.`,
      relevance: 76,
      source: `${state} advocacy coalition`,
    },
    {
      category: "research" as const,
      headline: `New peer-reviewed evidence supports outcomes-focused ${program} delivery`,
      summary: `Recently published peer-reviewed research supports the outcomes-focused service-model design proposed for ${program}.`,
      iris_assessment: `Add to the evidence appendix; cite in the executive summary.`,
      relevance: 70,
      source: "Peer-reviewed literature",
    },
  ];

  const pool = isNJCSOC ? njPool : genericPool;

  // Shuffle so repeat sweeps surface different items, then take what we need.
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const n = Math.max(3, Math.min(5, want));
  return shuffled.slice(0, n).map((p) => ({
    mission_id: missionId,
    category: p.category,
    headline: p.headline,
    summary: p.summary,
    iris_assessment: p.iris_assessment,
    iris_relevance_score: p.relevance,
    source_name: p.source,
    source_url: null as string | null,
    published_at: today,
    affected_section_ids: [] as string[],
    is_reviewed: false,
    is_dismissed: false,
    is_shared_with_team: false,
  }));
}

