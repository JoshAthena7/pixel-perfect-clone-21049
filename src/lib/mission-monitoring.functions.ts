import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the suggested monitoring watchlist for a state + opportunity type.
 * Sources are stable across missions but admins can add custom URLs.
 */
export function defaultWatchlist(state: string | null, programType: string | null) {
  const base = [
    { source_type: "federal", label: "SAM.gov contract opportunities", url: "https://sam.gov/opp/" },
    { source_type: "federal", label: "Federal Register — healthcare", url: "https://www.federalregister.gov/topics/health-and-public-welfare" },
    { source_type: "federal", label: "CMS Newsroom", url: "https://www.cms.gov/newsroom" },
    { source_type: "federal", label: "SAMHSA news", url: "https://www.samhsa.gov/newsroom" },
    { source_type: "federal", label: "HHS news", url: "https://www.hhs.gov/about/news/" },
    { source_type: "industry", label: "Competitor news (manual queries)", url: null },
  ];
  if (state) {
    const s = state.toUpperCase();
    base.unshift({ source_type: "state", label: `${s} procurement portal`, url: null });
    base.push({ source_type: "state", label: `${s} DCF / Child Welfare agency`, url: null });
    base.push({ source_type: "state", label: `${s} state legislature`, url: null });
  }
  if (programType && /csa|aso|behavioral/i.test(programType)) {
    base.push({ source_type: "industry", label: "CSA / ASO trade press", url: null });
  }
  return base;
}

export const seedMonitoringWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("mission_monitoring_sources").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId);
    if ((existing as any)?.length) return { seeded: 0 };

    const { data: mission } = await supabase
      .from("missions").select("state,program_type").eq("id", data.missionId).maybeSingle();
    const rows = defaultWatchlist(mission?.state ?? null, mission?.program_type ?? null).map((r) => ({
      ...r,
      mission_id: data.missionId,
      frequency: "daily" as const,
      enabled: true,
    }));
    const { error } = await supabase.from("mission_monitoring_sources").insert(rows);
    if (error) throw new Error(error.message);
    return { seeded: rows.length };
  });

export const saveMonitoringSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid(),
      id: z.string().uuid().optional(),
      source_type: z.string().min(1).max(50),
      label: z.string().min(1).max(200),
      url: z.string().url().nullable().optional(),
      frequency: z.enum(["daily", "weekly"]),
      enabled: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      mission_id: data.missionId,
      source_type: data.source_type,
      label: data.label,
      url: data.url ?? null,
      frequency: data.frequency,
      enabled: data.enabled,
    };
    if (data.id) {
      const { error } = await supabase.from("mission_monitoring_sources").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("mission_monitoring_sources").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteMonitoringSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("mission_monitoring_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
