/**
 * ORACLE Admin — Sources table for a mission.
 *
 * Lists every mission_document with extraction counts pulled from
 * intelligence_graph_nodes (source_document_id) and mission_proof_points
 * (source tag). "Re-extract" button fires extractSourceIntelligence for
 * that single document. "Extract all" fires the batch.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  extractSourceIntelligence,
  extractAllSourcesForMission,
} from "@/lib/oracle-extract-source.functions";
import { densifyMissionGraphEdges } from "@/lib/oracle-densify-graph.functions";
import { Loader2, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/admin/oracle-sources/$missionId",
)({
  component: SourcesPage,
});

type DocRow = {
  id: string;
  title: string | null;
  document_type: string | null;
  created_at: string;
};
type CountRow = { document_id: string; nodes: number; proofs: number };

function SourcesPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();
  const extractOne = useServerFn(extractSourceIntelligence);
  const extractAll = useServerFn(extractAllSourcesForMission);
  const densify = useServerFn(densifyMissionGraphEdges);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState<"extract" | "densify" | null>(null);

  const { data: mission } = useQuery({
    queryKey: ["mission-name", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, name, client_name")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  const { data: docs = [], isLoading } = useQuery<DocRow[]>({
    queryKey: ["oracle-sources", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_documents")
        .select("id, title, document_type, created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  const { data: counts = [] } = useQuery<CountRow[]>({
    queryKey: ["oracle-source-counts", missionId, docs.map((d) => d.id).join(",")],
    enabled: docs.length > 0,
    queryFn: async () => {
      const ids = docs.map((d) => d.id);
      const [nodesRes, proofsRes] = await Promise.all([
        supabase
          .from("intelligence_graph_nodes")
          .select("source_document_id")
          .eq("mission_id", missionId)
          .in("source_document_id", ids),
        supabase
          .from("mission_proof_points")
          .select("source")
          .eq("mission_id", missionId),
      ]);
      const nodeCount = new Map<string, number>();
      for (const r of nodesRes.data ?? []) {
        const k = (r as any).source_document_id as string | null;
        if (!k) continue;
        nodeCount.set(k, (nodeCount.get(k) ?? 0) + 1);
      }
      const proofCount = new Map<string, number>();
      for (const r of proofsRes.data ?? []) {
        const s = (r as any).source as string | null;
        if (!s) continue;
        // Format: oracle_extract:<docType>:<docId>
        const docId = s.split(":").pop();
        if (!docId) continue;
        proofCount.set(docId, (proofCount.get(docId) ?? 0) + 1);
      }
      return ids.map((id) => ({
        document_id: id,
        nodes: nodeCount.get(id) ?? 0,
        proofs: proofCount.get(id) ?? 0,
      }));
    },
  });

  const countMap = new Map(counts.map((c) => [c.document_id, c]));

  async function reExtract(id: string) {
    setBusyId(id);
    try {
      const r = await extractOne({ data: { mission_id: missionId, document_id: id } });
      if (r.skipped) {
        toast.message(`Skipped: ${r.skipped}`);
      } else {
        toast.success(
          `Extracted • proofs ${r.counts.proof_points} • risks ${r.counts.risks} • nodes ${r.counts.graph_nodes}`,
        );
      }
      await qc.invalidateQueries({ queryKey: ["oracle-source-counts", missionId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function runBatch(kind: "extract" | "densify") {
    setBatchBusy(kind);
    try {
      if (kind === "extract") {
        const r = await extractAll({ data: { mission_id: missionId } });
        toast.success(`Processed ${r.processed} documents`);
        await qc.invalidateQueries({ queryKey: ["oracle-source-counts", missionId] });
      } else {
        const r = await densify({ data: { mission_id: missionId } });
        toast.success(`Densified • new edges ${r.edgesAdded}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBatchBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          ORACLE · Admin
        </div>
        <h1 className="text-2xl font-semibold mt-1">Sources</h1>
        <div className="text-sm text-muted-foreground mt-1">
          {mission ? `${mission.name} — ${mission.client_name ?? "—"}` : missionId}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => runBatch("extract")}
          disabled={!!batchBusy}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {batchBusy === "extract" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          Extract all non-RFP sources
        </button>
        <button
          onClick={() => runBatch("densify")}
          disabled={!!batchBusy}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {batchBusy === "densify" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Densify graph edges
        </button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Document</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-right px-3 py-2">Graph nodes</th>
              <th className="text-right px-3 py-2">Proof points</th>
              <th className="text-right px-3 py-2">Added</th>
              <th className="text-right px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : docs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No documents on this mission.
                </td>
              </tr>
            ) : (
              docs.map((d) => {
                const c = countMap.get(d.id);
                const isPrimary = d.document_type === "primary_rfp";
                return (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{d.title ?? "(untitled)"}</div>
                      <div className="text-[10.5px] text-muted-foreground font-mono">{d.id}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.document_type ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c?.nodes ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c?.proofs ?? 0}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground text-[11px]">
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => reExtract(d.id)}
                        disabled={!!busyId || isPrimary}
                        title={isPrimary ? "Primary RFP uses the dedicated pipeline" : "Re-extract this source"}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] font-medium disabled:opacity-40"
                      >
                        {busyId === d.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Re-extract
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
