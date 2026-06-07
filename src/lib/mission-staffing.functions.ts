// Client-callable server functions for the staffing summary.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMissionStaffingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("mission_staffing_summary")
      .select("*")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const refreshMissionStaffingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { computeAndStoreStaffingSummary } = await import("./mission-staffing.server");
    const summary = await computeAndStoreStaffingSummary(supabase, data.missionId, userId);
    return summary;
  });
