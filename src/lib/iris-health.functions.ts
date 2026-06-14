import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";

export type PipelineJob = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  hookPath: string | null;
};

export type PipelineRun = {
  runid: number;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
};

// Maps cron job name → hook path. Jobs without a public hook (SQL-only or
// internal) are still listed but have a disabled Run Now button.
const JOB_HOOK_PATHS: Record<string, string> = {
  "generate-daily-briefs": "/api/public/hooks/generate-daily-briefs",
  "iris-daily-intelligence-refresh": "/api/public/hooks/refresh-intelligence-graph",
  "iris-refresh-intelligence-graph": "/api/public/hooks/refresh-intelligence-graph",
  "iris-monitor-hourly": "/api/public/hooks/iris-monitor",
  "iris-monitor-state-feeds": "/api/public/hooks/monitor-state-feeds",
  "iris-monitor-research-feeds": "/api/public/hooks/monitor-research-feeds",
  "iris-monitor-cms-feeds": "/api/public/hooks/monitor-cms-feeds",
  "iris-monitor-custom-feeds": "/api/public/hooks/monitor-custom-feeds",
  "iris-academic-sweep-weekly": "/api/public/hooks/iris-academic-sweep",
};

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const getIrisPipelineStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const { data: jobs, error: jobsErr } = await supabase.rpc("iris_pipeline_jobs");
    if (jobsErr) throw new Error(jobsErr.message);

    const jobList = (jobs ?? []) as any[];
    const runsResults = await Promise.all(
      jobList.map((j) =>
        supabase
          .rpc("iris_pipeline_recent_runs", { _jobid: j.jobid, _limit: 5 })
          .then((r: any) => ({ jobid: j.jobid, runs: r.data ?? [], error: r.error }))
          .catch((e: any) => ({ jobid: j.jobid, runs: [], error: e })),
      ),
    );
    const runsByJob = new Map<number, any[]>(
      runsResults.map((r) => [Number(r.jobid), r.runs]),
    );

    const out: Array<PipelineJob & { runs: PipelineRun[] }> = jobList.map((j) => ({
      jobid: Number(j.jobid),
      jobname: j.jobname,
      schedule: j.schedule,
      active: j.active,
      hookPath: JOB_HOOK_PATHS[j.jobname] ?? null,
      runs: (runsByJob.get(Number(j.jobid)) ?? []).map((r: any) => ({
        runid: Number(r.runid),
        status: r.status,
        return_message: r.return_message,
        start_time: r.start_time,
        end_time: r.end_time,
      })),
    }));
    return { jobs: out };

  });

export const runIrisPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobname: string }) => {
    if (!data?.jobname || typeof data.jobname !== "string") {
      throw new Error("jobname required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const hookPath = JOB_HOOK_PATHS[data.jobname];
    if (!hookPath) throw new Error(`No public hook mapped for job: ${data.jobname}`);

    const host = getRequestHost();
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const url = `${proto}://${host}${hookPath}`;

    const startedAt = Date.now();
    let status = 0;
    let body = "";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      status = res.status;
      body = (await res.text()).slice(0, 1000);
    } catch (e: any) {
      return {
        ok: false,
        url,
        status: 0,
        durationMs: Date.now() - startedAt,
        body: `fetch failed: ${e?.message ?? "unknown"}`,
      };
    }

    return {
      ok: status >= 200 && status < 300,
      url,
      status,
      durationMs: Date.now() - startedAt,
      body,
    };
  });

export type WiringSnapshot = {
  windowHours: number;
  generatedAt: string;
  counts: {
    intelEvents24h: number;
    feedItems24h: number;
    feedItemsHighRelevance24h: number;
    activeFeedConfigs: number;
    irisExtractions24h: number;
    briefCacheRows: number;
    missionsWithLaunchBriefs: number;
    missionsTotal: number;
    openHealthFlags: number;
    highSeverityFlags: number;
    hookFailures24h: number;
    hookFailuresUnacked: number;
  };
  recentHookFailures: Array<{
    id: string;
    hook_name: string | null;
    status_code: number | null;
    error_message: string | null;
    created_at: string;
    acknowledged_at: string | null;
  }>;
  openFlags: Array<{
    id: string;
    severity: string | null;
    trigger_code: string | null;
    title: string | null;
    detail: string | null;
    mission_id: string | null;
    raised_at: string | null;
  }>;
};

export const getIrisWiringSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WiringSnapshot> => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const c = (q: any) => q.then((r: any) => r.count ?? 0).catch(() => 0);

    const [
      intelEvents24h,
      feedItems24h,
      feedItemsHigh,
      activeFeedConfigs,
      irisExtractions24h,
      briefCacheRows,
      missionsWithLaunchBriefs,
      missionsTotal,
      openHealthFlags,
      highSeverityFlags,
      hookFailures24h,
      hookFailuresUnacked,
      recentFailuresRes,
      openFlagsRes,
    ] = await Promise.all([
      c(supabaseAdmin.from("intel_events").select("id", { count: "exact", head: true }).gte("created_at", since)),
      c(supabaseAdmin.from("intelligence_feed_items").select("id", { count: "exact", head: true }).gte("created_at", since)),
      c(supabaseAdmin.from("intelligence_feed_items").select("id", { count: "exact", head: true }).gte("created_at", since).gte("iris_relevance_score", 60)),
      c(supabaseAdmin.from("intelligence_feed_configs").select("id", { count: "exact", head: true }).eq("is_active", true)),
      c(supabaseAdmin.from("mission_iris_extractions").select("id", { count: "exact", head: true }).gte("created_at", since)),
      c(supabaseAdmin.from("iris_brief_cache").select("mission_id", { count: "exact", head: true })),
      c(supabaseAdmin.from("mission_launch_briefs").select("mission_id", { count: "exact", head: true })),
      c(supabaseAdmin.from("missions").select("id", { count: "exact", head: true })),
      c(supabaseAdmin.from("iris_health_flags").select("id", { count: "exact", head: true }).eq("status", "open")),
      c(supabaseAdmin.from("iris_health_flags").select("id", { count: "exact", head: true }).eq("status", "open").in("severity", ["high", "critical"])),
      c(supabaseAdmin.from("hook_failures").select("id", { count: "exact", head: true }).gte("created_at", since)),
      c(supabaseAdmin.from("hook_failures").select("id", { count: "exact", head: true }).is("acknowledged_at", null)),
      supabaseAdmin
        .from("hook_failures")
        .select("id, hook_name, status_code, error_message, created_at, acknowledged_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("iris_health_flags")
        .select("id, severity, trigger_code, title, detail, mission_id, raised_at")
        .eq("status", "open")
        .order("raised_at", { ascending: false })
        .limit(10),
    ]);

    return {
      windowHours: 24,
      generatedAt: new Date().toISOString(),
      counts: {
        intelEvents24h,
        feedItems24h,
        feedItemsHighRelevance24h: feedItemsHigh,
        activeFeedConfigs,
        irisExtractions24h,
        briefCacheRows,
        missionsWithLaunchBriefs,
        missionsTotal,
        openHealthFlags,
        highSeverityFlags,
        hookFailures24h,
        hookFailuresUnacked,
      },
      recentHookFailures: (recentFailuresRes?.data ?? []) as any,
      openFlags: (openFlagsRes?.data ?? []) as any,
    };
  });
