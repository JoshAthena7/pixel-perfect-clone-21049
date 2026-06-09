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
    await assertAdmin(supabase, userId);
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
    await assertAdmin(supabase, userId);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("atlas_team_members")
      .update({ atlas_role: data.role, updated_at: now })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
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

    return { ok: true, count: count ?? rows.length };
  });
