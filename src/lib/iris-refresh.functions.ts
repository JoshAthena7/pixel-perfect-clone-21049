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
    const { supabase, userId } = context;

    // Admin only — this wipes the brief cache across every mission and
    // resets the global AI circuit breaker.
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      throw new Error("Forbidden — admin only.");
    }

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
