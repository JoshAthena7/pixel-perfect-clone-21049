/**
 * Admin-only server functions for the ORACLE pipeline:
 *
 *   - runOracleStage({ stage }): manually trigger one of the three pipeline
 *     stages (scraper / classifier / promoter). Admin role required.
 *   - getOraclePipelineStatus(): aggregated stats from oracle_source_registry
 *     and oracle_ingestion_queue for the Pipeline Status panel.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StageInput = z.object({
  stage: z.enum(["scraper", "classifier", "promoter"]),
});

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data, error } = await (context.supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>;
  }).rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error("role check failed");
  if (!data) throw new Error("Forbidden — admin role required");
}

export const runOracleStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StageInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runScraper, runClassifier, runPromoter } = await import("@/lib/oracle/pipeline.server");
    if (data.stage === "scraper") return await runScraper();
    if (data.stage === "classifier") return await runClassifier();
    return await runPromoter();
  });

export const getOraclePipelineStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: sources }, { data: queue }] = await Promise.all([
      supabaseAdmin
        .from("oracle_source_registry")
        .select("id, source_name, source_type, state_code, status, last_checked_at, error_count, error_message")
        .order("source_name", { ascending: true }),
      supabaseAdmin
        .from("oracle_ingestion_queue")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("status, ingested_at, classified_at, promoted_at" as any)
        .order("ingested_at", { ascending: false })
        .limit(2000),
    ]);

    const counts: Record<string, number> = {
      pending: 0,
      classifying: 0,
      classified: 0,
      dismissed: 0,
      promoted: 0,
      error: 0,
    };
    let lastScrape: string | null = null;
    let lastClassify: string | null = null;
    let lastPromote: string | null = null;
    for (const row of (queue ?? []) as unknown as Array<{
      status: string;
      ingested_at: string | null;
      classified_at: string | null;
      promoted_at: string | null;
    }>) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      if (row.ingested_at && (!lastScrape || row.ingested_at > lastScrape)) lastScrape = row.ingested_at;
      if (row.classified_at && (!lastClassify || row.classified_at > lastClassify)) lastClassify = row.classified_at;
      if (row.promoted_at && (!lastPromote || row.promoted_at > lastPromote)) lastPromote = row.promoted_at;
    }

    // Source last_checked_at MAX is the better scraper-run signal
    const lastSourceCheck = (sources ?? []).reduce<string | null>((acc, s) => {
      const lc = (s as { last_checked_at: string | null }).last_checked_at;
      if (lc && (!acc || lc > acc)) return lc;
      return acc;
    }, null);

    return {
      last_scraper_run: lastSourceCheck ?? lastScrape,
      last_classifier_run: lastClassify,
      last_promoter_run: lastPromote,
      queue_counts: counts,
      sources: (sources ?? []) as Array<{
        id: string;
        source_name: string;
        source_type: string;
        state_code: string | null;
        status: string;
        last_checked_at: string | null;
        error_count: number;
        error_message: string | null;
      }>,
    };
  });
