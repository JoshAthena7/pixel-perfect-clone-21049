/**
 * ORACLE — densifyMissionGraphEdges
 *
 * Reads the current intelligence_graph_nodes + existing edges, identifies
 * unconnected node pairs, asks the AI to propose connections only between
 * pairs that are NOT already linked, then writes new edges.
 *
 * Goal: push edges-per-node from ~0.2 toward ~1.5+ so the graph is a graph
 * instead of a bag of disconnected nodes. Idempotent — re-runs only add
 * connections that don't yet exist.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({ mission_id: z.string().uuid() });

type EdgeSuggestion = {
  source_label: string;
  target_label: string;
  relationship_type: string;
  relationship_description?: string;
  strength?: number;
};

const SYSTEM = `You are ORACLE, densifying a Mission Intelligence Graph. You will see the existing nodes (with type + label + short description). Propose meaningful edges that connect related nodes. Return ONLY valid JSON, no preamble, no markdown fences.

{
  "new_edges": [
    { "source_label": "string", "target_label": "string", "relationship_type": "string (e.g. influences, supports, threatens, evaluates, requires, mitigates, competes_with, owns, partners_with, depends_on, contradicts)", "relationship_description": "string (one sentence)", "strength": 5 }
  ]
}

Rules:
- ONLY use labels from the provided node list (case-sensitive match preferred).
- DO NOT propose self-edges.
- DO NOT propose duplicate edges between the same source/target pair.
- strength is an integer 1-10. Confident, semantically meaningful edges only.
- Prefer edges that cross node_types (e.g. risk -> requirement, evaluator -> win_theme, competitor -> stakeholder).`;

function tryParseJSON<T>(s: string): T | null {
  const cleaned = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

export const densifyMissionGraphEdges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize
    const [{ data: isAdmin }, { data: teamRow }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase
        .from("mission_team_members")
        .select("member_id")
        .eq("mission_id", data.mission_id)
        .eq("member_id", userId)
        .maybeSingle(),
    ]);
    if (!isAdmin && !teamRow) throw new Error("Forbidden: not a member of this mission");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing on server");

    const { data: nodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("id, label, node_type, description")
      .eq("mission_id", data.mission_id)
      .eq("is_active", true)
      .limit(200);

    if (!nodes || nodes.length < 2) {
      return { ok: true, edgesAdded: 0, message: "Not enough nodes to densify." };
    }

    const labelToId = new Map<string, string>();
    for (const n of nodes) labelToId.set(n.label.toLowerCase(), n.id);

    const { data: existingEdges } = await supabase
      .from("intelligence_graph_edges")
      .select("source_node_id, target_node_id")
      .eq("mission_id", data.mission_id);
    const existingPairs = new Set(
      (existingEdges ?? []).flatMap((e) => [
        `${e.source_node_id}|${e.target_node_id}`,
        `${e.target_node_id}|${e.source_node_id}`,
      ]),
    );

    const nodeList = nodes
      .map((n) => `- [${n.node_type}] ${n.label}${n.description ? ` — ${n.description.slice(0, 120)}` : ""}`)
      .join("\n");

    const user = `Mission Intelligence Graph nodes (${nodes.length}):\n${nodeList}\n\nExisting edge count: ${existingEdges?.length ?? 0}. Propose new edges between related nodes that are not already connected.`;

    let parsed: { new_edges?: EdgeSuggestion[] } = {};
    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 3000,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (res.status === 402) throw new Error("Workspace is out of AI credits.");
    if (res.status === 429) throw new Error("ORACLE is rate limited. Try again shortly.");
    if (!res.ok) {
      console.error("[oracle-densify] gateway error", res.status);
      return { ok: false, edgesAdded: 0, message: "AI gateway error." };
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    parsed = tryParseJSON<{ new_edges?: EdgeSuggestion[] }>(content) ?? {};

    let edgesAdded = 0;
    const seenInBatch = new Set<string>();
    for (const e of parsed.new_edges ?? []) {
      const src = labelToId.get((e.source_label ?? "").toLowerCase());
      const tgt = labelToId.get((e.target_label ?? "").toLowerCase());
      if (!src || !tgt || src === tgt) continue;
      const pair = `${src}|${tgt}`;
      if (existingPairs.has(pair) || seenInBatch.has(pair) || seenInBatch.has(`${tgt}|${src}`)) continue;
      const strength = typeof e.strength === "number"
        ? Math.max(1, Math.min(10, Math.round(e.strength)))
        : 5;
      const { error } = await supabase.from("intelligence_graph_edges").insert({
        mission_id: data.mission_id,
        source_node_id: src,
        target_node_id: tgt,
        relationship_type: (e.relationship_type || "related").slice(0, 100),
        relationship_description: (e.relationship_description ?? "").slice(0, 500) || null,
        strength,
        is_confirmed: false,
      });
      if (!error) {
        edgesAdded++;
        seenInBatch.add(pair);
      }
    }

    return {
      ok: true,
      edgesAdded,
      totalNodes: nodes.length,
      message: edgesAdded === 0
        ? "ORACLE found no new connections to add."
        : `Added ${edgesAdded} new connection${edgesAdded === 1 ? "" : "s"}.`,
    };
  });
