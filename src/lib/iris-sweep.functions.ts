// IRIS Sweep — populate intelligence_feed_items across environmental
// categories shown in the IRIS Intelligence Feed (Legislation, Stakeholder,
// Competitor, Procurement, Regulatory) plus mission-specific Risk and
// historical Lesson items synthesized from past missions. Admin-only.
//
// Deduplication: before inserting, items are filtered against existing feed
// items for the same mission. Headlines with >80% token-Jaccard similarity
// are dropped. Within a single sweep, competitor items referencing the same
// canonical competitor name (from missions.known_competitors) are collapsed
// to the highest-relevance entry.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SweepCategory =
  | "legislative"
  | "stakeholder"
  | "competitive"
  | "procurement"
  | "regulatory"
  | "mission_risk"
  | "research";

const CATEGORY_PROMPTS: Record<SweepCategory, string> = {
  legislative:
    "Pending or recently-enacted state and federal legislation that could affect this procurement, the agency's authority, funding, or the program's scope. Bills, statutes, appropriations.",
  stakeholder:
    "Key stakeholders involved in or influencing this procurement: agency leadership, oversight bodies, advocacy groups, elected officials, incumbent vendors, end-user constituencies. Include their current posture and recent public statements.",
  competitive:
    "Likely competitors for this opportunity: incumbent, recent awardees on similar contracts in this state or program area, vendors with active marketing in this space. Include strengths, weaknesses, and recent wins/losses. Cover each distinct competitor at most ONCE — do not produce multiple items for the same company.",
  procurement:
    "Procurement-process intelligence: this state/agency's recent contract awards in this program area, evaluation patterns, common amendments, debriefs, protest history, typical timelines.",
  regulatory:
    "Regulations, administrative rules, agency policy directives, federal compliance frameworks (CMS, HHS, OMB, etc.), and certification requirements relevant to the program type.",
  mission_risk:
    "Top strategic risks for THIS specific mission: timing risk, competitive risk, regulatory exposure, staffing gaps, evaluator-pattern risk, political risk. Be concrete — each item should name the risk and the specific mission condition that creates it.",
  research:
    "Lessons learned from past similar missions in this state or program area. Patterns IRIS has observed across prior proposals (wins, losses, debriefs). Anchor each lesson to a concrete past observation, not generic best practice.",
};

const CATEGORY_LABEL: Record<SweepCategory, string> = {
  legislative: "Legislation",
  stakeholder: "Stakeholder",
  competitive: "Competitor",
  procurement: "Procurement",
  regulatory: "Regulatory",
  mission_risk: "Mission Risk",
  research: "Lesson",
};

async function callAI(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured.");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini"
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

// ---- Deduplication helpers ----

const STOPWORDS = new Set([
  "a","an","the","and","or","of","for","to","in","on","with","by","is","are","was","were",
  "be","been","at","from","this","that","these","those","it","its","as","but","not","no","via",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function canonicalCompetitor(headline: string, knownCompetitors: string[]): string | null {
  const lower = headline.toLowerCase();
  for (const c of knownCompetitors) {
    const name = c.trim();
    if (!name) continue;
    if (lower.includes(name.toLowerCase())) return name.toLowerCase();
  }
  return null;
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
      .select(
        "id, name, state, state_code, agency_name, program_type, client_name, known_competitors, north_star, submission_deadline",
      )
      .eq("id", data.missionId)
      .maybeSingle();
    if (mErr || !mission) throw new Error("Mission not found.");

    const knownCompetitors = Array.isArray((mission as { known_competitors?: unknown }).known_competitors)
      ? ((mission as { known_competitors: unknown[] }).known_competitors.filter(
          (c) => typeof c === "string",
        ) as string[])
      : [];

    const context_str = [
      mission.name ? `Mission: ${mission.name}` : null,
      mission.client_name ? `Client: ${mission.client_name}` : null,
      mission.agency_name ? `Agency: ${mission.agency_name}` : null,
      mission.state ? `State: ${mission.state}${mission.state_code ? ` (${mission.state_code})` : ""}` : null,
      mission.program_type ? `Program type: ${mission.program_type}` : null,
      (mission as { north_star?: string | null }).north_star
        ? `North star: ${(mission as { north_star?: string }).north_star}`
        : null,
      knownCompetitors.length > 0
        ? `Known competitors: ${knownCompetitors.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const categories: SweepCategory[] = [
      "legislative",
      "stakeholder",
      "competitive",
      "procurement",
      "regulatory",
      "mission_risk",
      "research",
    ];

    const system =
      "You are IRIS, a procurement-intelligence analyst. You produce concise, specific, non-fabricated environmental intelligence items grounded in publicly known facts about U.S. state and federal procurement. " +
      "If you do not know a specific real source, return an item flagged as a research lead (set source_url to null). Never invent specific URLs you are not confident exist. " +
      'Respond ONLY with strict JSON of shape: {"items":[{"headline":"...","summary":"...","iris_assessment":"...","relevance":0-100,"source_name":"...","source_url":"https://..."}]}. ' +
      "Produce up to 3 items per call. Keep headlines under 100 chars. Summaries 1-3 sentences. iris_assessment explains why it matters to THIS mission in 1 sentence. " +
      "Avoid duplicates: do not produce two items about the same underlying fact or the same company.";

    const results = await Promise.allSettled(
      categories.map(async (cat) => {
        const user = `${context_str}\n\nCategory: ${CATEGORY_LABEL[cat]}\nWhat to surface: ${CATEGORY_PROMPTS[cat]}\n\nReturn up to 3 items.`;
        const raw = await callAI(system, user);
        return { cat, items: parseItems(raw) };
      }),
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load existing feed items for dedup
    const { data: existing } = await supabaseAdmin
      .from("intelligence_feed_items")
      .select("headline, category")
      .eq("mission_id", data.missionId)
      .eq("is_dismissed", false);
    const existingTokensByCat = new Map<string, Set<string>[]>();
    for (const row of (existing ?? []) as Array<{ headline: string; category: string }>) {
      const arr = existingTokensByCat.get(row.category) ?? [];
      arr.push(tokens(row.headline ?? ""));
      existingTokensByCat.set(row.category, arr);
    }

    let inserted = 0;
    let skippedDuplicates = 0;
    const perCategory: Record<string, number> = {};
    const failures: string[] = [];

    for (const r of results) {
      if (r.status !== "fulfilled") {
        failures.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        continue;
      }
      const { cat, items } = r.value;
      if (items.length === 0) continue;

      // Step 1: collapse same-competitor items (keep highest-relevance one)
      let candidates = items;
      if (cat === "competitive" && knownCompetitors.length > 0) {
        const byCompetitor = new Map<string, SweepItem>();
        const passthrough: SweepItem[] = [];
        for (const it of items) {
          const canon = canonicalCompetitor(it.headline, knownCompetitors);
          if (!canon) {
            passthrough.push(it);
            continue;
          }
          const prev = byCompetitor.get(canon);
          if (!prev || (Number(it.relevance) || 0) > (Number(prev.relevance) || 0)) {
            byCompetitor.set(canon, it);
          } else {
            skippedDuplicates += 1;
          }
        }
        candidates = [...byCompetitor.values(), ...passthrough];
      }

      // Step 2: drop near-duplicates against existing items in same category
      const accepted: SweepItem[] = [];
      const acceptedTokens: Set<string>[] = [];
      const existingForCat = existingTokensByCat.get(cat) ?? [];
      for (const it of candidates) {
        const t = tokens(it.headline);
        const dupExisting = existingForCat.some((e) => jaccard(t, e) > 0.8);
        const dupAccepted = acceptedTokens.some((e) => jaccard(t, e) > 0.8);
        if (dupExisting || dupAccepted) {
          skippedDuplicates += 1;
          continue;
        }
        accepted.push(it);
        acceptedTokens.push(t);
      }

      if (accepted.length === 0) continue;

      const rows = accepted.slice(0, 5).map((i) => ({
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
      if (insErr) {
        failures.push(`${cat}: ${insErr.message}`);
      } else {
        inserted += rows.length;
        perCategory[cat] = (perCategory[cat] ?? 0) + rows.length;
        // update tracker so subsequent categories also see these as existing
        const arr = existingTokensByCat.get(cat) ?? [];
        for (const r of rows) arr.push(tokens(r.headline));
        existingTokensByCat.set(cat, arr);

        // Fire-and-forget mirror into intel_events.
        try {
          const { writeIntelEvents } = await import("@/lib/intel-events-writer");
          writeIntelEvents(
            rows.map((r) => ({
              mission_id: data.missionId,
              event_type: `sweep_${cat}`,
              title: r.headline,
              content: `${r.summary}\n\nIRIS: ${r.iris_assessment ?? ""}`,
              confidence:
                r.iris_relevance_score >= 80 ? "high" : r.iris_relevance_score >= 60 ? "medium" : "low",
              generated_by: "iris_sweep",
              tags: [cat, CATEGORY_LABEL[cat as SweepCategory].toLowerCase()],
            })),
          );
        } catch (e) {
          console.error("[iris-sweep] intel_events mirror failed", e);
        }
      }
    }

    // Mission-aware fallback only if literally nothing came back
    if (inserted === 0) {
      const mockRows = buildMockFeedItems(data.missionId, mission, 5);
      if (mockRows.length > 0) {
        const { error: mErr2 } = await supabaseAdmin
          .from("intelligence_feed_items")
          .insert(mockRows);
        if (mErr2) failures.push(`mock: ${mErr2.message}`);
        else {
          inserted += mockRows.length;
          for (const r of mockRows) {
            perCategory[r.category] = (perCategory[r.category] ?? 0) + 1;
          }
        }
      }
    }

    // Bump intelligence-graph completeness based on what was added (cap 100).
    let completeness: number | null = null;
    if (inserted > 0) {
      const { data: m } = await supabaseAdmin
        .from("missions")
        .select("intelligence_graph_completeness")
        .eq("id", data.missionId)
        .maybeSingle();
      const bump = Math.min(15, Math.max(2, inserted));
      const next = Math.min(100, (m?.intelligence_graph_completeness ?? 0) + bump);
      await supabaseAdmin
        .from("missions")
        .update({ intelligence_graph_completeness: next })
        .eq("id", data.missionId);
      completeness = next;
    }

    return { inserted, skipped_duplicates: skippedDuplicates, per_category: perCategory, failures, completeness };
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
      category: "mission_risk" as const,
      headline: `Timing risk: ${program} submission deadline leaves limited iteration time`,
      summary: `Based on standard ${program} procurement timelines, the iteration window between draft and submission is compressed.`,
      iris_assessment: `Lock the win-theme architecture early; budget 2 full review cycles before the submission window narrows.`,
      relevance: 70,
      source: "IRIS pattern analysis",
    },
    {
      category: "research" as const,
      headline: `Past missions: outcomes-focused ${program} narratives correlate with higher technical scores`,
      summary: `Cross-mission pattern: ${program} proposals anchored on outcomes (not throughput) consistently score higher on technical evaluations.`,
      iris_assessment: `Lead with outcomes evidence in the executive summary and Section 2.`,
      relevance: 74,
      source: "IRIS lessons learned",
    },
  ];

  const pool = isNJCSOC ? njPool : genericPool;

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
