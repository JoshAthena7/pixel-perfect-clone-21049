/**
 * Server fn: trigger Mission Brief auto-enrichment (3 Perplexity calls).
 * Called fire-and-forget from the wizard launch step and from an
 * "Enrich with IRIS" admin button.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ missionId: z.string().uuid() });

export const enrichMissionWithPerplexity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    // Load the mission (RLS scoped to the caller).
    const { data: mission, error } = await context.supabase
      .from("missions")
      .select("id, state, state_code, program_type, prime_contractor, known_competitors")
      .eq("id", data.missionId)
      .maybeSingle();
    if (error || !mission) {
      return { ok: false as const, reason: "mission_not_found" };
    }

    // Pick incumbent: prefer prime_contractor, else first known competitor.
    const competitors = Array.isArray(mission.known_competitors) ? mission.known_competitors : [];
    const incumbent =
      (mission.prime_contractor && String(mission.prime_contractor).trim()) ||
      (competitors[0] ? String(competitors[0]) : null);

    // Population proxy: program_type until a dedicated field exists.
    const population = mission.program_type ?? null;

    // Run in the background so the caller can return immediately.
    void (async () => {
      try {
        const { enrichMissionBrief } = await import("./perplexity-enrich.server");
        await enrichMissionBrief({
          missionId: mission.id,
          state: mission.state ?? null,
          stateCode: mission.state_code ?? null,
          programType: mission.program_type ?? null,
          incumbent,
          population,
        });
      } catch (e) {
        console.error("[perplexity-enrich] background failure", e);
      }
    })();

    return { ok: true as const };
  });
