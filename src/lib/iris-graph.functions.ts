import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type GraphNode = {
  id: string;
  kind: string;
  label: string;
  domain: string | null;
  ref_table: string | null;
  ref_id: string | null;
  metadata: JsonValue | null;
};

export type GraphEdge = {
  id: string;
  src_node_id: string;
  dst_node_id: string;
  edge_type: string;
  weight: number;
  confidence: number | null;
  provenance: JsonValue | null;
  valid_from: string;
  valid_to: string | null;
};

export type ExplainResult = {
  node: GraphNode | null;
  sources: GraphNode[];
  edges: GraphEdge[];
};

/**
 * "Why is this here?" — returns the inbound subgraph (one hop) for a given
 * output. Caller passes the output's backing table + row id (e.g. signals /
 * <signal-id>) and gets the source nodes + edges that produced it.
 */
export const explainOutput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        kind: z.enum(["signal", "risk", "win_theme", "state_priority", "client_intel"]),
        refTable: z.string().min(1).max(64),
        refId: z.string().min(1).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ExplainResult> => {
    const { supabase } = context;

    const { data: node } = await supabase
      .from("graph_nodes")
      .select("id,kind,label,domain,ref_table,ref_id,metadata")
      .eq("mission_id", data.missionId)
      .eq("kind", data.kind)
      .eq("ref_table", data.refTable)
      .eq("ref_id", data.refId)
      .is("valid_to", null)
      .maybeSingle();

    if (!node) return { node: null, sources: [], edges: [] };

    const { data: edges } = await supabase
      .from("graph_edges")
      .select(
        "id,src_node_id,dst_node_id,edge_type,weight,confidence,provenance,valid_from,valid_to",
      )
      .eq("mission_id", data.missionId)
      .eq("dst_node_id", node.id)
      .is("valid_to", null)
      .order("weight", { ascending: false });

    const sourceIds = Array.from(new Set((edges ?? []).map((e) => e.src_node_id)));
    let sources: GraphNode[] = [];
    if (sourceIds.length > 0) {
      const { data: srcs } = await supabase
        .from("graph_nodes")
        .select("id,kind,label,domain,ref_table,ref_id,metadata")
        .in("id", sourceIds);
      sources = (srcs ?? []) as GraphNode[];
    }

    return {
      node: node as GraphNode,
      sources,
      edges: (edges ?? []) as GraphEdge[],
    };
  });

// ─── Coverage ─────────────────────────────────────────────────────────────
// Powers the "Community Intelligence: 12%" style gap detection. Counts
// currently-active nodes per kind and per domain so the UI can show which
// intelligence areas are thin or missing entirely.

export type CoverageResult = {
  byKind: Record<string, number>;
  byDomain: Record<string, number>;
  totals: { nodes: number; edges: number };
  // Per-output-kind coverage % vs a target. Targets are conservative defaults;
  // tune as the product matures.
  scores: Array<{ kind: string; count: number; target: number; pct: number }>;
};

const COVERAGE_TARGETS: Record<string, number> = {
  signal: 8,
  risk: 6,
  win_theme: 4,
  state_priority: 5,
  client_intel: 1,
};

export const getCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CoverageResult> => {
    const { supabase } = context;
    const { data: nodes } = await supabase
      .from("graph_nodes")
      .select("kind,domain")
      .eq("mission_id", data.missionId)
      .is("valid_to", null);
    const { count: edgeCount } = await supabase
      .from("graph_edges")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", data.missionId)
      .is("valid_to", null);

    const byKind: Record<string, number> = {};
    const byDomain: Record<string, number> = {};
    for (const n of nodes ?? []) {
      byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
      const d = n.domain ?? "unspecified";
      byDomain[d] = (byDomain[d] ?? 0) + 1;
    }
    const scores = Object.entries(COVERAGE_TARGETS).map(([kind, target]) => {
      const count = byKind[kind] ?? 0;
      return { kind, count, target, pct: Math.min(100, Math.round((count / target) * 100)) };
    });

    return {
      byKind,
      byDomain,
      totals: { nodes: (nodes ?? []).length, edges: edgeCount ?? 0 },
      scores,
    };
  });

// ─── Recent changes (last N days) ─────────────────────────────────────────
// Powers the "what changed since you last looked" feed. Uses the temporal
// columns on graph_nodes / graph_edges to surface adds + expirations.

export type RecentChange = {
  id: string;
  kind: string;
  label: string;
  domain: string | null;
  change: "added" | "expired";
  at: string;
};

export const getRecentChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        days: z.number().int().min(1).max(90).default(7),
        kinds: z.array(z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ changes: RecentChange[]; since: string }> => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const kinds = data.kinds ?? ["signal", "risk", "win_theme", "state_priority", "client_intel"];

    const { data: added } = await supabase
      .from("graph_nodes")
      .select("id,kind,label,domain,valid_from")
      .eq("mission_id", data.missionId)
      .in("kind", kinds)
      .gte("valid_from", since)
      .order("valid_from", { ascending: false })
      .limit(50);

    const { data: expired } = await supabase
      .from("graph_nodes")
      .select("id,kind,label,domain,valid_to")
      .eq("mission_id", data.missionId)
      .in("kind", kinds)
      .not("valid_to", "is", null)
      .gte("valid_to", since)
      .order("valid_to", { ascending: false })
      .limit(50);

    const changes: RecentChange[] = [
      ...(added ?? []).map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        domain: n.domain,
        change: "added" as const,
        at: n.valid_from,
      })),
      ...(expired ?? []).map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        domain: n.domain,
        change: "expired" as const,
        at: n.valid_to!,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return { changes, since };
  });
