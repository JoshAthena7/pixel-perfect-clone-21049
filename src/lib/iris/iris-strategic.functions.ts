import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GW = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function aiClassify(system: string, prompt: string): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(GW, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    try { return JSON.parse(j?.choices?.[0]?.message?.content ?? "{}"); } catch { return null; }
  } catch { return null; }
}

const CLASSIFICATION_SYSTEM = `You are IRIS, mission intelligence officer for Athena Command, a healthcare proposal platform.

Classify this strategic intelligence item for a proposal engagement. Choose exactly one classification:
- no_action: Not relevant to this engagement
- monitor: Potentially relevant, watch for developments  
- signal: Something changed the team should know about
- insight: Important intelligence affecting strategy or proposal positioning
- recommendation: Specific action recommended for leadership or team
- alert: Time-sensitive development needing attention within 48 hours
- escalation: Critical, requires leadership decision within 24 hours

Return ONLY valid JSON:
{
  "classification": "signal",
  "why_it_matters": "One sentence: why this matters for the proposal",
  "iris_interpretation": "2-3 sentences on strategic impact from IRIS perspective",
  "recommended_action": "One specific action (only for recommendation/alert/escalation, else null)",
  "urgency_score": 0.6,
  "confidence_score": 0.75,
  "strategic_relevance": 0.8,
  "affected_workstream": "Care Management or null",
  "affected_agency": "Agency name or null"
}`;

export const readStrategicIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    engagementId: z.string().uuid(),
    forceRefresh: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const eid = data.engagementId;

    const { data: eng } = await supabase
      .from("engagements").select("id,name,client,state,market,submission_date")
      .eq("id", eid).single();
    if (!eng) return { signals: [], count: 0, newlyClassified: 0 };

    const e = eng as any;
    const days = e.submission_date
      ? Math.ceil((new Date(e.submission_date).getTime() - Date.now()) / 86400000) : null;
    const engCtx = `Engagement: ${e.name} | Client: ${e.client} | State: ${e.state ?? "unknown"} | Market: ${e.market ?? "Medicaid managed care"} | Days to submission: ${days ?? "unknown"}`;

    // Existing classified signals to skip re-processing
    const { data: existing } = await supabase
      .from("mission_strategic_signals")
      .select("source_id,source_table")
      .eq("engagement_id", eid);
    const existingKeys = new Set((existing ?? []).map((x: any) => `${x.source_table}:${x.source_id}`));

    const newSignals: any[] = [];
    const since = new Date(Date.now() - 14 * 86400000).toISOString();

    // --- Market intelligence (by state match) ---
    let mQuery = supabase.from("market_intelligence")
      .select("id,title,summary,url,source,relevant_states,relevant_categories,published_at,ingested_at")
      .gte("ingested_at", since).order("ingested_at", { ascending: false }).limit(25);
    if (e.state) mQuery = mQuery.contains("relevant_states", [e.state]);
    const { data: mItems } = await mQuery;

    for (const item of (mItems ?? []) as any[]) {
      if (!data.forceRefresh && existingKeys.has(`market_intelligence:${item.id}`)) continue;
      const result = await aiClassify(CLASSIFICATION_SYSTEM,
        `${engCtx}\n\nIntelligence:\nTitle: ${item.title}\nSource: ${item.source}\nPublished: ${item.published_at ?? "unknown"}\nStates: ${(item.relevant_states ?? []).join(", ")}\nCategories: ${(item.relevant_categories ?? []).join(", ")}\nSummary: ${(item.summary ?? "").slice(0, 600)}`
      );
      if (!result || result.classification === "no_action") continue;
      newSignals.push({
        engagement_id: eid, source_table: "market_intelligence", source_id: item.id,
        source_name: item.source, source_url: item.url, published_at: item.published_at,
        title: item.title, summary: (item.summary ?? "").slice(0, 500),
        classification: result.classification ?? "signal",
        why_it_matters: result.why_it_matters, iris_interpretation: result.iris_interpretation,
        recommended_action: result.recommended_action,
        urgency_score: result.urgency_score ?? 0.5, confidence_score: result.confidence_score ?? 0.6,
        strategic_relevance: result.strategic_relevance ?? 0.5,
        affected_states: item.relevant_states, affected_categories: item.relevant_categories,
        affected_workstream: result.affected_workstream, affected_agency: result.affected_agency,
        status: "open",
      });
      await new Promise(r => setTimeout(r, 120));
    }

    // --- Holy Grail engagement_research ---
    const { data: research } = await supabase
      .from("engagement_research").select("id,category,title,content,confidence_score,source,updated_at")
      .eq("engagement_id", eid).not("content", "is", null).order("updated_at", { ascending: false });

    for (const res of (research ?? []) as any[]) {
      if (!data.forceRefresh && existingKeys.has(`engagement_research:${res.id}`)) continue;
      if (!res.content || !Object.keys(res.content).length) continue;
      const summary = Object.entries(res.content).slice(0, 4)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 180)}`).join("\n");
      const result = await aiClassify(CLASSIFICATION_SYSTEM,
        `${engCtx}\n\nResearch Category: ${res.category}\nSource: ${res.source ?? "Athena Research"}\nKey findings:\n${summary}`
      );
      if (!result || result.classification === "no_action") continue;
      newSignals.push({
        engagement_id: eid, source_table: "engagement_research", source_id: res.id,
        source_name: `Athena Research — ${res.category}`, source_url: null, published_at: res.updated_at,
        title: res.title ?? `${res.category} Intelligence`, summary,
        classification: result.classification ?? "insight",
        why_it_matters: result.why_it_matters, iris_interpretation: result.iris_interpretation,
        recommended_action: result.recommended_action,
        urgency_score: result.urgency_score ?? 0.4, confidence_score: res.confidence_score ?? 0.6,
        strategic_relevance: result.strategic_relevance ?? 0.7,
        affected_states: e.state ? [e.state] : [], affected_categories: [res.category],
        affected_workstream: result.affected_workstream, affected_agency: result.affected_agency,
        status: "open",
      });
      await new Promise(r => setTimeout(r, 120));
    }

    // Upsert new signals
    if (newSignals.length > 0) {
      await supabase.from("mission_strategic_signals")
        .upsert(newSignals, { onConflict: "engagement_id,source_table,source_id" });
    }

    // Return all current signals ranked by urgency
    const { data: allSignals } = await supabase
      .from("mission_strategic_signals").select("*")
      .eq("engagement_id", eid).neq("status", "dismissed")
      .order("urgency_score", { ascending: false })
      .order("detected_at", { ascending: false })
      .limit(data.limit);

    return { signals: allSignals ?? [], count: (allSignals ?? []).length, newlyClassified: newSignals.length };
  });

export const getStoredStrategicSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    engagementId: z.string().uuid(),
    minClassification: z.enum(["monitor","signal","insight","recommendation","alert","escalation"]).default("signal"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const RANK: Record<string, number> = { escalation:7, alert:6, recommendation:5, insight:4, signal:3, monitor:2, no_action:1 };
    const minRank = RANK[data.minClassification] ?? 3;
    const { data: signals } = await supabase
      .from("mission_strategic_signals").select("*")
      .eq("engagement_id", data.engagementId).neq("status", "dismissed")
      .order("urgency_score", { ascending: false }).limit(20);
    return { signals: (signals ?? []).filter((s: any) => (RANK[s.classification] ?? 0) >= minRank) };
  });

export const updateStrategicSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    signalId: z.string().uuid(),
    status: z.enum(["acknowledged","resolved","dismissed"]),
    owner: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const update: any = { status: data.status, last_updated_at: new Date().toISOString() };
    if (data.status === "acknowledged") update.acknowledged_at = new Date().toISOString();
    if (data.status === "resolved") update.resolved_at = new Date().toISOString();
    if (data.owner) update.owner = data.owner;
    const { error } = await supabase.from("mission_strategic_signals").update(update).eq("id", data.signalId);
    return { ok: !error };
  });
