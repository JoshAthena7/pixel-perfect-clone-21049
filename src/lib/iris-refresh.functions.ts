import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resetCircuit, getCircuitState } from "@/lib/ai-circuit-breaker";

/**
 * One-button "Refresh IRIS" for Olympus.
 * - Clears the iris_brief_cache table (lobby + mission briefs, coaching, etc.)
 * - Resets the in-memory AI circuit breaker on this worker isolate.
 */
export const refreshIris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    let cleared = 0;
    const { data, error } = await supabase
      .from("iris_brief_cache")
      .delete()
      .not("id", "is", null)
      .select("id");
    if (!error && data) cleared = data.length;

    resetCircuit();

    return {
      ok: true,
      cleared_cache_rows: cleared,
      circuit: getCircuitState(),
      cache_error: error?.message ?? null,
    };
  });
