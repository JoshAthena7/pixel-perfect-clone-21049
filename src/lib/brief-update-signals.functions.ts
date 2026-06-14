import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BriefSection = "north_star" | "win_themes" | "flight_risks";

export const getBriefUpdateSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { missionId: string }) =>
    z.object({ missionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("brief_update_signals")
      .select("id, affected_sections, reason, created_at")
      .eq("mission_id", data.missionId)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("[brief-update-signals] read failed", error.message);
      return { sections: {} as Record<string, { count: number; reasons: string[] }> };
    }
    const map: Record<string, { count: number; reasons: string[] }> = {};
    for (const r of (rows ?? []) as {
      affected_sections: string[] | null;
      reason: string | null;
    }[]) {
      for (const s of r.affected_sections ?? []) {
        if (!map[s]) map[s] = { count: 0, reasons: [] };
        map[s].count += 1;
        if (r.reason && map[s].reasons.length < 3) map[s].reasons.push(r.reason);
      }
    }
    return { sections: map };
  });

export const dismissBriefUpdateSignalsForSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { missionId: string; section: BriefSection }) =>
    z
      .object({
        missionId: z.string().uuid(),
        section: z.enum(["north_star", "win_themes", "flight_risks"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("brief_update_signals")
      .update({ dismissed: true })
      .eq("mission_id", data.missionId)
      .eq("dismissed", false)
      .contains("affected_sections", [data.section]);
    if (error) {
      console.error("[brief-update-signals] dismiss failed", error.message);
      return { ok: false };
    }
    return { ok: true };
  });
