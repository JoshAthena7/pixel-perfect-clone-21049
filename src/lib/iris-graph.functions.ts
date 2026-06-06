import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type GraphNode = {
  id: string;
  kind: string;
  label: string;
  domain: string | null;
  ref_table: string | null;
  ref_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type GraphEdge = {
  id: string;
  src_node_id: string;
  dst_node_id: string;
  edge_type: string;
  weight: number;
  confidence: number | null;
  provenance: Record<string, unknown> | null;
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
      .maybeSingle();

    if (!node) return { node: null, sources: [], edges: [] };

    const { data: edges } = await supabase
      .from("graph_edges")
      .select(
        "id,src_node_id,dst_node_id,edge_type,weight,confidence,provenance,valid_from,valid_to",
      )
      .eq("mission_id", data.missionId)
      .eq("dst_node_id", node.id)
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
