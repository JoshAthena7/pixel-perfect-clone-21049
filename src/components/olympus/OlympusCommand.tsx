import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { runOracleStage } from "@/lib/oracle-pipeline.functions";
import { toast } from "sonner";
import { Loader2, Plus, ArrowRight, RefreshCw } from "lucide-react";
import { TaxonomyBrowser } from "./TaxonomyBrowser";
import { IntelReviewQueue } from "./IntelReviewQueue";
import { SourcesPanel } from "./SourcesPanel";
import { HealthColumn } from "./HealthColumn";
import { IntelSetupWizard } from "@/components/intel-setup/IntelSetupWizard";
import { OracleMissingDocsBanner } from "@/components/mission-command/oracle/checklist/OracleMissingDocsBanner";



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

export function OlympusCommand({ initialMissionId }: { initialMissionId?: string } = {}) {
  const missionsQ = useMissions();
  const [missionId, setMissionId] = useState<string | null>(initialMissionId ?? null);
  const [leftTab, setLeftTab] = useState<"taxonomy" | "sources">("taxonomy");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const lastRunQ = useLastPipelineRun();
  const runStage = useServerFn(runOracleStage);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setGuideDismissed(window.localStorage.getItem("atlas_signal_review_guide_dismissed") === "1");
    }
  }, []);

  const openWizard = () => setWizardOpen(true);

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
      toast.success("Scan complete");
      lastRunQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "Scan failed"),
  });

  return (
    <div className="min-h-screen w-full" style={{ background: "#070f1c", color: "#e5e7eb" }}>
      {/* Top status bar — three zones */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 border-b"
        style={{ height: 48, borderColor: "rgba(255,255,255,0.06)", background: "#070f1c" }}
      >
        {/* LEFT zone */}
        <div className="flex items-center gap-3 shrink-0">
          <span style={{ color: "#e5e7eb", fontSize: 14, fontWeight: 500 }}>Signal Review</span>
        </div>

        {/* CENTER zone — pipeline status */}
        <div className="flex-1 flex items-center justify-center gap-2 text-[11px] text-white/55 min-w-0">
          {(() => {
            const last = lastRunQ.data ? new Date(lastRunQ.data).getTime() : null;
            const hrs = last ? (Date.now() - last) / 3600_000 : null;
            const dot = hrs == null
              ? { c: "rgba(255,255,255,0.3)", text: "Pipeline idle" }
              : hrs < 4
              ? { c: "#22c55e", text: "Pipeline active" }
              : hrs > 24
              ? { c: "#fbbf24", text: "Pipeline stale" }
              : { c: "#22c55e", text: "Pipeline active" };
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, background: dot.c, boxShadow: `0 0 6px ${dot.c}` }} />
                {dot.text} · last run {formatRelative(lastRunQ.data)}
              </span>
            );
          })()}
        </div>

        {/* RIGHT zone — mission switcher + actions */}
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-white/60">
            <select
              value={missionId ?? ""}
              onChange={(e) => setMissionId(e.target.value)}
              className="bg-transparent border border-white/10 rounded px-2 py-1 text-white/80 max-w-[160px]"
            >
              {missionsQ.data?.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#070f1c]">
                  {m.name}
                </option>
              ))}
            </select>
            {missionId && (
              <button
                onClick={openWizard}
                className="inline-flex items-center gap-1.5"
                style={{
                  background: "rgba(196,154,43,1)",
                  color: "#000",
                  fontWeight: 600,
                  fontSize: 12,
                  padding: "8px 16px",
                  borderRadius: 4,
                  height: 36,
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Upload documents
              </button>
            )}
          </div>
          <button
            onClick={() => pipeline.mutate()}
            disabled={pipeline.isPending}
            className="inline-flex items-center gap-1 text-white/45 hover:text-white/70 disabled:opacity-50"
            style={{ fontSize: 10 }}
          >
            {pipeline.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
            Scan for new intel
          </button>
        </div>
      </div>

      {missionId && (
        <>
          <OracleMissingDocsBanner
            missionId={missionId}
            onOpenUpload={openWizard}
          />
          <IntelSetupWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            missionId={missionId}
          />
        </>
      )}

      {!guideDismissed && (
        <div className="px-4 pt-3">
          <div
            style={{
              padding: "14px 18px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 6,
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 500, marginBottom: 6 }}>
                How intel gets into ATLAS
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                <strong style={{ color: "rgba(255,255,255,0.7)" }}>1. Upload documents</strong> — IRIS reads your RFP and other documents, then extracts intelligence automatically.<br />
                <strong style={{ color: "rgba(255,255,255,0.7)" }}>2. Review signals</strong> — Approve what's accurate. Approved signals power every writer's brief.<br />
                <strong style={{ color: "rgba(255,255,255,0.7)" }}>3. Scan for new intel</strong> — Optionally run a scan to find new signals from external sources.
              </div>
            </div>
            <button
              onClick={() => {
                setGuideDismissed(true);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("atlas_signal_review_guide_dismissed", "1");
                }
              }}
              style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
            >
              Got it ×
            </button>
          </div>
        </div>
      )}


      {/* 2-panel shell — queue (65%) + pipeline health (35%) */}
      <div className="grid" style={{ gridTemplateColumns: "65% 35%", height: "calc(100vh - 48px)" }}>
        <Column title="INTEL REVIEW QUEUE" dataAttr="review">
          <IntelReviewQueue missionId={missionId} taxonomyNodeId={selectedNodeId} />
          {/* Taxonomy & Sources — collapsed by default, below the queue header */}
          <details style={{ marginTop: 12 }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                padding: "8px 4px",
                listStyle: "none",
              }}
            >
              ⚙ Taxonomy &amp; Sources
            </summary>
            <div className="mt-2 flex gap-3">
              <button
                onClick={() => setLeftTab("taxonomy")}
                className={leftTab === "taxonomy" ? "text-white/90 text-[11px]" : "text-white/40 text-[11px] hover:text-white/70"}
              >
                TAXONOMY
              </button>
              <button
                onClick={() => setLeftTab("sources")}
                className={leftTab === "sources" ? "text-white/90 text-[11px]" : "text-white/40 text-[11px] hover:text-white/70"}
              >
                SOURCES
              </button>
            </div>
            <div className="mt-3">
              {leftTab === "taxonomy" ? (
                missionId ? (
                  <OracleLeftColumn
                    missionId={missionId}
                    selectedNodeId={selectedNodeId}
                    onSelect={setSelectedNodeId}
                    onFeed={() => openFeed("documents")}
                  />
                ) : (
                  <TaxonomyBrowser selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} />
                )
              ) : (
                <SourcesPanel />
              )}
            </div>
          </details>
        </Column>
        <div
          className="h-full overflow-hidden"
          style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}
        >
          <HealthColumn
            missionId={missionId}
            onSwitchToReview={() => toast.info("Open Needs Review in the queue.")}
            onSwitchToSources={() => setLeftTab("sources")}
          />
        </div>
      </div>

    </div>
  );
}

function Column({
  title,
  children,
  borderX,
  dataAttr,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  borderX?: boolean;
  dataAttr?: string;
}) {
  return (
    <div
      className="h-full overflow-y-auto"
      data-olympus-col={dataAttr}
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

function OracleLeftColumn({
  missionId,
  selectedNodeId,
  onSelect,
  onFeed,
}: {
  missionId: string;
  selectedNodeId: string | null;
  onSelect: (id: string | null) => void;
  onFeed: () => void;
}) {
  const countQ = useQuery({
    queryKey: ["oracle-approved-count", missionId],
    queryFn: async () => {
      // Count approved/pushed signals for this mission OR shared platform/state tier.
      // Hides the "ORACLE is empty" guide whenever ≥10 usable signals exist.
      const { count } = await supabase
        .from("oracle_signals")
        .select("id", { count: "exact", head: true })
        .in("status", ["approved", "pushed"])
        .or(`mission_id.eq.${missionId},tier.in.(platform,state)`);
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  if (countQ.isLoading) {
    return <div className="text-[11px] text-white/40 py-4">Loading…</div>;
  }

  if ((countQ.data ?? 0) < 10) {
    return <OracleEmptyGuide onFeed={onFeed} />;
  }

  return <TaxonomyBrowser selectedNodeId={selectedNodeId} onSelect={onSelect} />;
}

function OracleEmptyGuide({ onFeed }: { onFeed: () => void }) {
  const goReview = () => {
    const el = document.querySelector('[data-olympus-col="review"]');
    if (el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div
      className="rounded-lg p-5"
      style={{
        background: "rgba(5,13,24,0.85)",
        border: "1px solid rgba(212,175,55,0.35)",
        boxShadow: "0 0 30px rgba(212,175,55,0.08)",
      }}
    >
      <div className="text-center mb-5">
        <div style={{ color: "#d4af37", fontSize: 13, fontWeight: 600 }}>◈ ORACLE is empty</div>
        <div className="text-white/55 text-[11px] mt-1">
          Three steps to activate IRIS briefings:
        </div>
      </div>
      <ol className="space-y-4">
        <GuideStep n={1} title="Feed ATLAS"
          body="Upload your RFP and documents, or add a manual intelligence item. IRIS extracts the rest.">
          <button
            type="button"
            onClick={onFeed}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{ background: "#d4af37", color: "#070f1c" }}
          >
            + Feed ATLAS <ArrowRight className="h-3 w-3" />
          </button>
        </GuideStep>
        <GuideStep n={2} title="Review extracted items"
          body="IRIS will surface items here for your review. Approve what's accurate.">
          <button
            type="button"
            onClick={goReview}
            className="text-[11px] text-white/55 hover:text-white/80 inline-flex items-center gap-1"
          >
            View Processing Queue <ArrowRight className="h-3 w-3" />
          </button>
        </GuideStep>
        <GuideStep n={3} title="IRIS briefs go live"
          body="Once you have 10+ approved items, IRIS briefs on every question become grounded in real ORACLE intelligence." />
      </ol>
    </div>
  );
}

function GuideStep({
  n,
  title,
  body,
  children,
}: {
  n: number;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div
        className="shrink-0 rounded-full flex items-center justify-center"
        style={{
          width: 22,
          height: 22,
          background: "rgba(212,175,55,0.12)",
          border: "1px solid rgba(212,175,55,0.4)",
          color: "#d4af37",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {n}
      </div>
      <div className="min-w-0">
        <div className="text-white/85 text-[12px] font-medium">{title}</div>
        <div className="text-white/45 text-[11px] mt-0.5 leading-snug">{body}</div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
}

