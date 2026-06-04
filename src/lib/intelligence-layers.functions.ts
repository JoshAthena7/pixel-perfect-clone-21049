// 5-Layer Intelligence Architecture — server functions for retrieval, listing, and promotion.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Assemble the layered context block to inject into IRIS prompts for a mission. */
export const assembleLayeredContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid().optional(),
      topicHint: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Resolve mission scope (state + program)
    let state: string | null = null;
    let program: string | null = null;
    let missionName: string | null = null;
    if (data.missionId) {
      const { data: m } = await supabase
        .from("missions")
        .select("name,state,program_type")
        .eq("id", data.missionId)
        .maybeSingle();
      state = (m as any)?.state ?? null;
      program = (m as any)?.program_type ?? null;
      missionName = (m as any)?.name ?? null;
    }

    const [canon, stateIntel, programIntel, collective] = await Promise.all([
      supabase
        .from("intelligence_canon")
        .select("topic,category,citation,content,priority")
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .limit(20),
      state
        ? supabase
            .from("state_intelligence")
            .select("section,title,content,citations")
            .eq("state_code", state)
            .order("updated_at", { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] as any[] }),
      program
        ? supabase
            .from("program_intelligence")
            .select("program_name,state_code,population,eligibility,service_array,operational_requirements,quality_requirements,reporting_requirements,proposal_implications")
            .eq("is_active", true)
            .ilike("program_name", `%${program}%`)
            .limit(5)
        : Promise.resolve({ data: [] as any[] }),
      // C4: Read via sanitized view; raw source_mission_* and evidence stay admin-only.
      supabase
        .from("collective_memory_sanitized")
        .select("kind,summary,detail,program_name,state_code,outcome")
        .or(
          [
            state ? `state_code.eq.${state}` : null,
            program ? `program_name.ilike.%${program}%` : null,
            "state_code.is.null",
          ].filter(Boolean).join(","),
        )
        .order("promoted_at", { ascending: false })
        .limit(20),
    ]);

    return {
      scope: { missionId: data.missionId ?? null, missionName, state, program },
      layer1_canon: canon.data ?? [],
      layer2_state: stateIntel.data ?? [],
      layer3_program: programIntel.data ?? [],
      layer5_collective: collective.data ?? [],
    };
  });

/** List entries for a single layer (Olympus admin). */
export const listLayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      layer: z.enum(["canon", "state", "program", "collective"]),
      stateCode: z.string().optional(),
      programName: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.layer === "canon") {
      const { data: rows } = await supabase
        .from("intelligence_canon")
        .select("*")
        .order("priority", { ascending: true })
        .order("category");
      return rows ?? [];
    }
    if (data.layer === "state") {
      let q = supabase.from("state_intelligence").select("*").order("state_code").order("section");
      if (data.stateCode) q = q.eq("state_code", data.stateCode);
      const { data: rows } = await q;
      return rows ?? [];
    }
    if (data.layer === "program") {
      let q = supabase.from("program_intelligence").select("*").order("program_name");
      if (data.programName) q = q.ilike("program_name", `%${data.programName}%`);
      const { data: rows } = await q;
      return rows ?? [];
    }
    const { data: rows } = await supabase
      .from("collective_memory")
      .select("*")
      .order("promoted_at", { ascending: false });
    return rows ?? [];
  });

const CanonInput = z.object({
  id: z.string().uuid().optional(),
  topic: z.string().min(1).max(255),
  category: z.string().min(1).max(64),
  citation: z.string().max(255).optional(),
  content: z.string().min(1).max(20000),
  source_url: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string().max(64)).max(20).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  is_active: z.boolean().optional(),
});

export const upsertCanon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CanonInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = { ...data, source_url: data.source_url || null, created_by: userId, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await supabase.from("intelligence_canon").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("intelligence_canon").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

const StateInput = z.object({
  id: z.string().uuid().optional(),
  state_code: z.string().min(2).max(2),
  section: z.string().min(1).max(64),
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(20000),
  citations: z.array(z.string().max(255)).max(20).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

export const upsertStateIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = { ...data, state_code: data.state_code.toUpperCase(), created_by: userId, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await supabase.from("state_intelligence").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("state_intelligence").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

const ProgramInput = z.object({
  id: z.string().uuid().optional(),
  program_name: z.string().min(1).max(128),
  state_code: z.string().max(2).optional(),
  population: z.string().max(4000).optional(),
  eligibility: z.string().max(4000).optional(),
  service_array: z.string().max(8000).optional(),
  operational_requirements: z.string().max(8000).optional(),
  quality_requirements: z.string().max(4000).optional(),
  reporting_requirements: z.string().max(4000).optional(),
  proposal_implications: z.string().max(8000).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

export const upsertProgramIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProgramInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      ...data,
      state_code: data.state_code ? data.state_code.toUpperCase() : null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabase.from("program_intelligence").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("program_intelligence").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

const CollectiveInput = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["winning_theme", "evaluator_preference", "compliance_lesson", "best_practice", "operational_wisdom"]),
  summary: z.string().min(1).max(500),
  detail: z.string().max(8000).optional(),
  source_mission_id: z.string().uuid().optional(),
  program_name: z.string().max(128).optional(),
  state_code: z.string().max(2).optional(),
  outcome: z.enum(["won", "lost", "shortlisted", "n/a"]).optional(),
  score_delta: z.number().optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

export const promoteToCollectiveMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CollectiveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let sourceName: string | null = null;
    if (data.source_mission_id) {
      const { data: m } = await supabase.from("missions").select("name").eq("id", data.source_mission_id).maybeSingle();
      sourceName = (m as any)?.name ?? null;
    }
    const row = {
      ...data,
      state_code: data.state_code ? data.state_code.toUpperCase() : null,
      source_mission_name: sourceName,
      promoted_by: userId,
    };
    if (data.id) {
      const { error } = await supabase.from("collective_memory").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("collective_memory").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins!.id };
  });

export const deleteLayerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      layer: z.enum(["canon", "state", "program", "collective"]),
      id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const table =
      data.layer === "canon" ? "intelligence_canon" :
      data.layer === "state" ? "state_intelligence" :
      data.layer === "program" ? "program_intelligence" : "collective_memory";
    const { error } = await context.supabase.from(table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
