import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GW = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(system: string, prompt: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch(GW, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    });
    if (!res.ok) return "";
    const j: any = await res.json();
    return (j?.choices?.[0]?.message?.content ?? "").trim();
  } catch { return ""; }
}

// ── Mission Brief (includes strategic intelligence) ───────────────
export const generateIrisMissionBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ engagementId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const eid = data.engagementId;

    const [eng, signals, risks, decisions, sos, strategic] = await Promise.all([
      supabase.from("engagements").select("name,client,submission_date,health").eq("id",eid).single(),
      supabase.from("huddles").select("health,priority,risk,leadership_needed,submitter_name,created_at")
        .eq("engagement_id",eid).order("created_at",{ascending:false}).limit(5),
      supabase.from("risks").select("title,severity,status,owner_name")
        .eq("engagement_id",eid).in("status",["Open","Monitoring"]),
      supabase.from("decisions").select("title,status")
        .eq("engagement_id",eid).order("created_at",{ascending:false}).limit(5),
      supabase.from("sos_alerts").select("severity,description,status")
        .eq("engagement_id",eid).neq("status","Resolved"),
      // Strategic intelligence — the new layer
      supabase.from("mission_strategic_signals")
        .select("classification,title,why_it_matters,recommended_action,source_name,urgency_score,detected_at")
        .eq("engagement_id",eid).neq("status","dismissed")
        .in("classification",["escalation","alert","recommendation","insight","signal"])
        .order("urgency_score",{ascending:false}).limit(5),
    ]);

    const mission = eng.data as any;
    if (!mission) return { brief: "", generatedAt: new Date().toISOString() };
    const days = mission.submission_date
      ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000) : null;

    const strategicItems = (strategic.data ?? []) as any[];
    const hasStrategic = strategicItems.length > 0;

    const ctx = JSON.stringify({
      mission: { name: mission.name, client: mission.client, health: mission.health, daysToSubmission: days },
      recentSignals: signals.data ?? [],
      openRisks: risks.data ?? [],
      recentDecisions: decisions.data ?? [],
      activeSOS: sos.data ?? [],
      strategicIntelligence: strategicItems.map(s => ({
        classification: s.classification,
        headline: s.title,
        whyItMatters: s.why_it_matters,
        action: s.recommended_action,
        source: s.source_name,
      })),
    });

    const brief = await callAI(
      `You are IRIS, mission intelligence officer for Athena Command. Generate a mission brief for the engagement lead.
Rules: short paragraphs not bullets, lead with the most important thing${hasStrategic ? " including any strategic intelligence developments" : ""}, end with 2-3 recommended focus areas labeled 'Recommended focus:', tone is calm professional chief-of-staff, 150-220 words max, never say 'based on the data provided'. If strategic intelligence is present, weave it into the brief as context naturally.`,
      `Mission data:\n${ctx}`
    );
    return { brief, generatedAt: new Date().toISOString() };
  });

// ── Executive Brief (portfolio-level + strategic intel) ───────────
export const generateIrisExecutiveBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userName: z.string().optional() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase.from("engagement_members")
      .select("engagement_id,role").eq("user_id", userId)
      .in("role", ["founder","lead","pm","engagement_lead","exec"]);
    if (!memberships?.length) return { brief: "", generatedAt: new Date().toISOString() };

    const ids = memberships.map((m: any) => m.engagement_id);
    const since48h = new Date(Date.now() - 48 * 3600000).toISOString();
    const [engs, signals, risks, sos, strategic, horizon] = await Promise.all([
      supabase.from("engagements").select("id,name,client,health,submission_date").in("id",ids).eq("status","Active"),
      supabase.from("huddles").select("engagement_id,health,leadership_needed").in("engagement_id",ids).order("created_at",{ascending:false}).limit(ids.length*2),
      supabase.from("risks").select("engagement_id").in("engagement_id",ids).in("status",["Open","Monitoring"]),
      supabase.from("sos_alerts").select("engagement_id").in("engagement_id",ids).neq("status","Resolved"),
      // Strategic intelligence across all missions
      supabase.from("mission_strategic_signals")
        .select("engagement_id,classification,title,why_it_matters,recommended_action,source_name,urgency_score")
        .in("engagement_id",ids).neq("status","dismissed")
        .in("classification",["escalation","alert","recommendation"])
        .order("urgency_score",{ascending:false}).limit(10),
      // Pipeline Horizon — new market intelligence for executive awareness
      supabase.from("pipeline_horizon")
        .select("title,horizon_category,iris_type,iris_headline,iris_action,urgency_score,affected_states")
        .eq("status","active")
        .gte("ingested_at", since48h)
        .order("urgency_score",{ascending:false}).limit(5),
    ]);

    const today = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
    const name = data.userName ?? "there";

    // Build engagement name map for strategic signals
    const engMap: Record<string, string> = {};
    (engs.data ?? []).forEach((e: any) => { engMap[e.id] = e.name; });

    const horizonItems = (horizon.data ?? []) as any[];
    const ctx = JSON.stringify({
      missions: (engs.data ?? []).map((e: any) => ({
        name: e.name, client: e.client, health: e.health,
        daysLeft: e.submission_date ? Math.ceil((new Date(e.submission_date).getTime()-Date.now())/86400000) : null,
        openRisks: (risks.data ?? []).filter((r: any) => r.engagement_id === e.id).length,
        activeSOS: (sos.data ?? []).filter((s: any) => s.engagement_id === e.id).length,
        leadershipSignals: (signals.data ?? []).filter((s: any) => s.engagement_id === e.id && s.leadership_needed).length,
      })),
      strategicIntelligence: (strategic.data ?? []).map((s: any) => ({
        mission: engMap[s.engagement_id] ?? "Unknown",
        classification: s.classification,
        headline: s.title,
        whyItMatters: s.why_it_matters,
        action: s.recommended_action,
        source: s.source_name,
      })),
      pipelineHorizon: horizonItems.map(h => ({
        category: h.horizon_category,
        irisType: h.iris_type,
        headline: h.iris_headline ?? h.title,
        action: h.iris_action,
        states: h.affected_states,
        urgency: h.urgency_score,
      })),
    });

    const brief = await callAI(
      `You are IRIS, executive intelligence officer for Athena Command. Write a morning brief for leadership.
Rules: open with 'Good morning, ${name}. Today is ${today}.', short paragraphs not bullets, synthesize across all missions, surface the most important Pipeline Horizon developments (CMS guidance, legislation, procurement signals, market signals) that warrant leadership awareness, end with 'Recommended focus today:' and 2-3 items, tone is trusted chief-of-staff, 160-280 words, never use bullets, never say 'based on the data'. Only include Pipeline Horizon items that are genuinely significant — do not include noise.`,
      `Portfolio and strategic intelligence:\n${ctx}`
    );
    return { brief, generatedAt: new Date().toISOString() };
  });
