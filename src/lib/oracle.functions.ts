// Oracle / Mission Intelligence Graph server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

async function callAI(system: string, user: string, jsonMode = false): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured.");
  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        ...(jsonMode ? {} : {}),
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

const VALID_NODE_TYPES = [
  "requirement", "evaluator", "stakeholder", "policy", "competitor",
  "research", "win_theme", "risk", "internal_knowledge",
] as const;

type BuildGraphResult = { created: number; edges: number; completeness: number };

/* -------------------- Build Intelligence Graph -------------------- */
export const buildIntelligenceGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    force: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<BuildGraphResult> => {
    const { supabase } = context;
    const missionId = data.missionId;

    // Catch-up: if territory is configured but never seeded, seed now.
    // Idempotent — seedTerritoryForMission short-circuits when already seeded.
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (apiKey) {
        const { seedTerritoryForMission } = await import("@/lib/iris-territory.server");
        await seedTerritoryForMission(missionId, supabase as never, apiKey);
      }
    } catch (e) {
      console.error("[buildIntelligenceGraph] territory seed skipped:", e);
    }

    if (!data.force) {
      const { count } = await supabase
        .from("intelligence_graph_nodes")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      if ((count ?? 0) > 0) {
        const pct = Math.min(100, Math.round(((count ?? 0) / 40) * 100));
        return { created: 0, edges: 0, completeness: pct };
      }
    }


    // Gather mission context
    const [m, docs, comps, stakes, win, sections, qs] = await Promise.all([
      supabase.from("missions").select("name,client_name,state,agency_name,program_type").eq("id", missionId).single(),
      supabase.from("mission_documents").select("title,document_type").eq("mission_id", missionId).limit(40),
      supabase.from("competitor_profiles").select("organization_name,competitor_type,likely_narrative").eq("mission_id", missionId),
      supabase.from("stakeholder_profiles").select("name,title,organization,stakeholder_type").eq("mission_id", missionId),
      supabase.from("mission_win_strategy").select("north_star_message,central_claim").eq("mission_id", missionId).maybeSingle(),
      supabase.from("mission_sections").select("name").eq("mission_id", missionId).limit(40),
      supabase.from("mission_questions").select("question_text").eq("mission_id", missionId).limit(20),
    ]);

    const mission = m.data;
    if (!mission) throw new Error("Mission not found.");

    const ctx = {
      mission_name: mission.name,
      client: mission.client_name,
      state: mission.state ?? "Unknown",
      agency: mission.agency_name ?? "Unknown",
      program: mission.program_type ?? "Unknown",
      central_claim: win.data?.central_claim ?? "",
      north_star: win.data?.north_star_message ?? "",
      sections: (sections.data ?? []).map((s) => s.name).slice(0, 30),
      competitors: (comps.data ?? []).map((c) => `${c.organization_name} (${c.competitor_type})`),
      stakeholders: (stakes.data ?? []).map((s) => `${s.name} - ${s.title ?? ""} @ ${s.organization ?? ""}`),
      docs: (docs.data ?? []).map((d) => `${d.title} [${d.document_type}]`).slice(0, 20),
      sample_questions: (qs.data ?? []).map((q) => q.question_text?.slice(0, 80)).filter(Boolean).slice(0, 10),
    };

    const system = `You are IRIS building an intelligence graph for a Medicaid procurement.
Identify key nodes and relationships. Return ONLY valid JSON with this exact shape:
{ "nodes": [{"node_type": string, "label": string, "description": string, "confidence": string, "source": string}],
  "edges": [{"source_label": string, "target_label": string, "relationship_type": string, "relationship_description": string, "strength": number, "is_confirmed": boolean}] }
node_type MUST be one of: requirement, evaluator, stakeholder, policy, competitor, research, win_theme, risk, internal_knowledge.
confidence MUST be one of: high, medium, low.
Create between 20 and 60 nodes and 30 and 100 edges. strength is 1-10.`;

    const user = `Mission context:\n${JSON.stringify(ctx, null, 2)}`;

    let parsed: { nodes?: Array<Record<string, string>>; edges?: Array<Record<string, unknown>> } | null = null;
    try {
      const text = await callAI(system, user, true);
      parsed = extractJson(text);
    } catch (err) {
      console.error("buildIntelligenceGraph AI failed", err);
    }

    if (!parsed || !parsed.nodes?.length) {
      return { created: 0, edges: 0, completeness: 0 };
    }

    // Insert nodes
    const validNodes = parsed.nodes
      .filter((n) => n.label && VALID_NODE_TYPES.includes(n.node_type as (typeof VALID_NODE_TYPES)[number]))
      .slice(0, 60);
    const nodeRows = validNodes.map((n) => ({
      mission_id: missionId,
      node_type: n.node_type,
      label: String(n.label).slice(0, 200),
      description: n.description ?? null,
      confidence_level: ["high", "medium", "low"].includes(n.confidence) ? n.confidence : "medium",
      source: n.source ?? "IRIS Inference",
      is_active: true,
    }));
    const { data: insertedNodes, error: insErr } = await supabase
      .from("intelligence_graph_nodes")
      .insert(nodeRows)
      .select("id,label");
    if (insErr || !insertedNodes) {
      console.error("Node insert failed", insErr);
      return { created: 0, edges: 0, completeness: 0 };
    }

    const byLabel = new Map(insertedNodes.map((n) => [n.label, n.id]));
    const edgeRows = (parsed.edges ?? [])
      .map((e) => {
        const src = byLabel.get(String(e.source_label));
        const tgt = byLabel.get(String(e.target_label));
        if (!src || !tgt || src === tgt) return null;
        const strength = Math.max(1, Math.min(10, Number(e.strength) || 5));
        return {
          mission_id: missionId,
          source_node_id: src,
          target_node_id: tgt,
          relationship_type: String(e.relationship_type ?? "related_to").slice(0, 80),
          relationship_description: typeof e.relationship_description === "string" ? e.relationship_description : null,
          strength,
          is_confirmed: e.is_confirmed === true,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, 120);

    let edgeCount = 0;
    if (edgeRows.length) {
      const { data: ins } = await supabase.from("intelligence_graph_edges").insert(edgeRows).select("id");
      edgeCount = ins?.length ?? 0;
    }

    const completeness = Math.min(100, Math.round((insertedNodes.length / 40) * 100));
    await supabase.from("missions").update({ intelligence_graph_completeness: completeness }).eq("id", missionId);

    return { created: insertedNodes.length, edges: edgeCount, completeness };
  });

/* -------------------- Brief Me -------------------- */
export const generateMissionBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ brief: string }> => {
    const { supabase } = context;
    const missionId = data.missionId;

    const [m, comps, feed, win, evo] = await Promise.all([
      supabase.from("missions").select("name,client_name,state,program_type,submission_deadline,status").eq("id", missionId).single(),
      supabase.from("competitor_profiles").select("organization_name,competitor_type").eq("mission_id", missionId),
      supabase.from("intelligence_feed_items").select("headline,iris_relevance_score,category").eq("mission_id", missionId).eq("is_dismissed", false).order("iris_relevance_score", { ascending: false }).limit(5),
      supabase.from("mission_win_strategy").select("north_star_message").eq("mission_id", missionId).maybeSingle(),
      supabase.from("procurement_evolution_records").select("iris_signals").eq("mission_id", missionId).maybeSingle(),
    ]);
    const mission = m.data;
    if (!mission) throw new Error("Mission not found.");

    const days = mission.submission_deadline
      ? Math.max(0, Math.ceil((new Date(mission.submission_deadline).getTime() - Date.now()) / 86400000))
      : null;

    const system = `You are IRIS, the AI co-pilot for the ATLAS platform. Deliver a concise mission intelligence brief for a senior consultant. Be direct, strategic, and specific. No filler. Use plain text with clear section headers exactly as labeled below.

Deliver a brief in this exact structure:
MISSION STATUS
TOP INTELLIGENCE
COMPETITIVE SITUATION
DO TODAY
IRIS IS WATCHING`;

    const ctx = `Mission: ${mission.name}
Client: ${mission.client_name}
State: ${mission.state ?? "—"}
Program: ${mission.program_type ?? "—"}
Days to submission: ${days ?? "—"}
Status: ${mission.status}
North Star: ${win.data?.north_star_message ?? "—"}
Procurement evolution signals: ${evo.data?.iris_signals ?? "—"}
Top feed items: ${(feed.data ?? []).map((f) => `[${f.category} ${f.iris_relevance_score}] ${f.headline}`).join(" | ") || "none"}
Competitors: ${(comps.data ?? []).map((c) => `${c.organization_name} (${c.competitor_type})`).join(", ") || "none identified"}`;

    try {
      const brief = await callAI(system, ctx, false);
      return { brief };
    } catch (e) {
      return {
        brief: `MISSION STATUS\nUnable to generate live brief. (${(e as Error).message})\n\nTOP INTELLIGENCE\n${(feed.data ?? []).slice(0, 3).map((f) => `- ${f.headline}`).join("\n") || "No items yet."}\n\nCOMPETITIVE SITUATION\n${(comps.data ?? []).length} competitor(s) tracked.\n\nDO TODAY\nReview your intelligence feed.\n\nIRIS IS WATCHING\nReconnect when AI is available.`,
      };
    }
  });

/* -------------------- Competitive landscape summary -------------------- */
export const generateCompetitiveLandscape = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ summary: string }> => {
    const { supabase } = context;
    const [m, comps] = await Promise.all([
      supabase.from("missions").select("name,client_name,state,program_type").eq("id", data.missionId).single(),
      supabase.from("competitor_profiles").select("organization_name,competitor_type,likely_narrative,known_strengths,known_weaknesses").eq("mission_id", data.missionId),
    ]);
    if (!m.data) throw new Error("Mission not found");
    if ((comps.data ?? []).length < 2) return { summary: "" };

    const system = "You are IRIS. In 2-3 sentences, summarize the competitive landscape and Athena's best differentiation opportunity. Be direct.";
    const user = `Mission: ${m.data.name} (${m.data.state}, ${m.data.program_type})\nClient: ${m.data.client_name}\nCompetitors:\n${(comps.data ?? []).map((c) => `- ${c.organization_name} (${c.competitor_type}). ${c.likely_narrative ?? ""} Strengths: ${c.known_strengths ?? "?"}. Weaknesses: ${c.known_weaknesses ?? "?"}.`).join("\n")}`;
    try {
      const summary = await callAI(system, user, false);
      return { summary };
    } catch {
      return { summary: "" };
    }
  });

/* -------------------- Stakeholder enrich -------------------- */
export const enrichStakeholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ stakeholderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    const { data: s } = await supabase.from("stakeholder_profiles").select("*").eq("id", data.stakeholderId).single();
    if (!s) throw new Error("Stakeholder not found");
    const system = "You are IRIS. Given a stakeholder, infer likely public priorities and known concerns based on their role. Return ONLY valid JSON: {\"public_priorities\": string, \"known_concerns\": string}. Keep each under 400 chars.";
    const user = `Name: ${s.name}\nTitle: ${s.title ?? "?"}\nOrganization: ${s.organization ?? "?"}\nType: ${s.stakeholder_type}\nSub-type: ${s.sub_type ?? "?"}`;
    try {
      const text = await callAI(system, user, true);
      const parsed = extractJson<{ public_priorities?: string; known_concerns?: string }>(text);
      if (parsed) {
        await supabase.from("stakeholder_profiles").update({
          public_priorities: s.public_priorities || parsed.public_priorities || null,
          known_concerns: s.known_concerns || parsed.known_concerns || null,
          iris_confidence: "medium",
        }).eq("id", data.stakeholderId);
      }
    } catch (e) {
      console.error("enrichStakeholder failed", e);
    }

    // Create graph node if missing
    if (!s.graph_node_id) {
      const { data: node } = await supabase.from("intelligence_graph_nodes").insert({
        mission_id: s.mission_id,
        node_type: s.stakeholder_type === "evaluator" ? "evaluator" : "stakeholder",
        label: s.name,
        description: `${s.title ?? ""} @ ${s.organization ?? ""}`.trim(),
        confidence_level: "medium",
        source: "Manual entry",
      }).select("id").single();
      if (node) await supabase.from("stakeholder_profiles").update({ graph_node_id: node.id }).eq("id", data.stakeholderId);
    }
    return { ok: true };
  });

/* -------------------- Regenerate competitor profile -------------------- */
export const regenerateCompetitorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ competitorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    const { data: c } = await supabase.from("competitor_profiles").select("*").eq("id", data.competitorId).single();
    if (!c) throw new Error("Competitor not found");
    const { data: m } = await supabase.from("missions").select("name,state,program_type,client_name").eq("id", c.mission_id).single();
    const system = "You are IRIS analyzing a Medicaid procurement competitor. Return ONLY valid JSON with: {\"likely_narrative\": string, \"known_strengths\": string, \"known_weaknesses\": string, \"differentiation_strategy\": string, \"vulnerability_flags\": string[]}. Each text field under 400 chars; up to 5 vulnerability flags.";
    const user = `Competitor: ${c.organization_name} (${c.competitor_type})\nMission: ${m?.name} for ${m?.client_name} (${m?.state}, ${m?.program_type})`;
    try {
      const text = await callAI(system, user, true);
      const parsed = extractJson<{
        likely_narrative?: string; known_strengths?: string; known_weaknesses?: string;
        differentiation_strategy?: string; vulnerability_flags?: string[];
      }>(text);
      if (parsed) {
        await supabase.from("competitor_profiles").update({
          likely_narrative: parsed.likely_narrative ?? c.likely_narrative,
          known_strengths: parsed.known_strengths ?? c.known_strengths,
          known_weaknesses: parsed.known_weaknesses ?? c.known_weaknesses,
          differentiation_strategy: parsed.differentiation_strategy ?? c.differentiation_strategy,
          vulnerability_flags: Array.isArray(parsed.vulnerability_flags) ? parsed.vulnerability_flags : c.vulnerability_flags,
          iris_confidence: "medium",
        }).eq("id", data.competitorId);
      }
    } catch (e) {
      console.error("regenerateCompetitorProfile failed", e);
    }
    return { ok: true };
  });

/* -------------------- Share feed item with team -------------------- */
export const shareFeedItemWithTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ feedItemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; recipients: number }> => {
    const { supabase, userId } = context;
    const { data: item } = await supabase.from("intelligence_feed_items").select("*").eq("id", data.feedItemId).single();
    if (!item) throw new Error("Item not found");
    const { data: team } = await supabase.from("mission_team_members").select("member_id").eq("mission_id", item.mission_id);
    const recipients = (team ?? []).map((t) => t.member_id).filter((u): u is string => !!u && u !== userId);
    if (recipients.length) {
      await supabase.from("atlas_notifications").insert(recipients.map((uid) => ({
        recipient_id: uid,
        recipient_role: "team_member",
        type: "intelligence_shared",
        message: `Intelligence: ${item.headline}`,
        metadata: { feed_item_id: item.id, source_url: item.source_url, mission_id: item.mission_id },
      })));
    }
    await supabase.from("intelligence_feed_items").update({ is_shared_with_team: true }).eq("id", data.feedItemId);
    return { ok: true, recipients: recipients.length };
  });
