import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin actions on the Athena Team roster.
 *
 * All actions:
 *   - require platform admin role (checked server-side)
 *   - touch updated_at on any record they modify
 *   - never delete; "Remove from roster" is a soft-delete
 */

const ROLES = ["admin", "engagement_lead", "writer", "sme", "reviewer", "unassigned"] as const;

async function assertAdmin(supabase: any, userId: string): Promise<{ adminName: string }> {
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) throw new Error("Only platform admins can perform this action.");

  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name,email")
    .eq("id", userId)
    .maybeSingle();
  return { adminName: prof?.display_name || prof?.email || "Admin" };
}

async function getMember(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("atlas_team_members")
    .select("id,email,first_name,last_name,atlas_invite_status,atlas_role,admin_notes")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Member not found");
  return data;
}

/**
 * Activity log writes must NEVER block the primary action.
 * If the log write fails (transient DB issue, RLS, etc.) we swallow the
 * error and log it to the server console only.
 */
async function logActivity(
  supabase: any,
  memberId: string,
  action: string,
  performedBy: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { error } = await supabase
      .from("atlas_activity_log")
      .insert({ member_id: memberId, action, performed_by: performedBy, metadata });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[atlas_activity_log] write failed:", error.message);
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[atlas_activity_log] write threw:", e?.message ?? e);
  }
}

// ---------------------------------------------------------------------------
// Send / Resend ATLAS invite
// ---------------------------------------------------------------------------

export const sendAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ memberId: z.string().uuid(), resend: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { adminName } = await assertAdmin(supabase, userId);
    const m = await getMember(supabase, data.memberId);
    if (!m.email) throw new Error("Member has no email on file.");
    if (!data.resend && m.atlas_invite_status === "active") {
      throw new Error("This member is already active on ATLAS.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo =
      (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "") + "/" || undefined;

    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(m.email, {
      redirectTo,
      data: { first_name: m.first_name, last_name: m.last_name, source: "atlas_team_roster" },
    });

    // If the auth user already exists, fall through to a recovery link instead.
    if (inviteErr && !/already (registered|exists)/i.test(inviteErr.message)) {
      throw new Error(`Invite failed: ${inviteErr.message}`);
    }
    if (inviteErr) {
      const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(m.email, {
        redirectTo,
      });
      if (resetErr) throw new Error(`Invite failed: ${resetErr.message}`);
    }

    const now = new Date().toISOString();
    const nextStatus =
      m.atlas_invite_status === "active" ? "active" : "invite_sent";
    const { error: updErr } = await supabase
      .from("atlas_team_members")
      .update({
        atlas_invite_status: nextStatus,
        atlas_invite_sent_at: now,
        updated_at: now,
      })
      .eq("id", m.id);
    if (updErr) throw new Error(updErr.message);

    await logActivity(
      supabase,
      m.id,
      data.resend ? "ATLAS invite resent" : "ATLAS invite sent",
      adminName,
      { email: m.email },
    );

    return { ok: true, email: m.email };
  });

// ---------------------------------------------------------------------------
// Set ATLAS role
// ---------------------------------------------------------------------------

export const setAtlasRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ memberId: z.string().uuid(), role: z.enum(ROLES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { adminName } = await assertAdmin(supabase, userId);
    const m = await getMember(supabase, data.memberId);
    const oldRole = m.atlas_role;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("atlas_team_members")
      .update({ atlas_role: data.role, updated_at: now })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    if (oldRole !== data.role) {
      await logActivity(supabase, data.memberId, "Role updated", adminName, {
        from: oldRole,
        to: data.role,
      });
    }
    return { ok: true, role: data.role };
  });

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

export const resetMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { adminName } = await assertAdmin(supabase, userId);
    const m = await getMember(supabase, data.memberId);
    if (!m.email) throw new Error("Member has no email on file.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo =
      (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "") + "/" || undefined;
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(m.email, { redirectTo });
    if (error) throw new Error(`Password reset failed: ${error.message}`);

    const now = new Date().toISOString();
    const entry = {
      author: "System",
      timestamp: now,
      body: `Password reset triggered by ${adminName}.`,
    };
    const nextNotes = Array.isArray(m.admin_notes) ? [...m.admin_notes, entry] : [entry];
    const { error: updErr } = await supabase
      .from("atlas_team_members")
      .update({ admin_notes: nextNotes, updated_at: now })
      .eq("id", m.id);
    if (updErr) throw new Error(updErr.message);

    await logActivity(supabase, m.id, "Password reset triggered", adminName, { email: m.email });

    return { ok: true, email: m.email };

  });

// ---------------------------------------------------------------------------
// Add admin note
// ---------------------------------------------------------------------------

export const addAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      memberId: z.string().uuid(),
      body: z.string().trim().min(1).max(20000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { adminName } = await assertAdmin(supabase, userId);
    const m = await getMember(supabase, data.memberId);

    const now = new Date().toISOString();
    const entry = { author: adminName, timestamp: now, body: data.body };
    const nextNotes = Array.isArray(m.admin_notes) ? [...m.admin_notes, entry] : [entry];

    const { error } = await supabase
      .from("atlas_team_members")
      .update({ admin_notes: nextNotes, updated_at: now })
      .eq("id", m.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, m.id, "Admin note added", adminName, {
      preview: data.body.slice(0, 120),
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Remove from roster (soft-delete)
// ---------------------------------------------------------------------------

export const removeMemberFromRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { adminName } = await assertAdmin(supabase, userId);
    const m = await getMember(supabase, data.memberId);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("atlas_team_members")
      .update({
        is_removed: true,
        removed_at: now,
        removed_by: adminName,
        updated_at: now,
      })
      .eq("id", m.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, m.id, "Removed from roster", adminName);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Mission assignment helpers
// ---------------------------------------------------------------------------

export const getActiveMissionsForAssign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("missions")
      .select("id,name,status")
      .neq("status", "archived")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { missions: (data ?? []) as Array<{ id: string; name: string; status: string | null }> };
  });

export const getMemberMissionCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const m = await getMember(supabase, data.memberId);
    if (!m.email) return { count: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: auths } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = auths?.users?.find((u: any) => (u.email ?? "").toLowerCase() === m.email.toLowerCase());
    if (!authUser) return { count: 0 };

    const { count } = await supabaseAdmin
      .from("mission_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUser.id);
    return { count: count ?? 0 };
  });

export const assignMemberToMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      memberId: z.string().uuid(),
      assignments: z
        .array(
          z.object({
            missionId: z.string().uuid(),
            role: z.enum(["admin", "engagement_lead", "writer", "sme", "reviewer"]),
          }),
        )
        .min(1)
        .max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { adminName } = await assertAdmin(supabase, userId);
    const m = await getMember(supabase, data.memberId);
    if (!m.email) throw new Error("Member has no email on file; send an ATLAS invite first.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: auths } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = auths?.users?.find((u: any) => (u.email ?? "").toLowerCase() === m.email.toLowerCase());
    if (!authUser) {
      throw new Error(
        "This person doesn't have an ATLAS account yet. Send them an ATLAS invite first, then assign.",
      );
    }

    const displayName = [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || adminName;

    // mission_members.role enum may differ from atlas roles. We pass through
    // 'lead'/'writer'/'admin' style values commonly used. Map atlas → mission:
    // mission_members.role allows: admin, lead, writer, sme, viewer,
    // engagement_lead, project_manager, lead_writer, lead_graphics
    const ROLE_MAP: Record<string, string> = {
      admin: "admin",
      engagement_lead: "engagement_lead",
      writer: "writer",
      sme: "sme",
      reviewer: "viewer",
    };

    const rows = data.assignments.map((a) => ({
      mission_id: a.missionId,
      user_id: authUser.id,
      role: ROLE_MAP[a.role] ?? a.role,
      display_name: displayName,
    }));

    const { error, count } = await supabaseAdmin
      .from("mission_members")
      .upsert(rows, { onConflict: "mission_id,user_id", count: "exact" });
    if (error) throw new Error(`Assignment failed: ${error.message}`);

    await logActivity(supabase, m.id, "Assigned to mission", adminName, {
      assignments: data.assignments,
    });

    return { ok: true, count: count ?? rows.length };
  });

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

export const bulkSendAtlasInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ memberIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const { data: rows, error } = await supabase
      .from("atlas_team_members")
      .select("id,email,first_name,last_name,atlas_invite_status")
      .in("id", data.memberIds);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo =
      (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "") + "/" || undefined;

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const now = new Date().toISOString();

    for (const m of rows ?? []) {
      if (m.atlas_invite_status !== "not_invited" || !m.email) {
        skipped++;
        continue;
      }
      const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(m.email, {
        redirectTo,
        data: { first_name: m.first_name, last_name: m.last_name, source: "atlas_team_roster_bulk" },
      });
      if (inviteErr && !/already (registered|exists)/i.test(inviteErr.message)) {
        failed++;
        continue;
      }
      if (inviteErr) {
        const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(m.email, {
          redirectTo,
        });
        if (resetErr) {
          failed++;
          continue;
        }
      }
      const { error: updErr } = await supabase
        .from("atlas_team_members")
        .update({ atlas_invite_status: "invite_sent", atlas_invite_sent_at: now, updated_at: now })
        .eq("id", m.id);
      if (updErr) {
        failed++;
        continue;
      }
      sent++;
    }
    return { sent, skipped, failed };
  });

export const bulkSetAtlasRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      memberIds: z.array(z.string().uuid()).min(1).max(500),
      role: z.enum(ROLES),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const now = new Date().toISOString();
    const { error, count } = await supabase
      .from("atlas_team_members")
      .update({ atlas_role: data.role, updated_at: now }, { count: "exact" })
      .in("id", data.memberIds);
    if (error) throw new Error(error.message);
    const updated = count ?? data.memberIds.length;
    return { updated, failed: data.memberIds.length - updated };
  });

export const bulkAssignToMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      memberIds: z.array(z.string().uuid()).min(1).max(500),
      missionId: z.string().uuid(),
      role: z.enum(["admin", "engagement_lead", "writer", "sme", "reviewer"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const { data: rows, error: rErr } = await supabase
      .from("atlas_team_members")
      .select("id,email,first_name,last_name")
      .in("id", data.memberIds);
    if (rErr) throw new Error(rErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: auths } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const byEmail = new Map<string, any>();
    for (const u of auths?.users ?? []) {
      if (u.email) byEmail.set(u.email.toLowerCase(), u);
    }

    const ROLE_MAP: Record<string, string> = {
      admin: "admin",
      engagement_lead: "engagement_lead",
      writer: "writer",
      sme: "sme",
      reviewer: "viewer",
    };
    const mapped = ROLE_MAP[data.role] ?? data.role;

    const upserts: any[] = [];
    let skipped = 0;
    for (const m of rows ?? []) {
      const auth = m.email ? byEmail.get(m.email.toLowerCase()) : null;
      if (!auth) {
        skipped++;
        continue;
      }
      const displayName =
        [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || m.email;
      upserts.push({
        mission_id: data.missionId,
        user_id: auth.id,
        role: mapped,
        display_name: displayName,
      });
    }

    let assigned = 0;
    if (upserts.length > 0) {
      const { error, count } = await supabaseAdmin
        .from("mission_members")
        .upsert(upserts, { onConflict: "mission_id,user_id", count: "exact" });
      if (error) throw new Error(`Assignment failed: ${error.message}`);
      assigned = count ?? upserts.length;
    }
    return { assigned, skipped, failed: data.memberIds.length - assigned - skipped };
  });

// ---------------------------------------------------------------------------
// Pending Invites: auto-escalate + bulk resend (resend regardless of status)
// ---------------------------------------------------------------------------

/**
 * Mark any invite_sent member whose invite is >14 days old as never_logged_in.
 * Runs silently in the background when the Pending Invites tab loads.
 */
export const escalateOverdueInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("atlas_team_members")
      .update({ atlas_invite_status: "never_logged_in", updated_at: now })
      .eq("atlas_invite_status", "invite_sent")
      .lt("atlas_invite_sent_at", cutoff)
      .eq("is_removed", false)
      .select("id");
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: any) => r.id);
    for (const id of ids) {
      await logActivity(supabase, id, "Auto-escalated to Never Logged In", "System", {
        reason: "invite_age_over_14_days",
      });
    }
    return { escalated: ids.length };
  });

/**
 * Resend invites to a specific list of members regardless of current status
 * (used on the Pending Invites tab — "Resend All Overdue" and bulk action).
 */
export const bulkResendInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ memberIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { adminName } = await assertAdmin(supabase, userId);

    const { data: rows, error } = await supabase
      .from("atlas_team_members")
      .select("id,email,first_name,last_name,atlas_invite_status")
      .in("id", data.memberIds);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo =
      (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "") + "/" || undefined;

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const now = new Date().toISOString();

    for (const m of rows ?? []) {
      if (!m.email) {
        skipped++;
        continue;
      }
      const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(m.email, {
        redirectTo,
        data: { first_name: m.first_name, last_name: m.last_name, source: "atlas_team_roster_resend" },
      });
      if (inviteErr && !/already (registered|exists)/i.test(inviteErr.message)) {
        failed++;
        continue;
      }
      if (inviteErr) {
        const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(m.email, {
          redirectTo,
        });
        if (resetErr) {
          failed++;
          continue;
        }
      }
      const { error: updErr } = await supabase
        .from("atlas_team_members")
        .update({ atlas_invite_status: "invite_sent", atlas_invite_sent_at: now, updated_at: now })
        .eq("id", m.id);
      if (updErr) {
        failed++;
        continue;
      }
      await logActivity(supabase, m.id, "Invite resent", adminName, { email: m.email, bulk: true });
      sent++;
    }
    return { sent, skipped, failed };
  });
