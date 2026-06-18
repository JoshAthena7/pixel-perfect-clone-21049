import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runOracleStage } from "@/lib/oracle-pipeline.functions";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { TaxonomyBrowser } from "./TaxonomyBrowser";
import { IntelReviewQueue } from "./IntelReviewQueue";
import { SourcesPanel } from "./SourcesPanel";

type MissionRow = { id: string; name: string; submission_deadline: string | null };

function useMissions() {
  return useQuery({
    queryKey: ["olympus", "missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id,name,submission_deadline")
        .order("submission_deadline", { ascending: true, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as MissionRow[];
    },
    staleTime: 60_000,
  });
}

function useLastPipelineRun() {
  return useQuery({
    queryKey: ["olympus", "last-pipeline-run"],
    queryFn: async () => {
      const { data } = await supabase
        .from("oracle_ingestion_queue")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("ingested_at" as any)
        .order("ingested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any)?.ingested_at as string | null;
    },
    refetchInterval: 30_000,
  });
}

function formatCountdown(deadline: string | null): string {
  if (!deadline) return "—";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "past due";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function OlympusCommand() {
  const missionsQ = useMissions();
  const [missionId, setMissionId] = useState<string | null>(null);
  const lastRunQ = useLastPipelineRun();
  const runStage = useServerFn(runOracleStage);

  // Pick default mission once loaded
  useEffect(() => {
    if (!missionId && missionsQ.data && missionsQ.data.length > 0) {
      setMissionId(missionsQ.data[0].id);
    }
  }, [missionsQ.data, missionId]);

  const selectedMission = useMemo(
    () => missionsQ.data?.find((m) => m.id === missionId) ?? null,
    [missionsQ.data, missionId],
  );

  const pipeline = useMutation({
    mutationFn: async () => {
      const stages = ["scraper", "classifier", "promoter"] as const;
      for (const stage of stages) {
        await runStage({ data: { stage } });
      }
    },
    onSuccess: () => {
      toast.success("Pipeline run complete");
      lastRunQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "Pipeline failed"),
  });

  return (
    <div className="min-h-screen w-full" style={{ background: "#070f1c", color: "#e5e7eb" }}>
      {/* Top status bar */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 border-b"
        style={{ height: 48, borderColor: "rgba(255,255,255,0.06)", background: "#070f1c" }}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: "#d4af37", fontSize: 13, fontWeight: 600 }}>
            ⚡ Olympus · ORACLE Command
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-white/60">
          <select
            value={missionId ?? ""}
            onChange={(e) => setMissionId(e.target.value)}
            className="bg-transparent border border-white/10 rounded px-2 py-1 text-white/80"
          >
            {missionsQ.data?.map((m) => (
              <option key={m.id} value={m.id} className="bg-[#070f1c]">
                {m.name}
              </option>
            ))}
          </select>
          <span>
            Deadline:{" "}
            <span className="text-white/80">
              {formatCountdown(selectedMission?.submission_deadline ?? null)}
            </span>
          </span>
          <span>
            Last pipeline:{" "}
            <span className="text-white/80">{formatRelative(lastRunQ.data)}</span>
          </span>
          <button
            onClick={() => pipeline.mutate()}
            disabled={pipeline.isPending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-white/90 hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "#d4af37" }}
          >
            {pipeline.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" style={{ color: "#d4af37" }} />
            )}
            Run Pipeline
          </button>
        </div>
      </div>

      {/* 3-column shell */}
      <div className="grid" style={{ gridTemplateColumns: "24% 48% 28%", height: "calc(100vh - 48px)" }}>
        <Column title="TAXONOMY BROWSER">
          <PhasePlaceholder phase="B" note="67-node tree, gap map, source manager." />
        </Column>
        <Column title="INTEL REVIEW QUEUE" borderX>
          {missionId ? (
            <PhasePlaceholder phase="B" note="Review cards with Approve/Push/Dismiss + detail drawer." />
          ) : (
            <EmptyMessage>Select a mission to load the review queue.</EmptyMessage>
          )}
        </Column>
        <Column title="ORACLE HEALTH">
          <PhasePlaceholder phase="C" note="Briefing coverage, pipeline health, IRIS usage, top intel." />
        </Column>
      </div>
    </div>
  );
}

function Column({
  title,
  children,
  borderX,
}: {
  title: string;
  children: React.ReactNode;
  borderX?: boolean;
}) {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{
        borderLeft: borderX ? "1px solid rgba(255,255,255,0.06)" : undefined,
        borderRight: borderX ? "1px solid rgba(255,255,255,0.06)" : undefined,
      }}
    >
      <div
        className="sticky top-0 px-3 py-2 text-[10px] uppercase tracking-wider text-white/50 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "#070f1c" }}
      >
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function PhasePlaceholder({ phase, note }: { phase: string; note: string }) {
  return (
    <div className="rounded border border-dashed border-white/10 p-4 text-[11px] text-white/40">
      <div className="text-white/60 mb-1">Phase {phase} — coming next</div>
      <div>{note}</div>
    </div>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-white/40 px-2 py-6 text-center">{children}</div>;
}
