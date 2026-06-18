/**
 * War Room — admin / engagement-lead / PM cockpit.
 *
 * All queries are scoped to a single mission. Returns a denormalized DTO
 * so the UI fires one query and reads everything out of it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PM_ROLES = ["admin", "lead", "engagement_lead", "project_manager"];

async function assertPm(supabase: any, userId: string, missionId: string) {
  const { data: adminRow } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (adminRow) return;
  const { data: m } = await supabase
    .from("mission_team_members").select("mission_role")
    .eq("member_id", userId).eq("mission_id", missionId).maybeSingle();
  if (!m || !PM_ROLES.includes(m.mission_role)) {
    throw new Error("Forbidden: war room is admin / EL / PM only");
  }
}

export const getWarRoomData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { missionId: string }) =>
    z.object({ missionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPm(supabase, userId, data.missionId);
    const missionId = data.missionId;
    const now = Date.now();

    const [
      missionRes, teamRes, questionsRes, progressRes, assignRes,
      stuckRes, flagsRes, briefsRes, eventsRes, nodesRes, dailyRes, lowRatedRes,
    ] = await Promise.all([
      supabase.from("missions")
        .select("id,name,status,submission_deadline,health_score,state,program_type")
        .eq("id", missionId).maybeSingle(),
      supabase.from("mission_team_members")
        .select("member_id,mission_role")
        .eq("mission_id", missionId)
        .in("mission_role", ["writer", "lead_writer", "sme", "reviewer", "lead", "engagement_lead", "project_manager"]),
      supabase.from("mission_questions")
        .select("id,question_number,question_text,health_status,iris_brief_status,iris_brief_generated_at,is_withdrawn,created_at")
        .eq("mission_id", missionId).eq("is_withdrawn", false),
      supabase.from("question_progress")
        .select("question_id,assignee_id,role,status,acceptance_status,assigned_at,last_activity_at,updated_at")
        .eq("mission_id", missionId),
      supabase.from("mission_assignments")
        .select("question_id,assigned_writer_id,acceptance_status,assigned_at")
        .eq("mission_id", missionId),
      supabase.from("atlas_writer_block_sessions")
        .select("user_id,question_id,was_helpful,created_at")
        .eq("mission_id", missionId)
        .gte("created_at", new Date(now - 48 * 3600_000).toISOString()),
      supabase.from("mission_manager_flags")
        .select("id,question_id,resolved")
        .eq("mission_id", missionId).eq("resolved", false),
      supabase.from("mission_questions")
        .select("iris_brief_status")
        .eq("mission_id", missionId).eq("is_withdrawn", false),
      supabase.from("intel_events")
        .select("id,event_type,title,extracted_summary,content,source_title,source_url,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false }).limit(10),
      supabase.from("intelligence_graph_nodes")
        .select("id,label,node_type,description,created_at")
        .eq("mission_id", missionId).eq("is_active", true)
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("daily_intelligence_briefs")
        .select("id,brief_date,key_intelligence_summary,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false }).limit(3),
      supabase.from("iris_answers")
        .select("id,prompt_type,user_rating,user_correction,created_at")
        .eq("mission_id", missionId)
        .not("user_rating", "is", null).lt("user_rating", 3)
        .order("created_at", { ascending: false }).limit(5),
    ]);

    const mission = missionRes.data ?? null;
    const memberRows = teamRes.data ?? [];
    const memberIds = memberRows.map((r: any) => r.member_id);

    // Load writer profiles (atlas_team_members keyed by auth user id via email join? — atlas members have separate id but
    // mission_team_members.member_id IS the auth user id. atlas_team_members.id is its own UUID; we look up by joining on profiles.)
    const { data: profiles } = memberIds.length
      ? await supabase.from("profiles").select("id,full_name,email,avatar_url").in("id", memberIds)
      : { data: [] as any[] };

    const profileById: Record<string, any> = {};
    for (const p of profiles ?? []) profileById[p.id] = p;

    // Map: questionId -> latest progress activity per assignee
    const lastByAssignee: Record<string, string> = {};
    const questionsByAssignee: Record<string, Set<string>> = {};
    for (const p of progressRes.data ?? []) {
      if (!p.assignee_id) continue;
      const t = p.last_activity_at || p.updated_at;
      if (!lastByAssignee[p.assignee_id] || (t && t > lastByAssignee[p.assignee_id])) {
        lastByAssignee[p.assignee_id] = t;
      }
      (questionsByAssignee[p.assignee_id] ??= new Set()).add(p.question_id);
    }
    // Also include assignments (writer might not have progress row yet)
    for (const a of assignRes.data ?? []) {
      if (!a.assigned_writer_id) continue;
      (questionsByAssignee[a.assigned_writer_id] ??= new Set()).add(a.question_id);
    }

    // Health per writer
    const qHealth: Record<string, string> = {};
    for (const q of questionsRes.data ?? []) qHealth[q.id] = q.health_status ?? "unknown";

    const writers = memberRows.map((m: any) => {
      const qIds = Array.from(questionsByAssignee[m.member_id] ?? []);
      const healthy = qIds.filter((id) => qHealth[id] === "healthy").length;
      const watch = qIds.filter((id) => qHealth[id] === "watch").length;
      const atRisk = qIds.filter((id) => qHealth[id] === "at_risk").length;
      const last = lastByAssignee[m.member_id] ?? null;
      const hoursAgo = last ? (now - new Date(last).getTime()) / 3600_000 : null;
      let status: "active" | "away" | "quiet" | "silent" | "not_started" = "not_started";
      if (hoursAgo == null) status = "not_started";
      else if (hoursAgo < 4) status = "active";
      else if (hoursAgo < 24) status = "away";
      else if (hoursAgo < 48) status = "quiet";
      else status = "silent";
      const prof = profileById[m.member_id] ?? {};
      const name = prof.full_name || prof.email || "Unknown";
      return {
        userId: m.member_id,
        name,
        email: prof.email ?? null,
        avatarUrl: prof.avatar_url ?? null,
        role: m.mission_role,
        questionCount: qIds.length,
        healthy, watch, atRisk,
        lastActivity: last,
        hoursSinceActivity: hoursAgo,
        status,
        risk: atRisk * 3 + watch,
      };
    }).sort((a: any, b: any) => {
      const order = { silent: 0, quiet: 1, not_started: 2, away: 3, active: 4 } as any;
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.risk - a.risk;
    });

    // Build SOS queue
    const stuckByQ: Record<string, any> = {};
    for (const s of stuckRes.data ?? []) {
      if (s.was_helpful === false || s.was_helpful == null) stuckByQ[s.question_id] = s;
    }
    const lastActByQ: Record<string, string> = {};
    const progressByQ: Record<string, any> = {};
    for (const p of progressRes.data ?? []) {
      const t = p.last_activity_at || p.updated_at;
      if (!lastActByQ[p.question_id] || (t && t > lastActByQ[p.question_id])) {
        lastActByQ[p.question_id] = t;
      }
      progressByQ[p.question_id] = p;
    }
    const assignByQ: Record<string, any> = {};
    for (const a of assignRes.data ?? []) assignByQ[a.question_id] = a;

    const sos: any[] = [];
    for (const q of questionsRes.data ?? []) {
      const reasons: string[] = [];
      const last = lastActByQ[q.id];
      const daysSince = last ? (now - new Date(last).getTime()) / 86400_000 : null;

      if (stuckByQ[q.id]) reasons.push("Writer hit Stuck? — not helpful");
      if (q.health_status === "at_risk") reasons.push("Health at risk");
      if (daysSince != null && daysSince > 4) reasons.push(`No activity in ${daysSince.toFixed(0)} days`);
      if (q.iris_brief_status === "error") reasons.push("IRIS brief errored");
      const pAssigned = progressByQ[q.id]?.assigned_at || assignByQ[q.id]?.assigned_at;
      if (progressByQ[q.id]?.acceptance_status === "pending" && pAssigned &&
          now - new Date(pAssigned).getTime() > 48 * 3600_000) {
        reasons.push("Acceptance pending > 48h");
      }
      if (q.iris_brief_status === "pending" && q.created_at &&
          now - new Date(q.created_at).getTime() > 5 * 86400_000) {
        reasons.push("Pending brief > 5 days");
      }

      if (!reasons.length) continue;

      const writerId = progressByQ[q.id]?.assignee_id ?? assignByQ[q.id]?.assigned_writer_id ?? null;
      const writerProf = writerId ? profileById[writerId] : null;
      // Priority score (lower = more urgent)
      let pri = 9;
      if (stuckByQ[q.id]) pri = 1;
      else if (q.health_status === "at_risk") pri = 2;
      else if (daysSince != null && daysSince > 2) pri = 3;
      else if (q.iris_brief_status === "error") pri = 4;
      else if (progressByQ[q.id]?.acceptance_status === "pending") pri = 5;
      else pri = 6;

      sos.push({
        questionId: q.id,
        questionNumber: q.question_number,
        questionTitle: (q.question_text ?? "").slice(0, 60),
        writerId,
        writerName: writerProf?.full_name || writerProf?.email || "Unassigned",
        writerAvatar: writerProf?.avatar_url ?? null,
        reasons,
        daysSinceActivity: daysSince,
        briefStatus: q.iris_brief_status,
        healthStatus: q.health_status,
        priority: pri,
      });
    }
    sos.sort((a, b) => a.priority - b.priority);

    // Brief pipeline counts
    const pipeline = { ready: 0, queued: 0, generating: 0, pending: 0, error: 0, other: 0 };
    for (const r of briefsRes.data ?? []) {
      const st = (r.iris_brief_status ?? "pending").toLowerCase();
      if (st === "ready" || st === "complete" || st === "completed") pipeline.ready++;
      else if (st === "queued") pipeline.queued++;
      else if (st === "generating") pipeline.generating++;
      else if (st === "pending") pipeline.pending++;
      else if (st === "error" || st === "failed") pipeline.error++;
      else pipeline.other++;
    }
    const totalQuestions = questionsRes.data?.length ?? 0;
    const healthyCount = (questionsRes.data ?? []).filter((q: any) => q.health_status === "healthy").length;
    const writersActiveToday = writers.filter((w: any) =>
      w.hoursSinceActivity != null && w.hoursSinceActivity < 24,
    ).length;

    // Overnight digest — assemble from intel events, graph nodes, daily briefs, low ratings
    const digest: any[] = [];
    for (const e of eventsRes.data ?? []) {
      const isRisk = /risk|protest|warning|delay/i.test(`${e.event_type} ${e.title}`);
      digest.push({
        kind: isRisk ? "risk" : "intel",
        title: e.title,
        summary: (e.extracted_summary || e.content || "").slice(0, 140),
        source: e.source_title ?? "",
        ts: e.created_at,
      });
    }
    for (const n of nodesRes.data ?? []) {
      digest.push({ kind: "node", title: `New evidence: ${n.label}`, summary: (n.description ?? "").slice(0, 140), source: n.node_type ?? "", ts: n.created_at });
    }
    for (const d of dailyRes.data ?? []) {
      digest.push({ kind: "daily", title: "Daily focus generated", summary: (d.key_intelligence_summary ?? "").slice(0, 140), source: d.brief_date, ts: d.created_at });
    }
    for (const r of lowRatedRes.data ?? []) {
      digest.push({ kind: "feedback_low", title: "Brief feedback received", summary: (r.user_correction ?? "Writer marked unhelpful").slice(0, 140), source: r.prompt_type ?? "", ts: r.created_at });
    }
    digest.sort((a, b) => (a.ts < b.ts ? 1 : -1));

    // Latest IRIS run = most recent brief generated or daily brief
    let lastIrisRun: string | null = null;
    for (const q of questionsRes.data ?? []) {
      if (q.iris_brief_generated_at && (!lastIrisRun || q.iris_brief_generated_at > lastIrisRun)) {
        lastIrisRun = q.iris_brief_generated_at;
      }
    }
    for (const d of dailyRes.data ?? []) {
      if (d.created_at && (!lastIrisRun || d.created_at > lastIrisRun)) lastIrisRun = d.created_at;
    }

    return {
      mission,
      generatedAt: new Date().toISOString(),
      writers,
      sos,
      pipeline,
      stats: { totalQuestions, healthyPct: totalQuestions ? Math.round((healthyCount / totalQuestions) * 100) : 0, briefsReady: pipeline.ready, writersActiveToday },
      flagCount: (flagsRes.data ?? []).length,
      digest: digest.slice(0, 8),
      intelFeed: (eventsRes.data ?? []).slice(0, 10).map((e: any) => ({
        id: e.id, type: e.event_type, title: e.title,
        summary: (e.extracted_summary || e.content || "").slice(0, 240),
        source: e.source_title || e.source_url || "",
        ts: e.created_at,
      })),
      lastIrisRun,
    };
  });

export const getWarRoomHealthTrend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { missionId: string }) =>
    z.object({ missionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPm(supabase, userId, data.missionId);

    // Best-effort: derive a daily snapshot from question_progress.updated_at +
    // mission_questions.health_calculated_at. Without a true history table, we
    // expose current state only and let the UI render a single point.
    const { data: qs } = await supabase
      .from("mission_questions")
      .select("health_status,health_calculated_at")
      .eq("mission_id", data.missionId)
      .eq("is_withdrawn", false);

    const current = { healthy: 0, watch: 0, at_risk: 0 };
    for (const q of qs ?? []) {
      if (q.health_status === "healthy") current.healthy++;
      else if (q.health_status === "watch") current.watch++;
      else if (q.health_status === "at_risk") current.at_risk++;
    }
    return { points: [{ date: new Date().toISOString().slice(0, 10), ...current }], hasHistory: false };
  });

export const sendNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { missionId: string; toUserId: string; message: string }) =>
    z.object({
      missionId: z.string().uuid(),
      toUserId: z.string().uuid(),
      message: z.string().min(1).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPm(context.supabase, context.userId, data.missionId);
    const { error } = await context.supabase.from("atlas_shoutouts").insert({
      mission_id: data.missionId,
      from_user_id: context.userId,
      to_user_id: data.toUserId,
      message: data.message,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const flagQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { missionId: string; questionId: string; reason: string }) =>
    z.object({
      missionId: z.string().uuid(),
      questionId: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPm(context.supabase, context.userId, data.missionId);
    const { error } = await context.supabase.from("mission_manager_flags").insert({
      mission_id: data.missionId,
      question_id: data.questionId,
      flagged_by: context.userId,
      flag_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reassignQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { missionId: string; questionId: string; writerId: string }) =>
    z.object({
      missionId: z.string().uuid(),
      questionId: z.string().uuid(),
      writerId: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPm(context.supabase, context.userId, data.missionId);
    const nowIso = new Date().toISOString();

    // Upsert assignment
    const { error: e1 } = await context.supabase.from("mission_assignments").upsert({
      mission_id: data.missionId,
      question_id: data.questionId,
      assigned_writer_id: data.writerId,
      assigned_by: context.userId,
      assigned_at: nowIso,
      acceptance_status: "pending",
    }, { onConflict: "mission_id,question_id" });
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await context.supabase.from("question_progress").upsert({
      mission_id: data.missionId,
      question_id: data.questionId,
      assignee_id: data.writerId,
      role: "writer",
      acceptance_status: "pending",
      assigned_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: "mission_id,question_id,assignee_id" });
    if (e2) throw new Error(e2.message);

    return { ok: true };
  });

export const bulkResetBriefErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { missionId: string }) =>
    z.object({ missionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPm(context.supabase, context.userId, data.missionId);
    const { data: rows, error } = await context.supabase
      .from("mission_questions")
      .update({ iris_brief_status: "pending" })
      .eq("mission_id", data.missionId)
      .eq("iris_brief_status", "error")
      .select("id");
    if (error) throw new Error(error.message);
    return { reset: rows?.length ?? 0 };
  });
