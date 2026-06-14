// Cron: weekly Sunday 02:00 EST (Sun 07:00 UTC). Required env: CRON_HOOK_SECRET, LOVABLE_API_KEY.
import { createFileRoute } from "@tanstack/react-router";

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

function completenessFor(nodeCount: number): number {
  if (nodeCount < 10) return 10;
  if (nodeCount <= 25) return 25;
  if (nodeCount <= 50) return 40;
  if (nodeCount <= 100) return 60;
  if (nodeCount <= 150) return 75;
  if (nodeCount <= 200) return 85;
  return 95;
}

export const Route = createFileRoute("/api/public/hooks/refresh-intelligence-graph")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const { data: missions } = await supabaseAdmin
          .from("missions")
          .select("id,name")
          .eq("status", "active");

        const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        let totalNodesAdded = 0;
        const batch = (missions ?? []).slice(0, 10);

        for (const m of batch) {
          const missionId = (m as { id: string }).id;
          const missionName = (m as { name: string }).name;
          try {
            const { data: newItems } = await supabaseAdmin
              .from("intelligence_feed_items")
              .select("headline,iris_assessment,iris_relevance_score")
              .eq("mission_id", missionId)
              .eq("is_dismissed", false)
              .gte("created_at", sinceIso);

            const itemsCount = (newItems ?? []).length;
            let nodesAdded = 0;
            const requireAttention = (newItems ?? []).filter((i) => (i as { iris_relevance_score: number }).iris_relevance_score >= 70).length;

            if (itemsCount > 0) {
              const { data: existingNodes } = await supabaseAdmin
                .from("intelligence_graph_nodes")
                .select("id,label,node_type")
                .eq("mission_id", missionId);
              const existingLabels = new Set((existingNodes ?? []).map((n) => (n as { label: string }).label.toLowerCase()));

              const headlines = (newItems ?? []).slice(0, 25)
                .map((i) => `- ${(i as { headline: string }).headline}: ${(i as { iris_assessment: string | null }).iris_assessment ?? ""}`)
                .join("\n");
              const existingLabelList = Array.from(existingLabels).slice(0, 60).join(", ");

              const system = "You analyze new intelligence to extend a Mission Intelligence Graph. Return ONLY valid JSON: { new_nodes: [{node_type, label, description, confidence, source}], new_edges: [{source_label, target_label, relationship_type, relationship_description, strength}] }. node_type must be one of: requirement, evaluator, stakeholder, policy, competitor, research, win_theme, risk, internal_knowledge. confidence: high|medium|low. strength: 0-1. Do NOT propose nodes whose label (case-insensitive) already exists.";
              const user = `New intelligence items:\n${headlines}\n\nExisting nodes: ${existingLabelList}`;

              try {
                const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: "gpt-4o-mini"
                    max_tokens: 1500,
                    messages: [
                      { role: "system", content: system },
                      { role: "user", content: user },
                    ],
                  }),
                });
                if (r.ok) {
                  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
                  const content = j.choices?.[0]?.message?.content ?? "";
                  const match = content.match(/\{[\s\S]*\}/);
                  const suggestions = (match ? JSON.parse(match[0]) : {}) as AiSuggestion;

                  const labelToId = new Map<string, string>();
                  (existingNodes ?? []).forEach((n) => labelToId.set((n as { label: string }).label.toLowerCase(), (n as { id: string }).id));

                  for (const n of (suggestions.new_nodes ?? [])) {
                    const lab = (n.label ?? "").trim();
                    if (!lab || existingLabels.has(lab.toLowerCase())) continue;
                    const { data: inserted } = await supabaseAdmin
                      .from("intelligence_graph_nodes")
                      .insert({
                        mission_id: missionId,
                        node_type: n.node_type,
                        label: lab.slice(0, 200),
                        description: (n.description ?? "").slice(0, 800),
                        source: n.source ?? "iris_weekly_refresh",
                        confidence_level: ["high", "medium", "low"].includes(n.confidence ?? "") ? (n.confidence as string) : "medium",
                      })
                      .select("id")
                      .single();
                    if (inserted) {
                      labelToId.set(lab.toLowerCase(), (inserted as { id: string }).id);
                      existingLabels.add(lab.toLowerCase());
                      nodesAdded += 1;
                    }
                  }

                  for (const e of (suggestions.new_edges ?? [])) {
                    const src = labelToId.get((e.source_label ?? "").toLowerCase());
                    const tgt = labelToId.get((e.target_label ?? "").toLowerCase());
                    if (!src || !tgt || src === tgt) continue;
                    await supabaseAdmin.from("intelligence_graph_edges").insert({
                      mission_id: missionId,
                      source_node_id: src,
                      target_node_id: tgt,
                      relationship_type: e.relationship_type || "related",
                      relationship_description: e.relationship_description ?? null,
                      strength: typeof e.strength === "number" ? Math.max(0, Math.min(1, e.strength)) : 0.5,
                      is_confirmed: false,
                    });
                  }
                }
              } catch (err) {
                console.error("graph enrich AI call failed", err);
              }
            }

            // Recalc completeness
            const { count: totalNodes } = await supabaseAdmin
              .from("intelligence_graph_nodes")
              .select("id", { count: "exact", head: true })
              .eq("mission_id", missionId);
            await supabaseAdmin
              .from("missions")
              .update({ intelligence_graph_completeness: completenessFor(totalNodes ?? 0) })
              .eq("id", missionId);

            // Weekly summary notification
            const [admins, teams] = await Promise.all([
              supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
              supabaseAdmin.from("mission_team_members").select("member_id,mission_role").eq("mission_id", missionId),
            ]);
            const recipients = new Set<string>();
            (admins.data ?? []).forEach((r) => recipients.add((r as { user_id: string }).user_id));
            (teams.data ?? []).forEach((r) => {
              const role = (r as { mission_role: string | null }).mission_role ?? "";
              if (/engagement|lead|principal/i.test(role)) recipients.add((r as { member_id: string }).member_id);
            });
            const message = `Weekly Intelligence Summary for ${missionName}: ${itemsCount} new items surfaced, ${nodesAdded} graph nodes added, ${requireAttention} items require your attention.`;
            if (recipients.size) {
              await supabaseAdmin.from("atlas_notifications").insert(
                Array.from(recipients).map((id) => ({
                  type: "iris_weekly_summary",
                  recipient_id: id,
                  recipient_role: "user",
                  message,
                  metadata: { mission_id: missionId, new_items: itemsCount, nodes_added: nodesAdded },
                })),
              );
            }
            totalNodesAdded += nodesAdded;
          } catch (err) {
            console.error("refresh-intelligence-graph mission failed", missionId, err);
          }
        }

        const summary = `refresh-intelligence-graph: processed ${batch.length} missions, added ${totalNodesAdded} nodes total`;
        console.log(summary);
        return new Response(JSON.stringify({ ok: true, missions: batch.length, nodes_added: totalNodesAdded }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
