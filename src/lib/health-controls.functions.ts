/**
 * Server functions for the manager/admin health controls:
 *  - manager flags ("flag for review", watch list, resolve)
 *  - admin health overrides + private admin note
 *  - mission-wide health summary counts (for the Briefing widget)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MISSION_MANAGER_ROLES = [
  "engagement_lead",
  "project_manager",
  "lead",
  "Lead Writer",
  "Proposal Manager",
];

async function assertManagerOrAdmin(
  supabase: any,
  userId: string,
  missionId: string,
): Promise<void> {
  const { data: admin } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return;
  const { data: tm } = await supabase
    .from("mission_team_members")
    .select("mission_role")
    .eq("mission_id", missionId)
    .eq("member_id", userId)
    .in("mission_role", MISSION_MANAGER_ROLES)
    .maybeSingle();
  if (!tm) throw new Error("Forbidden: manager/admin role required");
}

async function assertAdmin(supabase: any, userId: string): Promise<void> {
  const { data: admin } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!admin) throw new Error("Forbidden: admin required");
}

/* ───────────── Health summary (for Briefing widget) ───────────── */
export const getMissionHealthSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: rows, error }, { data: progressRows }] = await Promise.all([
      supabase
        .from("mission_questions")
        .select("id, health_status, is_withdrawn")
        .eq("mission_id", data.missionId),
      supabase
        .from("question_progress")
        .select("question_id, assignee_id, status, acceptance_status, last_activity_at")
        .eq("mission_id", data.missionId),
    ]);
    if (error) throw new Error(error.message);
    // Build progress map: question_id -> "best" progress signal
    const progressByQ: Record<string, any> = {};
    for (const p of (progressRows ?? []) as any[]) {
      const cur = progressByQ[p.question_id];
      // Prefer the row with the most signal (assignee + status)
      if (!cur || (p.assignee_id && !cur.assignee_id)) progressByQ[p.question_id] = p;
    }
    const now = Date.now();
    const live = (rows ?? []).filter((r: any) => !r.is_withdrawn);
    const counts = { healthy: 0, watch: 0, at_risk: 0, unstarted: 0, unscored: 0 };
    let assigned = 0;
    for (const r of live) {
      const s = (r as any).health_status as string | null;
      const p = progressByQ[(r as any).id];
      const isAssigned = !!p?.assignee_id;
      if (isAssigned) assigned++;
      const hasProblemFlag = p?.acceptance_status === "need_help" || p?.acceptance_status === "need_sme";
      const stalled = isAssigned && p?.last_activity_at && (now - new Date(p.last_activity_at).getTime()) / 3600_000 > 48;
      if (s === "healthy") counts.healthy++;
      else if (s === "watch") counts.watch++;
      else if (s === "at_risk") {
        // Reclassify: only genuinely "at risk" if assigned + flagged/stalled
        if (hasProblemFlag || stalled) counts.at_risk++;
        else counts.unstarted++;
      } else if (!s || s === "unstarted" || s === "not_started") {
        if (hasProblemFlag || stalled) counts.at_risk++;
        else counts.unstarted++;
      } else counts.unscored++;
    }
    return { total: live.length, assigned, ...counts };
  });


/* ───────────── Manager flags ───────────── */
export const listMissionFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("mission_manager_flags")
      .select("id, question_id, flag_reason, resolved, flagged_by, created_at")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { flags: rows ?? [] };
  });

export const createManagerFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        questionId: z.string().uuid(),
        reason: z.string().max(100).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManagerOrAdmin(supabase, userId, data.missionId);
    const { data: inserted, error } = await supabase
      .from("mission_manager_flags")
      .insert({
        mission_id: data.missionId,
        question_id: data.questionId,
        flagged_by: userId,
        flag_reason: data.reason ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id as string };
  });

export const resolveManagerFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ flagId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("mission_manager_flags")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq("id", data.flagId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ───────────── Admin overrides ───────────── */
const HEALTH = z.enum(["healthy", "watch", "at_risk"]);

export const applyHealthOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        questionId: z.string().uuid(),
        newState: HEALTH,
        reason: z.string().min(1).max(150),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: existing } = await supabase
      .from("mission_questions")
      .select("health_status")
      .eq("id", data.questionId)
      .maybeSingle();

    const { error: upErr } = await supabase
      .from("mission_questions")
      .update({
        health_status: data.newState,
        health_calculated_at: new Date().toISOString(),
      })
      .eq("id", data.questionId);
    if (upErr) throw new Error(upErr.message);

    const { error: logErr } = await supabase
      .from("mission_health_overrides")
      .insert({
        mission_id: data.missionId,
        question_id: data.questionId,
        overridden_by: userId,
        previous_state: (existing as any)?.health_status ?? null,
        new_state: data.newState,
        reason: data.reason,
      });
    if (logErr) throw new Error(logErr.message);

    return { ok: true };
  });

export const getLatestOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Only admins can read overrides per RLS; return empty otherwise.
    const { data: admin } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!admin) return { overrides: [] as any[] };
    const { data: rows } = await supabase
      .from("mission_health_overrides")
      .select("id, question_id, new_state, reason, admin_note, created_at")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false });
    return { overrides: rows ?? [] };
  });

export const saveAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        overrideId: z.string().uuid(),
        adminNote: z.string().max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("mission_health_overrides")
      .update({ admin_note: data.adminNote })
      .eq("id", data.overrideId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
