/**
 * Admin one-button "Refresh IRIS" for a single mission.
 * Fans out every IRIS enrichment pipeline in parallel and returns a per-task
 * status summary. Failures in any one pipeline never abort the others —
 * we use Promise.allSettled and surface per-task error messages.
 *
 * Pipelines:
 *  1. Perplexity mission enrichment   (sonar-pro)
 *  2. Perplexity academic sweep        (global, sonar-pro + searchMode:'academic')
 *  3. Gemini brief regeneration        (launch brief + oracle mission brief + IRIS sweep + monitoring feeds)
 *  4. Firecrawl intel_sources rescan   (re-scrape every URL in the mission's intel network)
 *  5. Cache clear                      (iris_brief_cache + circuit reset)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resetCircuit } from "@/lib/ai-circuit-breaker";

import { enrichMissionWithPerplexity } from "@/lib/iris/perplexity-enrich.functions";
import { runIrisSweep } from "@/lib/iris-sweep.functions";
import { refreshAllMissionFeeds } from "@/lib/iris-refresh-all.functions";
import { triggerLaunchBrief } from "@/lib/iris-launch-brief.functions";
import { generateMissionBrief } from "@/lib/oracle.functions";
import { scanSeededIntelSources } from "@/lib/intel-network-seed.functions";

const InputSchema = z.object({ missionId: z.string().uuid() });

type TaskResult = {
  task: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
};

async function timed<T>(task: string, fn: () => Promise<T>, detail?: (v: T) => string): Promise<TaskResult> {
  const t0 = Date.now();
  try {
    const v = await fn();
    return { task, ok: true, ms: Date.now() - t0, detail: detail?.(v) };
  } catch (e) {
    return {
      task,
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const refreshIrisAllForMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { missionId } = data;

    // Verify caller is platform admin or has 'admin' role.
    const userId = context.userId;
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", userId).maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) {
      throw new Error("Forbidden — admin only.");
    }

    // Pre-fetch intel_sources URLs for the Firecrawl rescan task.
    const { data: sources } = await supabase
      .from("intel_sources")
      .select("url, scrape_url")
      .eq("mission_id", missionId);
    const urls = Array.from(
      new Set(
        (sources ?? [])
          .map((s) => s.url ?? s.scrape_url)
          .filter((u): u is string => !!u && /^https?:\/\//i.test(u)),
      ),
    ).slice(0, 200);

    // Academic sweep is mission-agnostic; invoke the cron endpoint server-side.
    const academicSweep = async () => {
      const secret = process.env.CRON_HOOK_SECRET;
      if (!secret) {
        return { skipped: "CRON_HOOK_SECRET not configured" };
      }
      const base =
        process.env.PUBLIC_SITE_URL ??
        process.env.VITE_PUBLIC_SITE_URL ??
        "https://pixel-perfect-clone-21049.lovable.app";
      const r = await fetch(`${base}/api/public/hooks/iris-academic-sweep`, {
        method: "POST",
        headers: { "x-cron-secret": secret, "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error(`academic sweep ${r.status}`);
      return await r.json().catch(() => ({}));
    };

    // Cache clear (lightweight, fire inline).
    const cacheClear = async () => {
      const { data: cleared } = await supabase
        .from("iris_brief_cache")
        .delete()
        .not("id", "is", null)
        .select("id");
      resetCircuit();
      return { cleared: cleared?.length ?? 0 };
    };

    const tasks: Promise<TaskResult>[] = [
      timed("perplexity_mission_enrich", () =>
        enrichMissionWithPerplexity({ data: { missionId } }),
      ),
      timed("perplexity_academic_sweep", academicSweep, (v: any) =>
        v?.skipped ? `skipped: ${v.skipped}` : "ok",
      ),
      timed("gemini_iris_sweep", () => runIrisSweep({ data: { missionId } })),
      timed("gemini_monitoring_feeds", () => refreshAllMissionFeeds({ data: { missionId } })),
      timed("gemini_launch_brief", () => triggerLaunchBrief({ data: { missionId } })),
      timed("gemini_oracle_brief", () => generateMissionBrief({ data: { missionId } })),
      timed(
        "firecrawl_intel_rescan",
        async () => {
          if (urls.length === 0) return { skipped: "no intel_sources" };
          return await scanSeededIntelSources({ data: { missionId, urls } });
        },
        (v: any) => (v?.skipped ? `skipped: ${v.skipped}` : `${urls.length} URLs`),
      ),
      timed("cache_clear", cacheClear, (v) => `cleared ${v.cleared}`),
    ];

    const results = await Promise.all(tasks);
    const okCount = results.filter((r) => r.ok).length;
    return {
      ok: true,
      mission_id: missionId,
      summary: { total: results.length, succeeded: okCount, failed: results.length - okCount },
      results,
    };
  });
