import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ingestMarketIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ingestIndustryIntelligence } = await import("./intel-ingest.server");
    const result = await ingestIndustryIntelligence();
    await context.supabase.from("olympus_audit_log").insert({
      user_id: context.userId,
      action_type: "market_intel_ingested",
      action_summary: `Ingested ${result.inserted} new industry items (${result.enriched} enriched)`,
      target_table: "market_intelligence",
    });
    return result;
  });
