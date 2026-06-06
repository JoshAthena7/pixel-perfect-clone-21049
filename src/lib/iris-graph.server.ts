/**
 * Mission Intelligence Graph — write & read helpers.
 *
 * Server-only. Import inside *.functions.ts handlers via `await import(...)`.
 *
 * Two ideas underpin the schema:
 *   1. Every output (signal, risk, win theme, priority…) AND every source it
 *      came from (market intel row, requirement, stakeholder…) is a *node*.
 *   2. Every relationship is a typed, weighted *edge* with provenance + a
 *      time window. This is what lets IRIS answer "why is this here?" and
 *      "what changed in the last 7 days?".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type IrisDomain =
  | "mission"
  | "policy"
  | "political"
  | "stakeholder"
  | "market"
  | "community"
  | "research"
  | "signal"
  | "relationship";

export type NodeKind =
  // Outputs (the 5 user-facing things)
  | "signal"
  | "risk"
  | "win_theme"
  | "state_priority"
  | "client_intel"
  // Sources
  | "market_row"
  | "requirement"
  | "stakeholder"
  | "mission"
  | "synthetic_source";

export type EdgeType =
  | "derived_from" // output ← source it was built from
  | "cites"
  | "supports"
  | "contradicts"
  | "influences"
  | "supersedes"
  | "co_occurs_with";

export type NodeRef = {
  mission_id: string;
  kind: NodeKind;
  ref_table?: string | null;
  ref_id?: string | null;
  label: string;
  domain?: IrisDomain | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Idempotent node upsert keyed on (mission_id, kind, ref_table, ref_id).
 * Returns the node id.
 */
export async function upsertNode(supabase: SupabaseClient, n: NodeRef): Promise<string> {
  const refTable = n.ref_table ?? "";
  const refId = n.ref_id ?? "";

  // Try read first — cheap and avoids racing on the partial unique index.
  const { data: existing } = await supabase
    .from("graph_nodes")
    .select("id")
    .eq("mission_id", n.mission_id)
    .eq("kind", n.kind)
    .eq("ref_table", refTable)
    .eq("ref_id", refId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("graph_nodes")
    .insert({
      mission_id: n.mission_id,
      kind: n.kind,
      ref_table: refTable,
      ref_id: refId,
      label: n.label,
      domain: n.domain ?? null,
      metadata: n.metadata ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // Lost the race — re-read.
    const { data: again } = await supabase
      .from("graph_nodes")
      .select("id")
      .eq("mission_id", n.mission_id)
      .eq("kind", n.kind)
      .eq("ref_table", refTable)
      .eq("ref_id", refId)
      .maybeSingle();
    if (again?.id) return again.id as string;
    throw new Error(`upsertNode: ${error.message}`);
  }
  return data.id as string;
}

export type EdgeInput = {
  mission_id: string;
  src_node_id: string;
  dst_node_id: string;
  edge_type: EdgeType;
  weight?: number;
  confidence?: number;
  provenance?: Record<string, unknown>;
};

export async function recordEdges(supabase: SupabaseClient, edges: EdgeInput[]): Promise<void> {
  if (edges.length === 0) return;
  const rows = edges
    .filter((e) => e.src_node_id !== e.dst_node_id)
    .map((e) => ({
      mission_id: e.mission_id,
      src_node_id: e.src_node_id,
      dst_node_id: e.dst_node_id,
      edge_type: e.edge_type,
      weight: e.weight ?? 1.0,
      confidence: e.confidence ?? null,
      provenance: e.provenance ?? null,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("graph_edges").insert(rows);
  if (error) throw new Error(`recordEdges: ${error.message}`);
}

/**
 * Wipe edges (and their derived_from source nodes that nothing else points
 * to) for a given output node. Used by extractors that re-run and replace
 * their outputs — keeps the graph from accumulating stale provenance.
 */
export async function clearMissionOutputGraph(
  supabase: SupabaseClient,
  missionId: string,
  kind: NodeKind,
): Promise<void> {
  // Find output nodes of this kind for this mission.
  const { data: outputs } = await supabase
    .from("graph_nodes")
    .select("id")
    .eq("mission_id", missionId)
    .eq("kind", kind);
  const ids = (outputs ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return;
  // Delete edges first (cascades from node delete would also work).
  await supabase.from("graph_edges").delete().in("dst_node_id", ids);
  await supabase.from("graph_edges").delete().in("src_node_id", ids);
  await supabase.from("graph_nodes").delete().in("id", ids);
}
