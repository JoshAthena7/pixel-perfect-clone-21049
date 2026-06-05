import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Returns the live ingestion counts that IRIS sees on every prompt.
 * Surfaced as a visible badge so writers can confirm Canon + Oracle are
 * actually flowing into IRIS context (not silently empty).
 */
export const getIrisIngestionCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ missionId: z.string().uuid().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const missionId = data.missionId ?? null;

    let state: string | null = null;
    let program: string | null = null;
    if (missionId) {
      const { data: m } = await supabase
        .from("missions")
        .select("state,program_type")
        .eq("id", missionId)
        .maybeSingle();
      state = m?.state ?? null;
      program = m?.program_type ?? null;
    }

    const [canon, stateIntel, programIntel, memories, oracle, vault] = await Promise.all([
      supabase.from("intelligence_canon").select("id", { count: "exact", head: true }).eq("is_active", true),
      state
        ? supabase.from("state_intelligence").select("id", { count: "exact", head: true }).eq("state_code", state)
        : Promise.resolve({ count: 0 }),
      program
        ? supabase.from("program_intelligence").select("id", { count: "exact", head: true }).eq("is_active", true).ilike("program_name", `%${program}%`)
        : Promise.resolve({ count: 0 }),
      supabase.from("iris_memories").select("id", { count: "exact", head: true }),
      missionId
        ? supabase.from("briefing_book_sections").select("id", { count: "exact", head: true }).eq("mission_id", missionId)
        : Promise.resolve({ count: 0 }),
      missionId
        ? supabase.from("mission_library").select("id", { count: "exact", head: true }).eq("mission_id", missionId)
        : Promise.resolve({ count: 0 }),
    ]);

    return {
      canon: canon.count ?? 0,
      stateIntel: stateIntel.count ?? 0,
      programIntel: programIntel.count ?? 0,
      memories: memories.count ?? 0,
      oracle: oracle.count ?? 0,
      vault: vault.count ?? 0,
    };
  });
