import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { refreshIrisAllForMission } from "@/lib/iris-refresh-all-for-mission.functions";
import { seedMissionIntelligence } from "@/lib/iris-seed-mission-intelligence.functions";
import { getIrisPipelineStatus, getIrisWiringSnapshot } from "@/lib/iris-health.functions";
import { backfillSignalEmbeddings } from "@/lib/embeddings-backfill.functions";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  Activity,
  AlertTriangle,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/iris-control")({
  component: IrisControlPage,
});

type TaskResult = {
  task: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
};

const TASK_LABELS: Record<string, string> = {
  perplexity_mission_enrich: "Perplexity · mission enrichment (sonar-pro)",
  perplexity_academic_sweep: "Perplexity · academic sweep",
  gemini_iris_sweep: "Gemini · IRIS intelligence sweep (7 feeds)",
  gemini_monitoring_feeds: "Gemini · monitoring feeds rescan",
  gemini_launch_brief: "Gemini · launch brief",
  gemini_oracle_brief: "Gemini · oracle mission brief",
  firecrawl_intel_rescan: "Firecrawl · intel sources rescan",
  cache_clear: "Cache · clear briefs + reset circuit",
};

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

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
      ? "text-amber-400"
      : tone === "bad"
      ? "text-red-400"
      : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5">
      <div className="text-[11px]  tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-medium ${toneCls}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function HealthDashboard() {
  const fetchStatus = useServerFn(getIrisPipelineStatus);
  const fetchWiring = useServerFn(getIrisWiringSnapshot);

  const status = useQuery({
    queryKey: ["iris-control-pipeline-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });

  const wiring = useQuery({
    queryKey: ["iris-control-wiring"],
    queryFn: () => fetchWiring(),
    refetchInterval: 30_000,
  });

  const w = wiring.data?.counts;
  const jobs = status.data?.jobs ?? [];

  const pipelineTone = (s?: string) => {
    const x = (s ?? "").toLowerCase();
    if (x === "succeeded") return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (x === "failed") return "text-red-400 border-red-500/30 bg-red-500/10";
    if (x === "running" || x === "starting") return "text-blue-400 border-blue-500/30 bg-blue-500/10";
    return "text-muted-foreground border-white/10 bg-white/5";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-400" /> IRIS Health · live dashboard
        </h2>
        <div className="text-[12px] text-muted-foreground">
          {wiring.isFetching || status.isFetching ? "refreshing…" : `updated ${fmtAgo(wiring.data?.generatedAt)}`}
          {" · auto every 30s · "}
          <Link to="/admin/iris-health" className="underline">full health view →</Link>
        </div>
      </div>

      {/* Wiring counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat
          label="Intel events (24h)"
          value={w?.intelEvents24h ?? "—"}
          tone={w && w.intelEvents24h === 0 ? "warn" : "good"}
          hint="Atlas / Intelligence tab"
        />
        <Stat
          label="Feed items (24h)"
          value={w?.feedItems24h ?? "—"}
          hint={`${w?.feedItemsHighRelevance24h ?? 0} ≥60 relevance`}
          tone={w && w.feedItems24h === 0 ? "warn" : "good"}
        />
        <Stat
          label="Active feed configs"
          value={w?.activeFeedConfigs ?? "—"}
          tone={w && w.activeFeedConfigs === 0 ? "bad" : "good"}
        />
        <Stat
          label="IRIS extractions (24h)"
          value={w?.irisExtractions24h ?? "—"}
        />
        <Stat
          label="Launch briefs"
          value={w ? `${w.missionsWithLaunchBriefs}/${w.missionsTotal}` : "—"}
          hint="missions covered"
        />
        <Stat label="Brief cache rows" value={w?.briefCacheRows ?? "—"} />
        <Stat
          label="Open health flags"
          value={w?.openHealthFlags ?? "—"}
          hint={`${w?.highSeverityFlags ?? 0} high/critical`}
          tone={w && w.highSeverityFlags > 0 ? "bad" : w && w.openHealthFlags > 0 ? "warn" : "good"}
        />
        <Stat
          label="Hook failures (24h)"
          value={w?.hookFailures24h ?? "—"}
          hint={`${w?.hookFailuresUnacked ?? 0} unacked`}
          tone={w && w.hookFailures24h > 0 ? "bad" : "good"}
        />
      </div>

      {/* Pipelines */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="mb-2 text-[12px] font-medium text-muted-foreground  tracking-wide">
          Cron pipelines ({jobs.length})
        </div>
        {status.isLoading ? (
          <div className="text-[12px] text-muted-foreground py-2">Loading pipeline status…</div>
        ) : status.error ? (
          <div className="text-[12px] text-red-400 py-2">
            {(status.error as Error).message ?? "Failed to load pipeline status"}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-[12px] text-muted-foreground py-2">No pipelines registered.</div>
        ) : (
          <ul className="divide-y divide-white/5">
            {jobs.map((j: any) => {
              const last = j.runs?.[0];
              return (
                <li key={j.jobid} className="flex items-center gap-3 py-2 text-[12px]">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${pipelineTone(last?.status)}`}
                  >
                    {last?.status ?? "—"}
                  </span>
                  <span className="font-mono text-white/90 flex-1 truncate">{j.jobname}</span>
                  <span className="text-muted-foreground hidden md:inline">{j.schedule}</span>
                  <span className="text-muted-foreground">
                    {j.active ? "active" : "paused"} · last {fmtAgo(last?.start_time)}
                  </span>
                  {!j.hookPath && (
                    <span className="text-[11px] text-amber-400" title="No public hook mapped">
                      no hook
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Two-column: failures + open flags */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[12px] font-medium text-muted-foreground  tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> Recent hook failures
          </div>
          {(wiring.data?.recentHookFailures.length ?? 0) === 0 ? (
            <div className="text-[12px] text-muted-foreground py-1.5">No failures recorded. ✓</div>
          ) : (
            <ul className="space-y-1.5">
              {wiring.data!.recentHookFailures.map((f) => (
                <li key={f.id} className="text-[12px] border-l-2 border-red-500/40 pl-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-white/90 truncate">{f.hook_name ?? "?"}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {f.status_code ?? "—"} · {fmtAgo(f.created_at)}
                      {f.acknowledged_at ? " · ack" : ""}
                    </span>
                  </div>
                  {f.error_message && (
                    <div className="text-[12px] text-red-300/90 truncate">{f.error_message}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[12px] font-medium text-muted-foreground  tracking-wide flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" /> Open IRIS health flags
          </div>
          {(wiring.data?.openFlags.length ?? 0) === 0 ? (
            <div className="text-[12px] text-muted-foreground py-1.5">No open flags. ✓</div>
          ) : (
            <ul className="space-y-1.5">
              {wiring.data!.openFlags.map((f) => {
                const sev = (f.severity ?? "").toLowerCase();
                const sevTone =
                  sev === "critical" || sev === "high"
                    ? "text-red-400 border-red-500/40 bg-red-500/10"
                    : sev === "medium"
                    ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                    : "text-muted-foreground border-white/10 bg-white/5";
                return (
                  <li key={f.id} className="text-[12px]">
                    <div className="flex items-baseline gap-2">
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] ${sevTone}`}>
                        {f.severity ?? "?"}
                      </span>
                      <span className="text-white/90 truncate flex-1">{f.title ?? f.trigger_code ?? "(untitled)"}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{fmtAgo(f.raised_at)}</span>
                    </div>
                    {f.detail && (
                      <div className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5">{f.detail}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function IrisControlPage() {
  const [missionId, setMissionId] = useState<string>("");
  const [filter, setFilter] = useState("");

  const { data: missions, isLoading } = useQuery({
    queryKey: ["admin-iris-control-missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name, client_name, state, status")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return missions ?? [];
    return (missions ?? []).filter((m) =>
      [m.name, m.client_name, m.state].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [missions, filter]);

  // Auto-select the first visible mission so "Refresh IRIS" is usable without
  // an extra click in the listbox.
  useEffect(() => {
    if (missionId) {
      if (filtered.length > 0 && !filtered.some((m) => m.id === missionId)) {
        setMissionId(filtered[0]!.id);
      }
      return;
    }
    if (filtered.length > 0) setMissionId(filtered[0]!.id);
  }, [filtered, missionId]);

  const refreshFn = useServerFn(refreshIrisAllForMission);
  const seedFn = useServerFn(seedMissionIntelligence);
  const mutation = useMutation({
    mutationFn: () => {
      // Fire-and-forget force re-seed (re-runs the people/orgs population stage).
      seedFn({ data: { missionId, force: true } }).catch((e) =>
        console.log("[iris-control] force seed failed", e),
      );
      return refreshFn({ data: { missionId } });
    },
    onSuccess: (res) => {
      toast.success(
        `IRIS refresh complete — ${res.summary.succeeded}/${res.summary.total} tasks ok`,
      );
    },
    onError: (e: Error) => toast.error(`Refresh failed: ${e.message}`),
  });

  const results = (mutation.data?.results ?? []) as TaskResult[];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-500/10 p-2.5">
          <Zap className="h-6 w-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-medium">IRIS Control</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Real-time health of every IRIS pipeline plus a single-button fan-out
            (Perplexity, Gemini briefs, Firecrawl, cache reset) against one mission.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <HealthDashboard />
      </div>

      <BackfillEmbeddingsPanel />


      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground  tracking-wide">
            Mission
          </label>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, client, or state…"
            className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[14px]"
          />
          <select
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            disabled={isLoading}
            className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-[14px]"
            size={Math.min(10, Math.max(4, filtered.length))}
          >
            {filtered.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? "(untitled)"} — {m.client_name ?? "?"} · {m.state ?? "?"} ·{" "}
                {m.status ?? "?"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-[12px] text-muted-foreground">
            {missionId ? (
              <>
                Selected: <span className="font-mono">{missionId.slice(0, 8)}…</span>
              </>
            ) : (
              "Pick a mission above"
            )}
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!missionId || mutation.isPending}
            className="bg-amber-500 text-black hover:bg-amber-400"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing all pipelines…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh IRIS (all pipelines)
              </>
            )}
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-medium">Last run</h2>
            <span className="text-[12px] text-muted-foreground">
              {mutation.data?.summary.succeeded}/{mutation.data?.summary.total} succeeded
            </span>
          </div>
          <ul className="divide-y divide-white/5">
            {results.map((r) => (
              <li key={r.task} className="flex items-start gap-3 py-2.5 text-[14px]">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{TASK_LABELS[r.task] ?? r.task}</span>
                    <span className="text-[12px] font-mono text-muted-foreground">{r.ms}ms</span>
                  </div>
                  {(r.detail || r.error) && (
                    <div
                      className={`mt-0.5 text-[12px] ${r.ok ? "text-muted-foreground" : "text-red-300"}`}
                    >
                      {r.error ?? r.detail}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BackfillEmbeddingsPanel() {
  const backfillFn = useServerFn(backfillSignalEmbeddings);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<{ processed: number; failed: number; batches: number } | null>(
    null,
  );

  const runBackfill = async () => {
    if (running) return;
    setRunning(true);
    setStats({ processed: 0, failed: 0, batches: 0 });
    const totals = { processed: 0, failed: 0, batches: 0 };
    const toastId = toast.loading("Backfilling signal embeddings…");
    try {
      // Loop until the server reports no more pending signals.
      // Cap at 40 batches (~2,000 signals) per click to bound runtime.
      for (let i = 0; i < 40; i++) {
        const res = await backfillFn({ data: { limit: 50 } });
        totals.processed += res.processed;
        totals.failed += res.failed;
        totals.batches += 1;
        setStats({ ...totals });
        toast.loading(
          `Batch ${totals.batches} · ${totals.processed} embedded · ${totals.failed} failed`,
          { id: toastId },
        );
        if (res.total === 0 || res.remaining === 0) break;
      }
      toast.success(
        `Backfill complete — ${totals.processed} signals embedded across ${totals.batches} batch(es)` +
          (totals.failed ? ` (${totals.failed} failed)` : ""),
        { id: toastId },
      );
    } catch (err) {
      toast.error(`Backfill failed: ${(err as Error).message}`, { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" /> Backfill signal embeddings
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground max-w-xl">
            Generates vector embeddings for oracle signals that don't have one yet so they can
            participate in hybrid semantic search. Safe to re-run — only signals without an
            embedding are processed.
          </p>
          {stats && (
            <div className="mt-2 text-[12px] font-mono text-muted-foreground">
              {stats.batches} batch(es) · {stats.processed} embedded · {stats.failed} failed
            </div>
          )}
        </div>
        <Button
          onClick={runBackfill}
          disabled={running}
          variant="outline"
          className="shrink-0 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
        >
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Embedding…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Backfill Embeddings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
