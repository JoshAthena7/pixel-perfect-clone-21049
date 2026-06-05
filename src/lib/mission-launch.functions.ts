import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Granular launch-orchestration server fns. The client calls these one at a
 * time so it can stream the 8-step animated activation sequence with live
 * counts.
 */

const Input = z.object({ missionId: z.string().uuid() });

export const lockMissionContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: m } = await supabase
      .from("missions").select("id,name,client,status").eq("id", data.missionId).maybeSingle();
    if (!m) throw new Error("Mission not found");
    if (!m.name || !m.client) throw new Error("Mission Identity incomplete");
    if (m.status === "Setup") {
      await supabase.from("missions").update({ status: "Active" }).eq("id", data.missionId);
    }
    return { ok: true, name: m.name };
  });

export const countVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("mission_vault_documents").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId);
    return { count: count ?? 0 };
  });

export const countOracle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const [s, w, c] = await Promise.all([
      context.supabase.from("mission_strategy").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId),
      context.supabase.from("win_themes").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId),
      context.supabase.from("mission_client_intel").select("mission_id", { count: "exact", head: true }).eq("mission_id", data.missionId),
    ]);
    return { count: (s.count ?? 0) + (w.count ?? 0) + (c.count ?? 0) };
  });

export const buildEvaluationMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: crits } = await supabase
      .from("mission_evaluation_criteria")
      .select("id,category,points,sections_covered,competitive_risk")
      .eq("mission_id", data.missionId);
    const { data: questions } = await supabase
      .from("question_records").select("id,question_number,section_number")
      .eq("mission_id", data.missionId);
    let tagged = 0;
    for (const c of crits ?? []) {
      const sections = (Array.isArray(c.sections_covered) ? c.sections_covered : []) as Array<string | number>;
      const points = Math.round((c.points ?? 0) / Math.max(1, sections.length || 1));
      const matchedQs = (questions ?? []).filter((q) =>
        sections.some((s) => String(s) === String(q.section_number) || String(q.question_number).startsWith(String(s))),
      );
      for (const q of matchedQs) {
        await supabase.from("question_records").update({
          point_value: points,
          competitive_risk: c.competitive_risk,
        }).eq("id", q.id);
        tagged++;
      }
    }
    return { count: tagged };
  });

export const countStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const [q, w] = await Promise.all([
      context.supabase.from("question_records").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId),
      context.supabase.from("mission_members").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId).eq("role", "writer"),
    ]);
    return { questions: q.count ?? 0, writers: w.count ?? 0 };
  });

export const countMonitoring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("mission_monitoring_sources").select("id", { count: "exact", head: true })
      .eq("mission_id", data.missionId).eq("enabled", true);
    return { count: count ?? 0 };
  });

export const notifyTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("mission_members").select("id", { count: "exact", head: true }).eq("mission_id", data.missionId);
    // Lightweight broadcast row so the team feed shows the launch.
    await context.supabase.from("broadcasts").insert({
      mission_id: data.missionId,
      from_name: "IRIS",
      text: "Mission launched. Setup record locked. Initial briefing is in the Brief Room.",
    }).then(() => null, () => null);
    return { count: count ?? 0 };
  });
