import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Activity, CheckCircle2, Loader2, Play, XCircle, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getIrisPipelineStatus,
  runIrisPipeline,
} from "@/lib/iris-health.functions";

export const Route = createFileRoute("/_authenticated/admin/iris-health")({
  component: IrisHealthPage,
});

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function fmtAgo(iso: string | null | undefined) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusBadge(status: string) {
  const s = status?.toLowerCase() ?? "";
  if (s === "succeeded") return { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 };
  if (s === "failed") return { cls: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle };
  if (s === "running" || s === "starting") return { cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Loader2 };
  return { cls: "bg-muted text-muted-foreground border-border", icon: AlertCircle };
}

function IrisHealthPage() {
  const fetchStatus = useServerFn(getIrisPipelineStatus);
  const runPipeline = useServerFn(runIrisPipeline);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["iris-pipeline-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });

  const runMut = useMutation({
    mutationFn: (jobname: string) => runPipeline({ data: { jobname } }),
    onSuccess: (res, jobname) => {
      if (res.ok) {
        toast.success(`${jobname} → ${res.status} (${res.durationMs}ms)`);
      } else {
        toast.error(`${jobname} → ${res.status || "no response"}: ${res.body?.slice(0, 200) ?? ""}`);
      }
      // Give cron.job_run_details a beat to record, then refresh.
      setTimeout(() => qc.invalidateQueries({ queryKey: ["iris-pipeline-status"] }), 2000);
    },
    onError: (e: any) => toast.error(e?.message ?? "Run failed"),
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" /> IRIS Health
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Status, recent runs, and manual triggers for every IRIS pipeline cron job. Auto-refreshes every 30s.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-4 text-[14px] text-red-300">
          {(error as Error).message}
        </div>
      )}

      {isLoading ? (
        <div className="text-[14px] text-muted-foreground">Loading pipeline status…</div>
      ) : (
        <div className="space-y-3">
          {(data?.jobs ?? []).map((job) => (
            <PipelineCard
              key={job.jobid}
              job={job}
              onRun={() => runMut.mutate(job.jobname)}
              running={runMut.isPending && runMut.variables === job.jobname}
            />
          ))}
          {(data?.jobs ?? []).length === 0 && (
            <p className="text-[14px] text-muted-foreground">No IRIS pipelines found in cron.job.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineCard({
  job,
  onRun,
  running,
}: {
  job: Awaited<ReturnType<typeof getIrisPipelineStatus>>["jobs"][number];
  onRun: () => void;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const last = job.runs[0];
  const badge = statusBadge(last?.status ?? "");
  const Icon = badge.icon;
  const lastSuccess = job.runs.find((r) => r.status?.toLowerCase() === "succeeded");

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 flex items-start gap-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Toggle logs"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-[14px] font-medium text-foreground">{job.jobname}</code>
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>
              <Icon className="h-3 w-3" />
              {last?.status ?? "no runs"}
            </span>
            {!job.active && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">
                inactive
              </span>
            )}
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>schedule: <code className="text-foreground/80">{job.schedule}</code></span>
            <span>last run: {fmtAgo(last?.start_time)}</span>
            <span>last success: {fmtAgo(lastSuccess?.start_time)}</span>
            {job.hookPath ? (
              <span>hook: <code className="text-foreground/80">{job.hookPath}</code></span>
            ) : (
              <span className="text-amber-400/80">no public hook (SQL-only)</span>
            )}
          </div>
        </div>

        <Button
          size="sm"
          variant="default"
          onClick={onRun}
          disabled={running || !job.hookPath}
          title={job.hookPath ? "Trigger this pipeline now" : "This job has no public hook to call"}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
          Run now
        </Button>
      </div>

      {open && (
        <div className="border-t bg-background/40 px-4 py-3">
          <p className="text-[12px]   text-muted-foreground mb-2">
            Last {job.runs.length} runs
          </p>
          {job.runs.length === 0 ? (
            <p className="text-[12px] text-muted-foreground italic">No run history yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {job.runs.map((r) => {
                const b = statusBadge(r.status);
                const Bi = b.icon;
                return (
                  <li key={r.runid} className="text-[12px] flex items-start gap-2 font-mono">
                    <span className={`inline-flex items-center gap-1 px-1.5 rounded border ${b.cls} shrink-0`}>
                      <Bi className="h-3 w-3" />
                      {r.status}
                    </span>
                    <span className="text-muted-foreground shrink-0 w-44">{fmtTime(r.start_time)}</span>
                    <span className="text-foreground/70 truncate flex-1" title={r.return_message ?? ""}>
                      {(r.return_message ?? "").slice(0, 200) || "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
