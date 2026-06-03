// Atlas Intelligence Hub — server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Hub-level stats for the header pills. */
export const hubStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const countLayer = async (l: string) => {
      const { count } = await supabase
        .from("atlas_sources").select("id", { count: "exact", head: true })
        .eq("knowledge_layer", l);
      return count ?? 0;
    };
    const [canon, stateSources, programSources, missionSources, collectiveSources] = await Promise.all([
      countLayer("canon"), countLayer("state"), countLayer("program"),
      countLayer("mission"), countLayer("collective"),
    ]);
    const { count: statesCount } = await supabase
      .from("atlas_states").select("id", { count: "exact", head: true }).eq("is_active", true);
    const { count: programsCount } = await supabase
      .from("atlas_programs").select("id", { count: "exact", head: true }).eq("is_active", true);
    const { count: lessonsCount } = await supabase
      .from("atlas_lessons_learned").select("id", { count: "exact", head: true });
    return {
      canonSources: canon,
      stateSources, programSources, missionSources, collectiveSources,
      states: statesCount ?? 0,
      programs: programsCount ?? 0,
      lessons: lessonsCount ?? 0,
    };
  });

/** List states with source counts. */
export const listStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: states, error } = await supabase
      .from("atlas_states").select("*").order("state_name");
    if (error) throw new Error(error.message);
    // count sources per state
    const { data: srcRows } = await supabase
      .from("atlas_sources").select("state_code").eq("knowledge_layer", "state");
    const counts: Record<string, number> = {};
    (srcRows ?? []).forEach((r: any) => {
      if (r.state_code) counts[r.state_code] = (counts[r.state_code] ?? 0) + 1;
    });
    return { states: (states ?? []).map((s: any) => ({ ...s, source_count: counts[s.state_code] ?? 0 })) };
  });

/** List programs (optionally for a state) with counts. */
export const listPrograms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ stateCode: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("atlas_programs").select("*").order("program_name");
    if (data.stateCode) q = q.eq("state_code", data.stateCode);
    const { data: programs, error } = await q;
    if (error) throw new Error(error.message);
    const { data: srcRows } = await supabase
      .from("atlas_sources").select("program_code").eq("knowledge_layer", "program");
    const counts: Record<string, number> = {};
    (srcRows ?? []).forEach((r: any) => {
      if (r.program_code) counts[r.program_code] = (counts[r.program_code] ?? 0) + 1;
    });
    return { programs: (programs ?? []).map((p: any) => ({ ...p, source_count: counts[p.program_code] ?? 0 })) };
  });

/** List missions (active + archived). */
export const listMissionsForHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("missions")
      .select("id,name,client,state,status,health,submission_date,question_count,rfp_parsed,program_type,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { missions: data ?? [] };
  });

/** List lessons. */
export const listLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lessonType: z.string().optional(),
    programCode: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("atlas_lessons_learned").select("*").order("promoted_at", { ascending: false });
    if (data.lessonType) q = q.eq("lesson_type", data.lessonType);
    if (data.programCode) q = q.contains("applies_to_programs", [data.programCode]);
    const { data: rows, error } = await q.limit(200);
    if (error) throw new Error(error.message);
    return { lessons: rows ?? [] };
  });

/** Create or update a lesson. */
export const upsertLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(2),
    lesson_type: z.string().min(2),
    lesson_body: z.string().min(2),
    win_or_loss: z.enum(["win", "loss", "both", "unknown"]).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    applies_to_states: z.array(z.string()).optional(),
    applies_to_programs: z.array(z.string()).optional(),
    applies_to_question_types: z.array(z.string()).optional(),
    source_mission_ids: z.array(z.string().uuid()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload: any = {
      title: data.title,
      lesson_type: data.lesson_type,
      lesson_body: data.lesson_body,
      win_or_loss: data.win_or_loss ?? "unknown",
      confidence: data.confidence ?? "medium",
      applies_to_states: data.applies_to_states ?? [],
      applies_to_programs: data.applies_to_programs ?? [],
      applies_to_question_types: data.applies_to_question_types ?? [],
      source_mission_ids: data.source_mission_ids ?? [],
      promoted_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabase.from("atlas_lessons_learned").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("atlas_lessons_learned").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

/** Global search across all atlas layers. */
export const globalAtlasSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const s = data.q.trim();
    const { data: sources } = await supabase
      .from("atlas_sources")
      .select("id,source_title,knowledge_layer,authority_score,state_code,program_code,summary,source_url")
      .or(`source_title.ilike.%${s}%,summary.ilike.%${s}%`)
      .order("authority_score", { ascending: false, nullsFirst: false })
      .limit(80);
    const { data: lessons } = await supabase
      .from("atlas_lessons_learned")
      .select("id,title,lesson_body,lesson_type,win_or_loss,confidence,applies_to_states,applies_to_programs")
      .or(`title.ilike.%${s}%,lesson_body.ilike.%${s}%`)
      .limit(40);
    const grouped = {
      canon: (sources ?? []).filter((r: any) => r.knowledge_layer === "canon"),
      state: (sources ?? []).filter((r: any) => r.knowledge_layer === "state"),
      program: (sources ?? []).filter((r: any) => r.knowledge_layer === "program"),
      mission: (sources ?? []).filter((r: any) => r.knowledge_layer === "mission"),
      collective: lessons ?? [],
    };
    return grouped;
  });
