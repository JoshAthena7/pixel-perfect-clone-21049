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
  .handler(async ({ data, context }) => {
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

    // Conflict-of-interest scan: surface other active missions on the same
    // state + procurement_id. Non-fatal — logged into results so the caller
    // (Olympus dashboard, etc.) can render an alert.
    let conflicts: Array<{ id: string; name: string; client: string }> = [];
    try {
      const { supabase } = context;
      const { data: m } = await supabase
        .from("missions")
        .select("state,procurement_id")
        .eq("id", data.missionId)
        .maybeSingle();
      if (m?.state && m?.procurement_id) {
        const { data: others } = await supabase
          .from("missions")
          .select("id,name,client,status")
          .eq("state", m.state)
          .eq("procurement_id", m.procurement_id)
          .neq("id", data.missionId)
          .in("status", ["Active", "active", "Open", "open", "in_progress"]);
        conflicts = (others ?? []).map((o) => ({ id: o.id, name: o.name, client: o.client }));
      }
    } catch (e) {
      console.warn("conflict scan failed", (e as Error).message);
    }

    return { ranAt: new Date().toISOString(), results, conflicts };
  });
