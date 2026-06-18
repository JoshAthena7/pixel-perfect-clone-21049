import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Graph Health Dashboard — diagnostic queries + AI-assisted edge creation
 * for the Mission Intelligence Graph (intelligence_graph_nodes / _edges).
 *
 * Admin-only: every handler checks has_role(_, 'admin').
 */

async function requireAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

const EVIDENCE_TYPES = ["research", "win_theme", "internal_knowledge"] as const;

// ─── Stats: nodes, edges, density, last refresh ─────────────────────────
export const getGraphHealthStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const [nodesRes, edgesRes, lastRes] = await Promise.all([
      supabase
        .from("intelligence_graph_nodes")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", data.missionId)
        .eq("is_active", true),
      supabase
        .from("intelligence_graph_edges")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", data.missionId),
      supabase
        .from("intelligence_graph_nodes")
        .select("updated_at")
        .eq("mission_id", data.missionId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const nodes = nodesRes.count ?? 0;
    const edges = edgesRes.count ?? 0;
    const density = nodes > 0 ? edges / nodes : 0;
    const lastRefresh = (lastRes.data as any)?.updated_at ?? null;

    return { nodes, edges, density, lastRefresh };
  });

// ─── Breakdown by node_type ─────────────────────────────────────────────
export const getNodeBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: nodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("id,node_type,confidence_level")
      .eq("mission_id", data.missionId)
      .eq("is_active", true);

    const { data: edges } = await supabase
      .from("intelligence_graph_edges")
      .select("source_node_id,target_node_id")
      .eq("mission_id", data.missionId);

    const connected = new Set<string>();
    (edges ?? []).forEach((e: any) => {
      connected.add(e.source_node_id);
      connected.add(e.target_node_id);
    });

    const confVal: Record<string, number> = { high: 1.0, medium: 0.6, low: 0.3 };

    const byType: Record<
      string,
      { count: number; confSum: number; confN: number; isolated: number }
    > = {};
    (nodes ?? []).forEach((n: any) => {
      const t = n.node_type ?? "other";
      const bucket = (byType[t] ||= { count: 0, confSum: 0, confN: 0, isolated: 0 });
      bucket.count += 1;
      const cv = confVal[n.confidence_level] ?? 0.6;
      bucket.confSum += cv;
      bucket.confN += 1;
      if (!connected.has(n.id)) bucket.isolated += 1;
    });

    const breakdown = Object.entries(byType)
      .map(([node_type, v]) => ({
        node_type,
        count: v.count,
        avg_confidence: v.confN > 0 ? v.confSum / v.confN : 0,
        isolated: v.isolated,
      }))
      .sort((a, b) => b.count - a.count);

    return { breakdown };
  });

// ─── Isolated nodes ─────────────────────────────────────────────────────
export const getIsolatedNodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: nodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("id,node_type,label,description,confidence_level,source")
      .eq("mission_id", data.missionId)
      .eq("is_active", true);

    const { data: edges } = await supabase
      .from("intelligence_graph_edges")
      .select("source_node_id,target_node_id")
      .eq("mission_id", data.missionId);

    const connected = new Set<string>();
    (edges ?? []).forEach((e: any) => {
      connected.add(e.source_node_id);
      connected.add(e.target_node_id);
    });

    const isolated = (nodes ?? []).filter((n: any) => !connected.has(n.id));
    return { isolated };
  });

// ─── Strongest chains (paths of length >= 3) ────────────────────────────
export const getStrongestChains = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: nodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("id,label,node_type")
      .eq("mission_id", data.missionId)
      .eq("is_active", true);
    const { data: edges } = await supabase
      .from("intelligence_graph_edges")
      .select("source_node_id,target_node_id,strength")
      .eq("mission_id", data.missionId);

    const nodeById = new Map<string, any>();
    (nodes ?? []).forEach((n: any) => nodeById.set(n.id, n));

    // adjacency: src -> [{dst, strength}]
    const adj = new Map<string, Array<{ dst: string; strength: number }>>();
    (edges ?? []).forEach((e: any) => {
      const s = e.strength ?? 5;
      if (!adj.has(e.source_node_id)) adj.set(e.source_node_id, []);
      adj.get(e.source_node_id)!.push({ dst: e.target_node_id, strength: s });
      // treat as undirected for chain discovery
      if (!adj.has(e.target_node_id)) adj.set(e.target_node_id, []);
      adj.get(e.target_node_id)!.push({ dst: e.source_node_id, strength: s });
    });

    // Enumerate paths of length 3 (3 nodes / 2 edges) with bounded fan-out
    type Chain = { nodeIds: string[]; total: number };
    const chains: Chain[] = [];
    for (const [a, outs] of adj.entries()) {
      for (const e1 of outs) {
        const b = e1.dst;
        const outs2 = adj.get(b) ?? [];
        for (const e2 of outs2) {
          const c = e2.dst;
          if (c === a || c === b) continue;
          chains.push({ nodeIds: [a, b, c], total: e1.strength + e2.strength });
        }
      }
    }

    // Dedupe undirected by sorted key
    const seen = new Set<string>();
    const unique: Chain[] = [];
    for (const ch of chains.sort((x, y) => y.total - x.total)) {
      const key = [...ch.nodeIds].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(ch);
      if (unique.length >= 5) break;
    }

    const result = unique.map((ch) => ({
      total: ch.total,
      nodes: ch.nodeIds.map((id) => {
        const n = nodeById.get(id);
        return { id, label: n?.label ?? "?", node_type: n?.node_type ?? "other" };
      }),
    }));

    return { chains: result };
  });

// ─── Coverage gaps: questions with no evidence edges ────────────────────
export const getCoverageGaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: questions } = await supabase
      .from("mission_questions")
      .select("id,question_number,question_text,point_value")
      .eq("mission_id", data.missionId)
      .eq("is_withdrawn", false);

    const { data: nodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("id,node_type,label,metadata")
      .eq("mission_id", data.missionId)
      .eq("is_active", true);

    const { data: edges } = await supabase
      .from("intelligence_graph_edges")
      .select("source_node_id,target_node_id")
      .eq("mission_id", data.missionId);

    const evidenceNodeIds = new Set(
      (nodes ?? [])
        .filter((n: any) => (EVIDENCE_TYPES as readonly string[]).includes(n.node_type))
        .map((n: any) => n.id),
    );

    // Map question_id -> graph node id (requirement nodes referencing the question)
    const qToNode = new Map<string, string>();
    (nodes ?? []).forEach((n: any) => {
      const qid = n?.metadata?.question_id;
      if (n.node_type === "requirement" && typeof qid === "string") {
        qToNode.set(qid, n.id);
      }
    });

    // Build adjacency of node -> connected nodes
    const adj = new Map<string, Set<string>>();
    (edges ?? []).forEach((e: any) => {
      if (!adj.has(e.source_node_id)) adj.set(e.source_node_id, new Set());
      adj.get(e.source_node_id)!.add(e.target_node_id);
      if (!adj.has(e.target_node_id)) adj.set(e.target_node_id, new Set());
      adj.get(e.target_node_id)!.add(e.source_node_id);
    });

    const gaps = (questions ?? [])
      .map((q: any) => {
        const nid = qToNode.get(q.id);
        const neighbors = nid ? adj.get(nid) ?? new Set<string>() : new Set<string>();
        let connectedEvidence = 0;
        neighbors.forEach((n) => {
          if (evidenceNodeIds.has(n)) connectedEvidence += 1;
        });
        return { q, nid, connectedEvidence };
      })
      .filter((x) => x.connectedEvidence === 0)
      .map((x) => ({
        question_id: x.q.id,
        question_number: x.q.question_number,
        question_text: x.q.question_text,
        point_value: x.q.point_value,
        has_graph_node: !!x.nid,
      }));

    return { gaps };
  });

// ─── AI: connect an isolated node ───────────────────────────────────────
async function callGemini(system: string, user: string): Promise<any> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing on server");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 1500,
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
  const j = (await r.json()) as any;
  const content = j.choices?.[0]?.message?.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return {};
  return JSON.parse(match[0]);
}

export const connectIsolatedNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid(), nodeId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: node } = await supabase
      .from("intelligence_graph_nodes")
      .select("id,label,description,node_type")
      .eq("id", data.nodeId)
      .maybeSingle();
    if (!node) throw new Error("Node not found");

    const { data: others } = await supabase
      .from("intelligence_graph_nodes")
      .select("id,label,node_type")
      .eq("mission_id", data.missionId)
      .eq("is_active", true)
      .neq("id", data.nodeId)
      .limit(40);

    const labelToId = new Map<string, string>();
    (others ?? []).forEach((n: any) =>
      labelToId.set(String(n.label).toLowerCase(), n.id),
    );

    const system =
      "You connect isolated intelligence nodes to the most meaningful related nodes. Return ONLY valid JSON: { connections: [{ to_node_label: string, relationship_type: string, strength: 1-10, rationale: string }] }. Max 3 connections.";
    const user = `Isolated node:\nType: ${node.node_type}\nLabel: ${node.label}\nDescription: ${node.description ?? ""}\n\nOther nodes in this mission:\n${(others ?? []).slice(0, 30).map((n: any) => `- [${n.node_type}] ${n.label}`).join("\n")}`;

    const sug = await callGemini(system, user);
    let created = 0;
    for (const c of sug.connections ?? []) {
      const tgt = labelToId.get(String(c.to_node_label ?? "").toLowerCase());
      if (!tgt || tgt === data.nodeId) continue;

      // dup check
      const { data: existing } = await supabase
        .from("intelligence_graph_edges")
        .select("id")
        .eq("mission_id", data.missionId)
        .or(
          `and(source_node_id.eq.${data.nodeId},target_node_id.eq.${tgt}),and(source_node_id.eq.${tgt},target_node_id.eq.${data.nodeId})`,
        )
        .maybeSingle();
      if (existing) continue;

      const strength = Math.max(1, Math.min(10, Math.round(Number(c.strength) || 5)));
      const { error } = await supabase.from("intelligence_graph_edges").insert({
        mission_id: data.missionId,
        source_node_id: data.nodeId,
        target_node_id: tgt,
        relationship_type: String(c.relationship_type || "related").slice(0, 100),
        relationship_description: String(c.rationale || "").slice(0, 500),
        strength,
        is_confirmed: false,
      });
      if (!error) created += 1;
    }
    return { created };
  });

// ─── AI: find evidence for a question ───────────────────────────────────
export const findEvidenceForQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid(), questionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: q } = await supabase
      .from("mission_questions")
      .select("id,question_number,question_text")
      .eq("id", data.questionId)
      .maybeSingle();
    if (!q) throw new Error("Question not found");

    const { data: nodes } = await supabase
      .from("intelligence_graph_nodes")
      .select("id,label,node_type,description,metadata")
      .eq("mission_id", data.missionId)
      .eq("is_active", true);

    // find or skip if no requirement node exists for this question
    const qNode = (nodes ?? []).find(
      (n: any) => n.node_type === "requirement" && n?.metadata?.question_id === q.id,
    );
    if (!qNode) {
      return {
        created: 0,
        skipped: true,
        message: "No graph node exists for this question yet. Refresh the graph first.",
      };
    }

    const evidence = (nodes ?? []).filter((n: any) =>
      (EVIDENCE_TYPES as readonly string[]).includes(n.node_type),
    );
    if (evidence.length === 0) {
      return { created: 0, skipped: true, message: "No evidence-type nodes available." };
    }

    const labelToId = new Map<string, string>();
    evidence.forEach((n: any) => labelToId.set(String(n.label).toLowerCase(), n.id));

    const system =
      "You match RFP questions to existing evidence nodes. Return ONLY valid JSON: { matches: [{ evidence_label: string, relevance: 1-10, rationale: string }] }. Max 3 matches.";
    const user = `Question ${q.question_number ?? ""}: ${q.question_text ?? ""}\n\nAvailable evidence nodes:\n${evidence.slice(0, 40).map((n: any) => `- ${n.label}${n.description ? `: ${String(n.description).slice(0, 120)}` : ""}`).join("\n")}`;

    const sug = await callGemini(system, user);
    let created = 0;
    for (const m of sug.matches ?? []) {
      const tgt = labelToId.get(String(m.evidence_label ?? "").toLowerCase());
      if (!tgt || tgt === qNode.id) continue;

      const { data: existing } = await supabase
        .from("intelligence_graph_edges")
        .select("id")
        .eq("mission_id", data.missionId)
        .or(
          `and(source_node_id.eq.${qNode.id},target_node_id.eq.${tgt}),and(source_node_id.eq.${tgt},target_node_id.eq.${qNode.id})`,
        )
        .maybeSingle();
      if (existing) continue;

      const strength = Math.max(1, Math.min(10, Math.round(Number(m.relevance) || 5)));
      const { error } = await supabase.from("intelligence_graph_edges").insert({
        mission_id: data.missionId,
        source_node_id: qNode.id,
        target_node_id: tgt,
        relationship_type: "evidence_for",
        relationship_description: String(m.rationale || "").slice(0, 500),
        strength,
        is_confirmed: false,
      });
      if (!error) created += 1;
    }
    return { created, skipped: false };
  });
