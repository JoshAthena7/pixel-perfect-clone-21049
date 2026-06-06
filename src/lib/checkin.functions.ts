import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ===== Types =====
export type CheckinStatus = "not_started" | "in_progress" | "draft_done" | "blocked";

export type CheckinSectionForWriter = {
  id: string;
  number: string;
  title: string;
  rfp_page_ref: string | null;
  internal_due_date: string | null;
};

export type CheckinPagePayload =
  | {
      state: "ready";
      mission: { id: string; name: string; submission_date: string | null };
      writer: { id: string; first_name: string };
      cycle: { id: string; trigger_type: string; expires_at: string };
      sections: CheckinSectionForWriter[];
      daysToSubmission: number | null;
    }
  | {
      state: "already_submitted";
      mission: { id: string; name: string; submission_date: string | null };
      writer: { first_name: string };
      cycle: { id: string };
      submission: {
        submitted_at: string;
        updates: Array<{
          section: CheckinSectionForWriter;
          status: CheckinStatus;
          progress_pct: number | null;
          notes: string | null;
        }>;
      };
      nextCheckin: string | null;
    }
  | { state: "expired" }
  | { state: "not_found" };

function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  return full.split(/\s+/)[0] || "there";
}

function daysBetween(fromISO: string | null): number | null {
  if (!fromISO) return null;
  const target = new Date(fromISO).getTime();
  const today = Date.now();
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

// ===== Public: getCheckinByToken =====
export const getCheckinByToken = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(256) }).parse(d))
  .handler(async ({ data }): Promise<CheckinPagePayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tokenRow } = await supabaseAdmin
      .from("checkin_tokens")
      .select("id, cycle_id, mission_id, writer_user_id, expires_at, consumed_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!tokenRow) return { state: "not_found" };
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) return { state: "expired" };

    const [{ data: mission }, { data: profile }, { data: cycle }] = await Promise.all([
      supabaseAdmin
        .from("missions")
        .select("id, name, submission_date")
        .eq("id", tokenRow.mission_id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, display_name, full_name")
        .eq("id", tokenRow.writer_user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("checkin_cycles")
        .select("id, trigger_type, expires_at")
        .eq("id", tokenRow.cycle_id)
        .maybeSingle(),
    ]);

    if (!mission || !cycle) return { state: "not_found" };

    const writerName = (profile as any)?.display_name ?? (profile as any)?.full_name ?? "there";

    // Already-submitted state takes precedence over consumed token check.
    const { data: existingSubmission } = await supabaseAdmin
      .from("checkin_submissions")
      .select("id, submitted_at")
      .eq("cycle_id", tokenRow.cycle_id)
      .eq("writer_user_id", tokenRow.writer_user_id)
      .maybeSingle();

    if (existingSubmission) {
      const { data: updates } = await supabaseAdmin
        .from("checkin_section_updates")
        .select(
          "status, progress_pct, notes, section:mission_sections(id, number, title, rfp_page_ref, internal_due_date)",
        )
        .eq("submission_id", existingSubmission.id);

      return {
        state: "already_submitted",
        mission: { id: mission.id, name: mission.name, submission_date: (mission as any).submission_date ?? null },
        writer: { first_name: firstName(writerName) },
        cycle: { id: cycle.id },
        submission: {
          submitted_at: existingSubmission.submitted_at,
          updates: (updates ?? []).map((u: any) => ({
            section: u.section,
            status: u.status,
            progress_pct: u.progress_pct,
            notes: u.notes,
          })),
        },
        nextCheckin: nextMondayISO(),
      };
    }

    const { data: sections } = await supabaseAdmin
      .from("mission_sections")
      .select("id, number, title, rfp_page_ref, internal_due_date")
      .eq("mission_id", tokenRow.mission_id)
      .eq("assigned_user_id", tokenRow.writer_user_id)
      .order("number");

    return {
      state: "ready",
      mission: { id: mission.id, name: mission.name, submission_date: (mission as any).submission_date ?? null },
      writer: { id: tokenRow.writer_user_id, first_name: firstName(writerName) },
      cycle: { id: cycle.id, trigger_type: cycle.trigger_type, expires_at: cycle.expires_at },
      sections: (sections ?? []) as CheckinSectionForWriter[],
      daysToSubmission: daysBetween((mission as any).submission_date ?? null),
    };
  });

function nextMondayISO(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ===== Public: submitCheckin =====
const updateSchema = z.object({
  section_id: z.string().uuid(),
  status: z.enum(["not_started", "in_progress", "draft_done", "blocked"]),
  progress_pct: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().max(140).nullable().optional(),
});

export const submitCheckin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(10).max(256),
        updates: z.array(updateSchema).min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tokenRow } = await supabaseAdmin
      .from("checkin_tokens")
      .select("id, cycle_id, mission_id, writer_user_id, expires_at, consumed_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!tokenRow) throw new Error("Invalid link");
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) throw new Error("Link has expired");

    // Idempotent submission
    let submissionId: string;
    const { data: existing } = await supabaseAdmin
      .from("checkin_submissions")
      .select("id")
      .eq("cycle_id", tokenRow.cycle_id)
      .eq("writer_user_id", tokenRow.writer_user_id)
      .maybeSingle();

    if (existing) {
      submissionId = existing.id;
    } else {
      const { data: ins, error: subErr } = await supabaseAdmin
        .from("checkin_submissions")
        .insert({
          cycle_id: tokenRow.cycle_id,
          mission_id: tokenRow.mission_id,
          writer_user_id: tokenRow.writer_user_id,
        })
        .select("id")
        .single();
      if (subErr || !ins) throw new Error("Could not save submission");
      submissionId = ins.id;
    }

    // Validate sections belong to this mission & writer
    const sectionIds = data.updates.map((u) => u.section_id);
    const { data: validSections } = await supabaseAdmin
      .from("mission_sections")
      .select("id")
      .eq("mission_id", tokenRow.mission_id)
      .eq("assigned_user_id", tokenRow.writer_user_id)
      .in("id", sectionIds);
    const validIds = new Set((validSections ?? []).map((s: any) => s.id));

    const rows = data.updates
      .filter((u) => validIds.has(u.section_id))
      .map((u) => ({
        submission_id: submissionId,
        section_id: u.section_id,
        status: u.status,
        progress_pct: u.status === "in_progress" ? (u.progress_pct ?? null) : null,
        notes: u.notes?.trim() || null,
        source: "checkin",
      }));

    if (rows.length > 0) {
      // Upsert by unique (submission_id, section_id)
      await supabaseAdmin
        .from("checkin_section_updates")
        .upsert(rows, { onConflict: "submission_id,section_id" });
    }

    // Consume token
    await supabaseAdmin
      .from("checkin_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    // Blocked sections → PM escalation
    const blocked = rows.filter((r) => r.status === "blocked");
    if (blocked.length > 0) {
      const blockedSectionInfo = (validSections ?? []).filter((s: any) =>
        blocked.some((b) => b.section_id === s.id),
      );
      const desc = `Writer reported BLOCKED on ${blocked.length} section(s) in check-in. ${
        blocked
          .map((b) => b.notes)
          .filter(Boolean)
          .join(" · ") || "No notes provided."
      }`;
      await supabaseAdmin.from("escalations").insert({
        mission_id: tokenRow.mission_id,
        category: "checkin_blocked",
        severity: "high",
        description: desc,
        submitted_by: "writer",
        submitted_by_id: tokenRow.writer_user_id,
        status: "open",
      });
      void blockedSectionInfo;
    }

    return { ok: true };
  });

// ===== Authed: PM dashboard data =====

async function assertPMOnMission(supabase: any, missionId: string, userId: string) {
  const { data } = await supabase
    .from("mission_members")
    .select("role")
    .eq("mission_id", missionId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data?.role ?? "").toString().toLowerCase();
  if (!["pm", "project manager", "project_manager", "lead"].includes(role)) {
    throw new Error("Not authorized: PM role required for this mission");
  }
}

export const listMissionsForPM = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("mission_members")
      .select("mission_id, role, mission:missions(id, name, submission_date)")
      .eq("user_id", userId);
    return (data ?? [])
      .filter((r: any) =>
        ["pm", "project manager", "project_manager", "lead"].includes((r.role ?? "").toLowerCase()),
      )
      .map((r: any) => r.mission)
      .filter(Boolean);
  });

export const listMissionCheckins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertPMOnMission(supabase, data.missionId, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Latest weekly cycle (or most recent of any type)
    const { data: cycle } = await supabaseAdmin
      .from("checkin_cycles")
      .select("id, cycle_start, trigger_type, expires_at")
      .eq("mission_id", data.missionId)
      .order("cycle_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    // All mission writers (members)
    const { data: members } = await supabaseAdmin
      .from("mission_members")
      .select("user_id, display_name, role")
      .eq("mission_id", data.missionId);

    const memberIds = (members ?? []).map((m: any) => m.user_id);
    const { data: memberProfiles } = memberIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, display_name, full_name, avatar_url")
          .in("id", memberIds)
      : { data: [] as any[] };
    const profileById = new Map<string, any>();
    (memberProfiles ?? []).forEach((p: any) => profileById.set(p.id, p));
    const enrichedMembers = (members ?? []).map((m: any) => ({
      ...m,
      profile: profileById.get(m.user_id) ?? null,
    }));

    if (!cycle) {
      return {
        cycle: null,
        writers: enrichedMembers.map((m: any) => ({
          user_id: m.user_id,
          name: m.profile?.display_name ?? m.profile?.full_name ?? m.display_name ?? "Unknown",
          avatar_url: m.profile?.avatar_url ?? null,
          role: m.role,
          submitted_at: null as string | null,
          status: "not_yet" as const,
          updates: [] as any[],
        })),
        completion: { submitted: 0, total: enrichedMembers.length, pct: 0 },
      };
    }

    const { data: submissions } = await supabaseAdmin
      .from("checkin_submissions")
      .select(
        "id, writer_user_id, submitted_at, updates:checkin_section_updates(status, progress_pct, notes, section:mission_sections(id, number, title))",
      )
      .eq("cycle_id", cycle.id);

    const subByUser = new Map<string, any>();
    (submissions ?? []).forEach((s: any) => subByUser.set(s.writer_user_id, s));

    const overdueCutoff = new Date(cycle.expires_at).getTime() < Date.now();

    const writers = enrichedMembers.map((m: any) => {
      const sub = subByUser.get(m.user_id);
      let status: "submitted" | "not_yet" | "overdue" = "not_yet";
      if (sub) status = "submitted";
      else if (overdueCutoff) status = "overdue";
      return {
        user_id: m.user_id,
        name: m.profile?.display_name ?? m.profile?.full_name ?? m.display_name ?? "Unknown",
        avatar_url: m.profile?.avatar_url ?? null,
        role: m.role,
        submitted_at: sub?.submitted_at ?? null,
        status,
        updates: sub?.updates ?? [],
      };
    });

    const submitted = writers.filter((w) => w.status === "submitted").length;
    const total = writers.length;
    return {
      cycle,
      writers,
      completion: { submitted, total, pct: total ? Math.round((submitted / total) * 100) : 0 },
    };
  });

// ===== Section status board (blend) =====
type RiskFlag = { level: "red" | "yellow"; label: string };

async function buildSectionStatusBoard(missionId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: mission } = await supabaseAdmin
    .from("missions")
    .select("id, name, submission_date")
    .eq("id", missionId)
    .maybeSingle();

  const { data: sections } = await supabaseAdmin
    .from("mission_sections")
    .select(
      "id, number, title, internal_due_date, studio_status, studio_progress_pct, studio_updated_at, assigned_user_id",
    )
    .eq("mission_id", missionId)
    .order("number");

  const writerIds = Array.from(
    new Set((sections ?? []).map((s: any) => s.assigned_user_id).filter(Boolean)),
  );
  const { data: writerProfiles } = writerIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, display_name, full_name")
        .in("id", writerIds)
    : { data: [] as any[] };
  const writerById = new Map<string, any>();
  (writerProfiles ?? []).forEach((p: any) => writerById.set(p.id, p));

  const sectionIds = (sections ?? []).map((s: any) => s.id);
  let csu: any[] = [];
  if (sectionIds.length) {
    const { data } = await supabaseAdmin
      .from("checkin_section_updates")
      .select(
        "section_id, status, progress_pct, notes, created_at, submission:checkin_submissions(submitted_at, writer_user_id)",
      )
      .in("section_id", sectionIds)
      .order("created_at", { ascending: false });
    csu = data ?? [];
  }
  const latestBySection = new Map<string, any>();
  csu.forEach((u) => {
    if (!latestBySection.has(u.section_id)) latestBySection.set(u.section_id, u);
  });

  const now = Date.now();
  const rows = (sections ?? []).map((s: any) => {
    const ci = latestBySection.get(s.id);
    const studioUpdated = s.studio_updated_at ? new Date(s.studio_updated_at).getTime() : 0;
    const checkinUpdated = ci ? new Date(ci.submission?.submitted_at ?? ci.created_at).getTime() : 0;
    const useStudio = studioUpdated > checkinUpdated;
    const source: "studio" | "checkin" | "none" =
      studioUpdated > 0 || checkinUpdated > 0 ? (useStudio ? "studio" : "checkin") : "none";

    const status = useStudio ? s.studio_status : ci?.status ?? null;
    const progress = useStudio ? s.studio_progress_pct : ci?.progress_pct ?? null;
    const notes = useStudio ? null : ci?.notes ?? null;
    const lastUpdated = useStudio ? s.studio_updated_at : ci?.submission?.submitted_at ?? ci?.created_at ?? null;

    const risks: RiskFlag[] = [];
    const daysToDue = s.internal_due_date
      ? Math.ceil((new Date(s.internal_due_date).getTime() - now) / (1000 * 60 * 60 * 24))
      : null;
    if (status === "not_started" && daysToDue !== null && daysToDue <= 5) {
      risks.push({ level: "red", label: `Not Started — due in ${daysToDue} day${daysToDue === 1 ? "" : "s"}` });
    }
    if (status === "blocked") {
      risks.push({ level: "yellow", label: "Blocked — no resolution logged" });
    }
    const daysSinceUpdate = lastUpdated
      ? Math.floor((now - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    if ((daysSinceUpdate ?? 0) >= 5 && status !== "draft_done") {
      risks.push({ level: "yellow", label: `No update in ${daysSinceUpdate} days` });
    }

    const p = s.assigned_user_id ? writerById.get(s.assigned_user_id) : null;
    const writerName = p?.display_name ?? p?.full_name ?? "Unassigned";
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      writer: writerName,
      writer_user_id: s.assigned_user_id,
      internal_due_date: s.internal_due_date,
      status,
      progress_pct: progress,
      notes,
      source,
      last_updated: lastUpdated,
      risks,
    };
  });

  return { mission, rows };
}

export const getSectionStatusBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertPMOnMission(supabase, data.missionId, userId);
    return buildSectionStatusBoard(data.missionId);
  });

// ===== Generate Client Status Report =====
export const generateStatusReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertPMOnMission(supabase, data.missionId, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const board = await (getSectionStatusBoard as any).handler({
      data: { missionId: data.missionId },
      context,
    });

    const rows = board.rows as Array<any>;
    const total = rows.length || 1;
    const counts = {
      complete: rows.filter((r) => r.status === "draft_done").length,
      in_progress: rows.filter((r) => r.status === "in_progress").length,
      not_started: rows.filter((r) => r.status === "not_started" || r.status === null).length,
      blocked: rows.filter((r) => r.status === "blocked").length,
    };

    const reds = rows.flatMap((r) => r.risks.filter((x: RiskFlag) => x.level === "red"));
    const yellows = rows.flatMap((r) => r.risks.filter((x: RiskFlag) => x.level === "yellow"));
    const blockedItems = rows
      .filter((r) => r.status === "blocked")
      .map((r) => ({ label: `${r.number} ${r.title}`, note: r.notes || "no note" }));

    const blockedPct = counts.blocked / total;
    const notStartedPct = counts.not_started / total;
    const submissionISO = board.mission?.submission_date as string | null;
    const daysToSubmission = submissionISO
      ? Math.ceil((new Date(submissionISO).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    let overall: "On Track" | "At Risk" | "Behind" = "On Track";
    if (reds.length > 0 || blockedPct > 0.2) overall = "Behind";
    else if (yellows.length > 0 || (daysToSubmission !== null && daysToSubmission < 14 && notStartedPct > 0.3))
      overall = "At Risk";

    // PM display name
    const { data: pmProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    const pmName = (pmProfile as any)?.display_name ?? (pmProfile as any)?.full_name ?? "PM";

    // Next-week focus: sections due in next 7 days
    const nextWeek = rows
      .filter((r) => {
        if (!r.internal_due_date) return false;
        const days = Math.ceil(
          (new Date(r.internal_due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        return days >= 0 && days <= 7;
      })
      .map((r) => `${r.number} ${r.title} (due ${r.internal_due_date})`);

    const irisAssessment = (() => {
      if (overall === "Behind") {
        return `Mission is behind schedule with ${reds.length} critical risk(s) and ${counts.blocked} blocked section(s). Immediate PM intervention is required to clear blockers and re-baseline due dates.`;
      }
      if (overall === "At Risk") {
        return `Mission is at risk: ${yellows.length} warning flag(s) and ${Math.round(
          notStartedPct * 100,
        )}% of sections not yet started${daysToSubmission !== null ? ` with ${daysToSubmission} days to submission` : ""}. Trajectory is recoverable with focused action this week.`;
      }
      return `Mission is on track. ${counts.complete}/${total} sections complete, ${counts.in_progress} actively in progress${daysToSubmission !== null ? `, ${daysToSubmission} days to submission` : ""}. Current pace supports an on-time, high-quality submission.`;
    })();

    return {
      mission: board.mission,
      week_of: new Date().toISOString().slice(0, 10),
      pm_name: pmName,
      overall,
      counts,
      total,
      next_week: nextWeek,
      reds,
      yellows,
      blocked_items: blockedItems,
      iris_assessment: irisAssessment,
    };
  });

// ===== Send Reminders (placeholder — wires to email infra later) =====
export const sendCheckinReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid(), cycleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertPMOnMission(supabase, data.missionId, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find writers without a submission for this cycle
    const { data: members } = await supabaseAdmin
      .from("mission_members")
      .select("user_id")
      .eq("mission_id", data.missionId);
    const { data: subs } = await supabaseAdmin
      .from("checkin_submissions")
      .select("writer_user_id")
      .eq("cycle_id", data.cycleId);
    const submitted = new Set((subs ?? []).map((s: any) => s.writer_user_id));
    const pending = (members ?? []).filter((m: any) => !submitted.has(m.user_id));

    // TODO: enqueue email via Lovable Emails when infra is set up.
    return { ok: true, reminded: pending.length };
  });

// ===== PM utility: mint magic-link tokens for current cycle (for testing) =====
export const mintCheckinTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        triggerType: z.enum(["weekly", "milestone_14", "milestone_7", "milestone_48h"]).default("weekly"),
        expiresInHours: z.number().int().min(1).max(720).default(48),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertPMOnMission(supabase, data.missionId, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomBytes } = await import("crypto");

    const cycleStart = new Date();
    const day = cycleStart.getDay();
    cycleStart.setDate(cycleStart.getDate() - ((day + 6) % 7)); // Monday of this week
    const cycleStartISO = cycleStart.toISOString().slice(0, 10);
    const expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000).toISOString();

    // Upsert cycle
    const { data: existingCycle } = await supabaseAdmin
      .from("checkin_cycles")
      .select("id")
      .eq("mission_id", data.missionId)
      .eq("cycle_start", cycleStartISO)
      .eq("trigger_type", data.triggerType)
      .maybeSingle();

    let cycleId: string;
    if (existingCycle) cycleId = existingCycle.id;
    else {
      const { data: ins } = await supabaseAdmin
        .from("checkin_cycles")
        .insert({
          mission_id: data.missionId,
          cycle_start: cycleStartISO,
          trigger_type: data.triggerType,
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      cycleId = ins!.id;
    }

    // Writers = distinct assigned users on mission_sections
    const { data: assignees } = await supabaseAdmin
      .from("mission_sections")
      .select("assigned_user_id")
      .eq("mission_id", data.missionId)
      .not("assigned_user_id", "is", null);
    const writerIds = Array.from(new Set((assignees ?? []).map((a: any) => a.assigned_user_id)));

    const minted: { writer_user_id: string; token: string }[] = [];
    for (const writerId of writerIds) {
      const { data: existing } = await supabaseAdmin
        .from("checkin_tokens")
        .select("token")
        .eq("cycle_id", cycleId)
        .eq("writer_user_id", writerId)
        .maybeSingle();
      if (existing) {
        minted.push({ writer_user_id: writerId, token: existing.token });
        continue;
      }
      const token = randomBytes(32).toString("base64url");
      await supabaseAdmin.from("checkin_tokens").insert({
        cycle_id: cycleId,
        mission_id: data.missionId,
        writer_user_id: writerId,
        token,
        expires_at: expiresAt,
      });
      minted.push({ writer_user_id: writerId, token });
    }

    return { ok: true, cycleId, tokens: minted };
  });
