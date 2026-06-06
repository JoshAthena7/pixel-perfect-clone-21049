import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { extractSignals } from "./signals.functions";
import { extractRisks } from "./risks.functions";
import { extractWinThemes } from "./win-themes.functions";
import { extractStrategy } from "./strategy.functions";
import { extractClientIntel } from "./client-intel.functions";

type StageResult = {
  stage: string;
  ok: boolean;
  inserted: number;
  skipped?: boolean;
  reason?: string;
  ms: number;
  error?: string;
};

/**
 * Run all 5 IRIS extractors for a mission, sequentially to be polite to the
 * gateway rate limit. Returns per-stage status; never throws so one bad
 * stage doesn't kill the others.
 */
export const runIrisPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const stages = [
      { name: "signals", fn: extractSignals },
      { name: "risks", fn: extractRisks },
      { name: "win_themes", fn: extractWinThemes },
      { name: "strategy", fn: extractStrategy },
      { name: "client_intel", fn: extractClientIntel },
    ] as const;

    const results: StageResult[] = [];
    for (const s of stages) {
      try {
        const r = (await s.fn({ data: { missionId: data.missionId } })) as {
          stage: string;
          inserted: number;
          skipped?: boolean;
          reason?: string;
          ms: number;
        };
        results.push({ stage: r.stage, ok: true, inserted: r.inserted, skipped: r.skipped, reason: r.reason, ms: r.ms });
      } catch (e) {
        results.push({
          stage: s.name,
          ok: false,
          inserted: 0,
          ms: 0,
          error: (e as Error).message.slice(0, 240),
        });
      }
    }

    return { ranAt: new Date().toISOString(), results };
  });
