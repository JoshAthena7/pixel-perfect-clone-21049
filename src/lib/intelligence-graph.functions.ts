import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * On-demand: refresh the Mission Intelligence Graph for one mission.
 * Mirrors the weekly cron hook in
 * src/routes/api/public/hooks/refresh-intelligence-graph.ts but scoped to
 * a single mission and callable from the UI.
 *
 * Authorization: caller must be (a) an admin, or (b) a member of the
 * mission's team. RLS would otherwise block writes via the user-scoped
 * client; the admin client bypasses RLS, so we re-check explicitly.
 */

type AiSuggestion = {
  new_nodes?: Array<{
    node_type: string;
    label: string;
    description?: string;
    confidence?: string;
    source?: string;
  }>;
  new_edges?: Array<{
    source_label: string;
    target_label: string;
    relationship_type: string;
    relationship_description?: string;
    strength?: number;
  }>;
};

const NODE_TYPES = new Set([
  "requirement",
  "evaluator",
  "stakeholder",
  "policy",
  "competitor",
  "research",
  "win_theme",
  "risk",
  "internal_knowledge",
]);

function completenessFor(nodeCount: number): number {
  if (nodeCount < 10) return 10;
  if (nodeCount <= 25) return 25;
  if (nodeCount <= 50) return 40;
  if (nodeCount <= 100) return 60;
  if (nodeCount <= 150) return 75;
  if (nodeCount <= 200) return 85;
  return 95;
}

export const refreshMissionGraph = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: admin OR mission team member.
    const [{ data: isAdmin }, { data: teamRow }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase
        .from("mission_team_members")
        .select("member_id")
        .eq("mission_id", data.missionId)
        .eq("member_id", userId)
        .maybeSingle(),
    ]);
    if (!isAdmin && !teamRow) {
      throw new Error("Forbidden: you are not a member of this mission");
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing on server");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mission } = await supabaseAdmin
      .from("missions")
      .select("id,name")
      .eq("id", data.missionId)
      .maybeSingle();
    if (!mission) throw new Error("Mission not found");

    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: newItems } = await supabaseAdmin
      .from("intelligence_feed_items")
      .select("headline,iris_assessment,iris_relevance_score")
      .eq("mission_id", data.missionId)
      .eq("is_dismissed", false)
      .gte("created_at", sinceIso);

    const items = newItems ?? [];

    if (items.length === 0) {
      return {
        ok: true,
        nodesAdded: 0,
        edgesAdded: 0,
        message: "No new intelligence in the last 30 days — nothing to extract.",
      };
    }

    const { data: existingNodes } = await supabaseAdmin
      .from("intelligence_graph_nodes")
      .select("id,label,node_type")
      .eq("mission_id", data.missionId);
    const existingLabels = new Set(
      (existingNodes ?? []).map((n: any) => String(n.label).toLowerCase()),
    );
    const labelToId = new Map<string, string>();
    (existingNodes ?? []).forEach((n: any) =>
      labelToId.set(String(n.label).toLowerCase(), n.id),
    );

    const headlines = items
      .slice(0, 40)
      .map(
        (i: any) =>
          `- ${i.headline}: ${i.iris_assessment ?? ""}`,
      )
      .join("\n");
    const existingLabelList = Array.from(existingLabels).slice(0, 80).join(", ");

    const system =
      "You analyze new intelligence to extend a Mission Intelligence Graph. Return ONLY valid JSON: { new_nodes: [{node_type, label, description, confidence, source}], new_edges: [{source_label, target_label, relationship_type, relationship_description, strength}] }. node_type must be one of: requirement, evaluator, stakeholder, policy, competitor, research, win_theme, risk, internal_knowledge. confidence: high|medium|low. strength: 0-1. Do NOT propose nodes whose label (case-insensitive) already exists. Prefer creating edges between new nodes and existing ones.";
    const user = `Mission: ${mission.name}\n\nNew intelligence items:\n${headlines}\n\nExisting nodes: ${existingLabelList}`;

    let suggestions: AiSuggestion = {};
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 2000,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`AI gateway ${r.status}: ${body.slice(0, 200)}`);
      }
      const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = j.choices?.[0]?.message?.content ?? "";
      const match = content.match(/\{[\s\S]*\}/);
      if (match) suggestions = JSON.parse(match[0]);
    } catch (err: any) {
      throw new Error(`Graph enrichment failed: ${err?.message ?? String(err)}`);
    }

    let nodesAdded = 0;
    for (const n of suggestions.new_nodes ?? []) {
      const lab = (n.label ?? "").trim();
      if (!lab || existingLabels.has(lab.toLowerCase())) continue;
      const nodeType = NODE_TYPES.has(n.node_type) ? n.node_type : "internal_knowledge";
      const { data: inserted } = await supabaseAdmin
        .from("intelligence_graph_nodes")
        .insert({
          mission_id: data.missionId,
          node_type: nodeType,
          label: lab.slice(0, 200),
          description: (n.description ?? "").slice(0, 800),
          source: n.source ?? "iris_on_demand_refresh",
          confidence_level: ["high", "medium", "low"].includes(n.confidence ?? "")
            ? (n.confidence as string)
            : "medium",
        })
        .select("id")
        .single();
      if (inserted) {
        labelToId.set(lab.toLowerCase(), (inserted as any).id);
        existingLabels.add(lab.toLowerCase());
        nodesAdded += 1;
      }
    }

    let edgesAdded = 0;
    for (const e of suggestions.new_edges ?? []) {
      const src = labelToId.get((e.source_label ?? "").toLowerCase());
      const tgt = labelToId.get((e.target_label ?? "").toLowerCase());
      if (!src || !tgt || src === tgt) continue;
      const { error } = await supabaseAdmin.from("intelligence_graph_edges").insert({
        mission_id: data.missionId,
        source_node_id: src,
        target_node_id: tgt,
        relationship_type: e.relationship_type || "related",
        relationship_description: e.relationship_description ?? null,
        strength: typeof e.strength === "number" ? Math.max(0, Math.min(1, e.strength)) : 0.5,
        is_confirmed: false,
      });
      if (!error) edgesAdded += 1;
    }

    const { count: totalNodes } = await supabaseAdmin
      .from("intelligence_graph_nodes")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", data.missionId);

    await supabaseAdmin
      .from("missions")
      .update({ intelligence_graph_completeness: completenessFor(totalNodes ?? 0) })
      .eq("id", data.missionId);

    return {
      ok: true,
      nodesAdded,
      edgesAdded,
      totalNodes: totalNodes ?? 0,
      message:
        nodesAdded === 0 && edgesAdded === 0
          ? "IRIS reviewed recent intelligence but didn't find anything new to add."
          : `Added ${nodesAdded} node${nodesAdded === 1 ? "" : "s"} and ${edgesAdded} connection${edgesAdded === 1 ? "" : "s"}.`,
    };
  });
