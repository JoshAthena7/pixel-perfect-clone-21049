// Atlas Sources — server functions for the 5-layer source library.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KnowledgeLayer = z.enum(["canon", "state", "program", "mission", "collective"]);

/** List atlas sources, optionally filtered by layer / state / program / mission / search. */
export const listAtlasSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      layer: KnowledgeLayer.optional(),
      stateCode: z.string().optional(),
      programCode: z.string().optional(),
      missionId: z.string().uuid().optional(),
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("atlas_sources")
      .select("id,source_id,knowledge_layer,source_title,source_url,source_type,issuing_authority,authority_score,status,library_category,tags,programs_applicable,states_applicable,state_code,program_code,summary,needs_human_review,date_last_ingested,created_at")
      .order("authority_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (data.layer) q = q.eq("knowledge_layer", data.layer);
    if (data.stateCode) q = q.eq("state_code", data.stateCode);
    if (data.programCode) q = q.eq("program_code", data.programCode);
    if (data.missionId) q = q.eq("mission_id", data.missionId);
    if (data.search && data.search.trim()) {
      const s = data.search.trim();
      q = q.or(`source_title.ilike.%${s}%,summary.ilike.%${s}%`);
    }

    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return { sources: rows ?? [] };
  });

/** Layer counts for the summary bar. */
export const layerCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      stateCode: z.string().optional(),
      programCode: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const layers = ["canon", "state", "program", "mission", "collective"] as const;
    const counts: Record<string, number> = {};
    for (const l of layers) {
      let q = supabase.from("atlas_sources").select("id", { count: "exact", head: true }).eq("knowledge_layer", l);
      if (l === "state" && data.stateCode) q = q.eq("state_code", data.stateCode);
      if (l === "program" && data.programCode) q = q.eq("program_code", data.programCode);
      const { count } = await q;
      counts[l] = count ?? 0;
    }
    return counts;
  });

/** Upsert an Atlas source (admin-managed). */
export const upsertAtlasSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      knowledge_layer: KnowledgeLayer,
      source_title: z.string().min(2),
      source_url: z.string().url().optional().or(z.literal("")),
      source_type: z.string().optional(),
      issuing_authority: z.string().optional(),
      authority_score: z.number().int().min(1).max(10).optional(),
      library_category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      state_code: z.string().optional().nullable(),
      program_code: z.string().optional().nullable(),
      mission_id: z.string().uuid().optional().nullable(),
      summary: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload: any = {
      knowledge_layer: data.knowledge_layer,
      source_title: data.source_title,
      source_url: data.source_url || null,
      source_type: data.source_type || null,
      issuing_authority: data.issuing_authority || null,
      authority_score: data.authority_score ?? null,
      library_category: data.library_category || null,
      tags: data.tags ?? [],
      state_code: data.state_code || null,
      program_code: data.program_code || null,
      mission_id: data.mission_id || null,
      summary: data.summary || null,
      ingested_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabase.from("atlas_sources").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("atlas_sources").insert(payload).select("id,source_title,summary,mission_id,source_raw_text").single();
    if (error) throw new Error(error.message);
    // Fire-and-forget: summarize + embed + cross-match. Don't block the upload UI.
    (async () => {
      try {
        const { enrichAtlasSource } = await import("./atlas-enrich.server");
        await enrichAtlasSource(row as any);
      } catch (e) {
        console.warn("[atlas-enrich] failed", (row as any)?.id, e);
      }
    })();
    // Record contribution event (best-effort).
    try {
      const { recordContribution } = await import("./contributions.server");
      await recordContribution({
        authUserId: userId,
        missionId: (row as any).mission_id ?? null,
        eventType: "source_uploaded",
        targetTable: "atlas_sources",
        targetId: (row as any).id,
        weight: 1,
        idempotencyKey: `source:${(row as any).id}`,
        payload: {
          knowledge_layer: data.knowledge_layer,
          source_title: (row as any).source_title,
        },
      });
    } catch (e) {
      console.warn("[contributions] atlas-source wiring failed", e);
    }
    return { id: (row as any).id };
  });

/** Delete an Atlas source (admin). */
export const deleteAtlasSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("atlas_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Promote a source up one layer (mission → program → state → canon). */
export const promoteAtlasSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: e0 } = await supabase
      .from("atlas_sources").select("knowledge_layer").eq("id", data.id).single();
    if (e0) throw new Error(e0.message);
    const order: Record<string, string> = { mission: "program", program: "state", state: "canon" };
    const next = order[(row as any).knowledge_layer];
    if (!next) throw new Error("Source is already at the top layer (or in collective memory).");
    const patch: any = {
      knowledge_layer: next,
      promoted_at: new Date().toISOString(),
      promoted_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (next === "canon") {
      patch.state_code = null; patch.program_code = null; patch.mission_id = null;
    } else if (next === "state") {
      patch.program_code = null; patch.mission_id = null;
    } else if (next === "program") {
      patch.mission_id = null;
    }
    const { error } = await supabase.from("atlas_sources").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { layer: next };
  });

/** Bulk change knowledge layer for multiple sources. */
export const bulkSetLayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1),
      layer: KnowledgeLayer,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: any = {
      knowledge_layer: data.layer,
      updated_at: new Date().toISOString(),
    };
    if (data.layer === "canon") { patch.state_code = null; patch.program_code = null; patch.mission_id = null; }
    if (data.layer === "state") { patch.program_code = null; patch.mission_id = null; }
    if (data.layer === "program") { patch.mission_id = null; }
    const { error } = await context.supabase.from("atlas_sources").update(patch).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

/** Heuristic IRIS layer suggestion from a URL/title. (No external call — fast + deterministic.) */
export const suggestLayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      url: z.string().optional(),
      title: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const text = `${data.url ?? ""} ${data.title ?? ""}`.toLowerCase();
    let layer: "canon" | "state" | "program" | "mission" = "canon";
    let reason = "Federal / national source — defaulting to Canon.";
    let stateCode: string | null = null;
    let programCode: string | null = null;

    if (/performcare|csoc|cmo standards|fso standards|mrss|cyber|wraparound/.test(text)) {
      layer = "program"; programCode = "NJ_CSOC"; stateCode = "NJ";
      reason = "References NJ CSOC program operations (PerformCare / CMO / FSO / MRSS / CYBER / wraparound).";
    } else if (/nj\.gov|state\.nj\.us|njleg|new jersey|familycare|title 3a|title 30/.test(text)) {
      layer = "state"; stateCode = "NJ";
      reason = "NJ state-level publication — applies across NJ programs.";
    } else if (/ecfr|cfr|cms\.gov|medicaid\.gov|macpac|medpac|ffpsa|samhsa|epsdt|mhpaea|hcbs/.test(text)) {
      layer = "canon";
      reason = "Federal regulation or national guidance — belongs in Canon.";
    } else if (/rfp|amendment|q&a|model contract|2026|2027|2028/.test(text)) {
      layer = "mission";
      reason = "Looks like a bid-cycle document — assign to the active mission.";
    }
    return { layer, stateCode, programCode, reason };
  });
