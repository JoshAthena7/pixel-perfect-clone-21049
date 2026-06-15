import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily ATLAS health recalculation.
 *
 * Runs once per day at 10:00 UTC (06:00 ET) via pg_cron. Recomputes
 * health for every non-withdrawn question on every active mission.
 * Per-question failures are isolated so one bad row does not abort the run.
 */
export const Route = createFileRoute("/api/public/hooks/atlas-daily-health-recalc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recalculateMissionHealth } = await import("@/lib/atlas-health.server");

        const { data: missions, error } = await supabaseAdmin
          .from("missions")
          .select("id, name")
          .in("status", ["active", "pens_down"]);
        if (error) {
          return new Response(`Mission lookup failed: ${error.message}`, { status: 500 });
        }

        let totalProcessed = 0;
        const perMission: Record<string, { processed: number; errors: number }> = {};
        for (const m of (missions ?? []) as any[]) {
          try {
            const res = await recalculateMissionHealth(supabaseAdmin, m.id, {
              onlyStale: false,
              limit: 500,
            });
            totalProcessed += res.processed;
            perMission[m.id] = { processed: res.processed, errors: res.errors };
          } catch (err: any) {
            console.error(`[atlas-daily-health-recalc] mission ${m.id} failed`, err);
            perMission[m.id] = { processed: 0, errors: 1 };
          }
        }

        const summary = {
          ok: true,
          missions_considered: missions?.length ?? 0,
          questions_processed: totalProcessed,
          per_mission: perMission,
        };
        console.log("[atlas-daily-health-recalc]", JSON.stringify(summary));
        return new Response(JSON.stringify(summary), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
