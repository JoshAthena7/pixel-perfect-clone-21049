/**
 * Admin-only "ORACLE Pipeline" page — manually trigger the three pipeline
 * stages and view real-time queue + source status. Admin role required.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { runOracleStage, getOraclePipelineStatus } from "@/lib/oracle-pipeline.functions";

const GOLD = "#C9972B";

export const Route = createFileRoute("/_authenticated/admin/oracle-pipeline")({
  component: OraclePipelinePage,
});

type Stage = "scraper" | "classifier" | "promoter";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusPill(status: string, errorCount: number): { color: string; label: string } {
  if (status === "error" || errorCount >= 3) return { color: "#ef4444", label: "error" };
  if (errorCount > 0) return { color: "#f59e0b", label: `${errorCount} fail${errorCount === 1 ? "" : "s"}` };
  if (status === "active") return { color: "#10b981", label: "active" };
  return { color: "#94a3b8", label: status };
}

function OraclePipelinePage() {
  const qc = useQueryClient();
  const runStage = useServerFn(runOracleStage);
  const fetchStatus = useServerFn(getOraclePipelineStatus);

  const { data: status, isLoading } = useQuery({
    queryKey: ["oracle-pipeline-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });

  const [stageState, setStageState] = useState<Record<Stage, "idle" | "running" | "done" | "error">>({
    scraper: "idle",
    classifier: "idle",
    promoter: "idle",
  });
  const [runningAll, setRunningAll] = useState(false);

  async function runOne(stage: Stage) {
    setStageState((s) => ({ ...s, [stage]: "running" }));
    try {
      const res = await runStage({ data: { stage } });
      setStageState((s) => ({ ...s, [stage]: "done" }));
      const summary =
        stage === "scraper"
          ? `Scraper: ${("sources_checked" in res ? res.sources_checked : 0)} sources, ${("items_queued" in res ? res.items_queued : 0)} queued`
          : stage === "classifier"
            ? `Classifier: ${("items_classified" in res ? res.items_classified : 0)} classified, ${("items_dismissed" in res ? res.items_dismissed : 0)} dismissed`
            : `Promoter: ${("items_promoted" in res ? res.items_promoted : 0)} promoted, ${("alerts_created" in res ? res.alerts_created : 0)} alerts`;
      toast.success(summary);
      qc.invalidateQueries({ queryKey: ["oracle-pipeline-status"] });
    } catch (err) {
      setStageState((s) => ({ ...s, [stage]: "error" }));
      toast.error(`${stage} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function runAll() {
    setRunningAll(true);
    setStageState({ scraper: "idle", classifier: "idle", promoter: "idle" });
    try {
      await runOne("scraper");
      await runOne("classifier");
      await runOne("promoter");
      toast.success("Pipeline run complete");
    } finally {
      setRunningAll(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ORACLE Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manually trigger the automated ingestion pipeline and inspect queue depth + source health.
          Cron runs: scraper every 4h, classifier every 30m, promoter at :15/:45.
        </p>
      </header>

      {/* Run controls */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Manual run</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Run all three stages in sequence, or trigger one stage individually.
            </p>
          </div>
          <button
            onClick={runAll}
            disabled={runningAll}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: GOLD, color: "#0a0a0a" }}
          >
            {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run full pipeline
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(["scraper", "classifier", "promoter"] as Stage[]).map((s) => (
            <StageButton
              key={s}
              stage={s}
              state={stageState[s]}
              onClick={() => runOne(s)}
              disabled={runningAll}
            />
          ))}
        </div>
      </div>

      {/* Pipeline status */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pipeline status</h2>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["oracle-pipeline-status"] })}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {isLoading || !status ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Last scraper run" value={relativeTime(status.last_scraper_run)} icon={<Clock />} />
              <StatCard label="Last classifier run" value={relativeTime(status.last_classifier_run)} icon={<Clock />} />
              <StatCard label="Last promoter run" value={relativeTime(status.last_promoter_run)} icon={<Clock />} />
            </div>
            <div className="grid grid-cols-6 gap-2">
              <QueueCount label="Pending" value={status.queue_counts.pending ?? 0} color="#94a3b8" />
              <QueueCount label="Classifying" value={status.queue_counts.classifying ?? 0} color="#3b82f6" />
              <QueueCount label="Classified" value={status.queue_counts.classified ?? 0} color="#8b5cf6" />
              <QueueCount label="Dismissed" value={status.queue_counts.dismissed ?? 0} color="#64748b" />
              <QueueCount label="Promoted" value={status.queue_counts.promoted ?? 0} color="#10b981" />
              <QueueCount label="Errors" value={status.queue_counts.error ?? 0} color="#ef4444" />
            </div>
          </>
        )}
      </div>

      {/* Source registry */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
        <h2 className="font-semibold">Sources</h2>
        {!status ? null : status.sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">No sources configured.</p>
        ) : (
          <div className="space-y-1.5">
            {status.sources.map((src) => {
              const pill = statusPill(src.status, src.error_count ?? 0);
              return (
                <div
                  key={src.id}
                  className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.01] px-3 py-2 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{src.source_name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {src.source_type} · {src.state_code ?? "platform"} · last checked {relativeTime(src.last_checked_at)}
                    </div>
                    {src.error_message ? (
                      <div className="text-[10px] text-red-400 mt-0.5 truncate" title={src.error_message}>
                        {src.error_message}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className="ml-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: `${pill.color}22`, color: pill.color }}
                  >
                    {pill.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StageButton({
  stage,
  state,
  onClick,
  disabled,
}: {
  stage: Stage;
  state: "idle" | "running" | "done" | "error";
  onClick: () => void;
  disabled: boolean;
}) {
  const label =
    stage === "scraper" ? "1. Scrape sources" : stage === "classifier" ? "2. Classify queue" : "3. Promote signals";
  return (
    <button
      onClick={onClick}
      disabled={disabled || state === "running"}
      className="flex flex-col items-start gap-1 rounded-md border border-white/10 bg-white/[0.02] px-3 py-3 text-left hover:bg-white/[0.04] disabled:opacity-50"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {state === "running" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : state === "error" ? (
          <AlertCircle className="h-4 w-4 text-red-400" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {label}
      </div>
      <span className="text-[10px] text-muted-foreground capitalize">{state}</span>
    </button>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span> {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function QueueCount({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: `${color}33`, background: `${color}0a` }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color }}>
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
