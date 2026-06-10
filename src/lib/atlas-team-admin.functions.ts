import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin server fns for the Atlas Team roster page.
 * - listAtlasTeam: paginated read of active members
 * - addAtlasTeamMember: manual single-row insert (no TalentDesk fields)
 *
 * The CSV import/commit flow lives in atlas-team-sync.functions.ts.
 */

async function assertAdmin(supabase: any, userId: string) {
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) throw new Error("Only platform admins can manage the Atlas team.");
}

export const listAtlasTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const { data, error } = await supabase
      .from("atlas_team_members")
      .select(
        "id,email,first_name,last_name,job_title,phone,atlas_role,atlas_invite_status,talentdesk_id,is_removed,created_at,updated_at",
      )
      .eq("is_removed", false)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { members: data ?? [] };
  });

const ALLOWED_ROLES = ["admin", "engagement_lead", "writer", "sme", "reviewer", "unassigned"] as const;

const AddInput = z.object({
  email: z.string().trim().email().max(320),
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  job_title: z.string().trim().max(240).optional().default(""),
  phone: z.string().trim().max(64).optional().default(""),
  atlas_role: z.string().trim().max(120).optional().default(""),
});

function normalizeRole(r: string | null | undefined): string {
  const v = (r ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return (ALLOWED_ROLES as readonly string[]).includes(v) ? v : "unassigned";
}

export const addAtlasTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const email = data.email.toLowerCase();

    const { data: existing } = await supabase
      .from("atlas_team_members")
      .select("id,is_removed")
      .ilike("email", email)
      .maybeSingle();
    if (existing && !existing.is_removed) {
      throw new Error("A team member with that email already exists.");
    }

    const row = {
      email,
      first_name: data.first_name,
      last_name: data.last_name,
      job_title: data.job_title || null,
      phone: data.phone || null,
      atlas_role: normalizeRole(data.atlas_role),
      atlas_invite_status: "not_invited",
      is_removed: false,
      skills: [],
      languages: [],
    };

    if (existing?.is_removed) {
      const { data: upd, error } = await supabase
        .from("atlas_team_members")
        .update({ ...row, removed_at: null, removed_by: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await supabase.from("atlas_activity_log").insert({
        member_id: upd.id,
        action: "Re-added to roster (manual)",
        performed_by: userId,
        metadata: { email },
      });
      return { id: upd.id, mode: "reactivated" as const };
    }

    const { data: ins, error } = await supabase
      .from("atlas_team_members")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("atlas_activity_log").insert({
      member_id: ins.id,
      action: "Added to roster (manual)",
      performed_by: userId,
      metadata: { email },
    });
    return { id: ins.id, mode: "inserted" as const };
  });

const RemoveInput = z.object({ id: z.string().uuid() });

export const removeAtlasTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RemoveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("atlas_team_members")
      .update({
        is_removed: true,
        removed_at: new Date().toISOString(),
        removed_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const GetInput = z.object({ id: z.string().uuid() });

export const getAtlasTeamMember = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: member, error } = await supabase
      .from("atlas_team_members")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!member) throw new Error("Team member not found.");

    const { data: activity } = await supabase
      .from("atlas_activity_log")
      .select("id,action,metadata,performed_by,created_at")
      .eq("member_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return { member, activity: activity ?? [] };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(120).optional(),
  last_name: z.string().trim().min(1).max(120).optional(),
  job_title: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  languages: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  atlas_resume_url: z.string().trim().url().max(1000).nullable().optional(),
});

export const updateAtlasTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("atlas_team_members")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await supabase.from("atlas_activity_log").insert({
      member_id: id,
      action: "Profile updated",
      performed_by: userId,
      metadata: { fields: Object.keys(patch) },
    });
    return { ok: true };
  });
