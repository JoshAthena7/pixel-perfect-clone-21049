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

    return { inserted, failures };
  });
