/**
 * /api/public/hooks/pipeline-horizon
 *
 * Promotes recent market_intelligence items to pipeline_horizon.
 * For each promoted item, IRIS interprets it and links it to affected missions.
 *
 * Called: daily (after market ingest), or on-demand.
 * Trigger: pg_cron or manual.
 */
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/pipeline-horizon")({
  server: { handlers: { POST: handler, GET: handler } },
});

const GW = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function aiCall(system: string, prompt: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(GW, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    if (!res.ok) return "";
    const j: any = await res.json();
    return (j?.choices?.[0]?.message?.content ?? "").trim();
  } catch { return ""; }
}

async function aiClassify(system: string, prompt: string, apiKey: string): Promise<any> {
  try {
    const res = await fetch(GW, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    return JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
  } catch { return null; }
}

function mapSourceToCategory(source: string, categories: string[]): {
  horizon_category: string; source_type: string;
} {
  const s = source.toLowerCase();
  const c = (categories ?? []).join(" ").toLowerCase();

  if (s.includes("federal register") || s.includes("cms") || s.includes("hhs")) {
    return { horizon_category: "Federal Signal", source_type: "federal" };
  }
  if (s.includes("congress") || c.includes("congress") || c.includes("legislat")) {
    return { horizon_category: "Federal Signal", source_type: "policy" };
  }
  if (c.includes("procure") || c.includes("rfp") || c.includes("award") || c.includes("contract")) {
    return { horizon_category: "Procurement Signal", source_type: "procurement" };
  }
  if (c.includes("mco") || c.includes("health plan") || c.includes("acquisition") || c.includes("merger")) {
    return { horizon_category: "Market Signal", source_type: "market" };
  }
  return { horizon_category: "State Signal", source_type: "state" };
}

async function handler() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const apiKey = process.env.LOVABLE_API_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Missing env" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Pull market_intelligence items from last 48h not yet in pipeline_horizon
  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const { data: items } = await supabase
    .from("market_intelligence")
    .select("id,title,summary,source,url,relevant_states,relevant_categories,published_at,ingested_at")
    .gte("ingested_at", since)
    .order("ingested_at", { ascending: false })
    .limit(30);

  // Already promoted IDs
  const { data: existing } = await supabase
    .from("pipeline_horizon")
    .select("market_intelligence_id")
    .not("market_intelligence_id", "is", null);
  const existingIds = new Set((existing ?? []).map((e: any) => e.market_intelligence_id));

  // Get active engagements for mission matching
  const { data: engagements } = await supabase
    .from("engagements")
    .select("id,name,client,state,market")
    .eq("status", "Active");
  const activeEngagements = (engagements ?? []) as any[];

  let promoted = 0;

  for (const item of (items ?? []) as any[]) {
    if (existingIds.has(item.id)) continue;
    if (!item.title || !item.summary) continue;

    // IRIS classification
    const classSystem = `You are IRIS, the market intelligence officer for Athena Command.
Classify this intelligence item for a healthcare consulting firm's Pipeline Horizon.

Determine:
1. Is this genuinely relevant to healthcare proposals, Medicaid managed care, or federal health policy? If no → skip (return relevance < 0.3)
2. Classify as: signal (something changed), alert (time-sensitive action needed), insight (strategic significance), recommendation (clear action to consider)
3. Score strategic relevance (0-1), urgency (0-1)
4. Identify affected states, programs, competitors

Return ONLY JSON:
{
  "relevant": true,
  "iris_type": "signal",
  "iris_headline": "One-line IRIS interpretation (not a news headline — what it means for Athena)",
  "iris_detail": "2-3 sentences on strategic significance",
  "iris_action": "Specific recommended action or null",
  "strategic_relevance": 0.7,
  "urgency_score": 0.5,
  "affected_programs": ["LTSS","Care Management"],
  "affected_competitors": [],
  "horizon_skip": false
}`;

    const classPrompt = `Title: ${item.title}\nSource: ${item.source}\nStates: ${(item.relevant_states ?? []).join(", ")}\nCategories: ${(item.relevant_categories ?? []).join(", ")}\nSummary: ${(item.summary ?? "").slice(0, 600)}`;

    const cls = await aiClassify(classSystem, classPrompt, apiKey);
    if (!cls || !cls.relevant || cls.horizon_skip || (cls.strategic_relevance ?? 0) < 0.35) continue;

    const { horizon_category, source_type } = mapSourceToCategory(item.source, item.relevant_categories ?? []);

    // Insert into pipeline_horizon
    const { data: ph, error } = await supabase.from("pipeline_horizon").insert({
      title: item.title,
      summary: item.summary,
      source: item.source,
      source_url: item.url,
      source_type,
      horizon_category,
      published_at: item.published_at,
      iris_type: cls.iris_type ?? "signal",
      iris_headline: cls.iris_headline,
      iris_detail: cls.iris_detail,
      iris_action: cls.iris_action,
      iris_processed_at: new Date().toISOString(),
      strategic_relevance: cls.strategic_relevance ?? 0.5,
      urgency_score: cls.urgency_score ?? 0.5,
      confidence_score: 0.75,
      affected_states: item.relevant_states ?? [],
      affected_programs: cls.affected_programs ?? [],
      affected_competitors: cls.affected_competitors ?? [],
      market_intelligence_id: item.id,
      is_mission_specific: (item.relevant_states ?? []).length === 1, // single-state = mission specific
    }).select("id").single();

    if (error || !ph) { await new Promise(r => setTimeout(r, 100)); continue; }

    promoted++;

    // Link to affected missions
    for (const eng of activeEngagements) {
      const stateMatch = (item.relevant_states ?? []).includes(eng.state ?? "");
      const programMatch = (cls.affected_programs ?? []).some((p: string) =>
        (eng.market ?? "").toLowerCase().includes(p.toLowerCase())
      );
      if (stateMatch || programMatch) {
        const score = stateMatch && programMatch ? 0.9 : stateMatch ? 0.75 : 0.6;
        const reason = stateMatch ? `Relevant to ${eng.state} operations` : `Program area match`;
        await supabase.from("pipeline_horizon_missions").upsert({
          horizon_id: ph.id, engagement_id: eng.id, match_score: score, match_reason: reason,
        }, { onConflict: "horizon_id,engagement_id" });
      }
    }

    await new Promise(r => setTimeout(r, 200)); // rate limit
  }

  return Response.json({ ok: true, promoted, processed: (items ?? []).length });
}
