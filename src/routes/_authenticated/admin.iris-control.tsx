import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { refreshIrisAllForMission } from "@/lib/iris-refresh-all-for-mission.functions";
import { RefreshCw, Loader2, CheckCircle2, XCircle, Zap } from "lucide-react";
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

  const refreshFn = useServerFn(refreshIrisAllForMission);
  const mutation = useMutation({
    mutationFn: () => refreshFn({ data: { missionId } }),
    onSuccess: (res) => {
      toast.success(
        `IRIS refresh complete — ${res.summary.succeeded}/${res.summary.total} tasks ok`,
      );
    },
    onError: (e: Error) => toast.error(`Refresh failed: ${e.message}`),
  });

  const results = (mutation.data?.results ?? []) as TaskResult[];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-500/10 p-2.5">
          <Zap className="h-6 w-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">IRIS Control</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Single button to fan out every IRIS enrichment pipeline — Perplexity,
            Gemini briefs, Firecrawl rescan, and cache reset — against one mission.
            Tasks run in parallel; failures in one pipeline never abort the others.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Mission
          </label>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, client, or state…"
            className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"
          />
          <select
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            disabled={isLoading}
            className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm"
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
          <div className="text-xs text-muted-foreground">
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
            <h2 className="text-sm font-semibold">Last run</h2>
            <span className="text-xs text-muted-foreground">
              {mutation.data?.summary.succeeded}/{mutation.data?.summary.total} succeeded
            </span>
          </div>
          <ul className="divide-y divide-white/5">
            {results.map((r) => (
              <li key={r.task} className="flex items-start gap-3 py-2.5 text-sm">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{TASK_LABELS[r.task] ?? r.task}</span>
                    <span className="text-xs font-mono text-muted-foreground">{r.ms}ms</span>
                  </div>
                  {(r.detail || r.error) && (
                    <div
                      className={`mt-0.5 text-xs ${r.ok ? "text-muted-foreground" : "text-red-300"}`}
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
