import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Atlas Team sync — ingests a TalentDesk CSV export into atlas_team_members.
 *
 * Email is the primary merge key (case-insensitive, trimmed).
 * - New emails  → INSERT, atlas_invite_status='not_invited'
 * - Existing    → UPDATE only TalentDesk-prefixed fields; never touch atlas_* fields, admin_notes, or role
 * - Missing     → flagged for admin review; only removed if admin opted-in via removeIds
 * - Duplicates in CSV → conflicts, blocked from import
 */

const CsvRowSchema = z.object({
  talentdesk_id: z.string().max(128).nullable().optional(),
  email: z.string().email().max(320),
  first_name: z.string().max(120).nullable().optional(),
  last_name: z.string().max(120).nullable().optional(),
  job_title: z.string().max(240).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  avatar_url: z.string().max(2000).nullable().optional(),
  skills: z.array(z.string().max(120)).max(200).nullable().optional(),
  languages: z.array(z.string().max(120)).max(50).nullable().optional(),
  talentdesk_status: z.enum(["approved", "pending_onboarding"]).nullable().optional(),
  talentdesk_date_joined: z.string().max(40).nullable().optional(),
  talentdesk_last_login: z.string().max(40).nullable().optional(),
  talentdesk_invited_by: z.string().max(240).nullable().optional(),
});

const PreviewInput = z.object({
  rows: z.array(CsvRowSchema).min(1).max(5000),
});

const CommitInput = z.object({
  rows: z.array(CsvRowSchema).min(1).max(5000),
  removeIds: z.array(z.string().uuid()).max(5000).default([]),
  fileName: z.string().max(255).optional(),
});

type Row = z.infer<typeof CsvRowSchema>;

type PlanResult = {
  toInsert: Row[];
  toUpdate: Array<{ id: string; row: Row; existing: ExistingMember }>;
  missing: ExistingMember[]; // in DB but not in CSV
  conflicts: Array<{ email: string; count: number }>;
};

type ExistingMember = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

function normEmail(e: string) {
  return e.trim().toLowerCase();
}

function detectDuplicates(rows: Row[]): { unique: Row[]; conflicts: Array<{ email: string; count: number }> } {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = normEmail(r.email);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dupKeys = new Set<string>();
  const conflicts: Array<{ email: string; count: number }> = [];
  for (const [k, c] of counts) {
    if (c > 1) {
      dupKeys.add(k);
      conflicts.push({ email: k, count: c });
    }
  }
  const unique = rows.filter((r) => !dupKeys.has(normEmail(r.email)));
  return { unique, conflicts };
}

async function buildPlan(supabase: any, rows: Row[]): Promise<PlanResult> {
  const { unique, conflicts } = detectDuplicates(rows);

  const { data: existingRows, error } = await supabase
    .from("atlas_team_members")
    .select("id,email,first_name,last_name")
    .eq("is_removed", false);
  if (error) throw new Error(`Failed to load existing team: ${error.message}`);

  const existing = (existingRows ?? []) as ExistingMember[];
  const byEmail = new Map<string, ExistingMember>();
  for (const m of existing) byEmail.set(normEmail(m.email), m);

  const csvEmails = new Set<string>();
  const toInsert: Row[] = [];
  const toUpdate: Array<{ id: string; row: Row; existing: ExistingMember }> = [];

  for (const r of unique) {
    const key = normEmail(r.email);
    csvEmails.add(key);
    const found = byEmail.get(key);
    if (found) toUpdate.push({ id: found.id, row: r, existing: found });
    else toInsert.push(r);
  }

  const missing = existing.filter((m) => !csvEmails.has(normEmail(m.email)));

  return { toInsert, toUpdate, missing, conflicts };
}

export const previewAtlasTeamSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Only platform admins can sync the Atlas team.");

    const plan = await buildPlan(supabase, data.rows);
    return {
      newMembers: plan.toInsert.map((r) => ({
        email: r.email,
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
      })),
      updatedMembers: plan.toUpdate.map((u) => ({
        id: u.id,
        email: u.row.email,
        first_name: u.row.first_name ?? u.existing.first_name,
        last_name: u.row.last_name ?? u.existing.last_name,
      })),
      missing: plan.missing.map((m) => ({
        id: m.id,
        email: m.email,
        first_name: m.first_name,
        last_name: m.last_name,
      })),
      conflicts: plan.conflicts,
    };
  });

function tdFields(r: Row) {
  return {
    talentdesk_id: r.talentdesk_id ?? null,
    first_name: r.first_name ?? null,
    last_name: r.last_name ?? null,
    job_title: r.job_title ?? null,
    phone: r.phone ?? null,
    address: r.address ?? null,
    avatar_url: r.avatar_url ?? null,
    skills: r.skills ?? [],
    languages: r.languages ?? [],
    talentdesk_status: r.talentdesk_status ?? null,
    talentdesk_date_joined: r.talentdesk_date_joined || null,
    talentdesk_last_login: r.talentdesk_last_login || null,
    talentdesk_invited_by: r.talentdesk_invited_by ?? null,
    updated_at: new Date().toISOString(),
  };
}

export const commitAtlasTeamSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CommitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Only platform admins can sync the Atlas team.");

    const plan = await buildPlan(supabase, data.rows);
    if (plan.conflicts.length > 0) {
      throw new Error(`Cannot commit: ${plan.conflicts.length} duplicate email(s) in CSV must be resolved first.`);
    }

    let added = 0;
    let updated = 0;
    let removed = 0;
    const errors: Array<{ email?: string; error: string }> = [];

    // INSERT new members
    if (plan.toInsert.length > 0) {
      const inserts = plan.toInsert.map((r) => ({
        email: r.email.trim(),
        atlas_invite_status: "not_invited",
        ...tdFields(r),
      }));
      const { data: insRows, error } = await supabase
        .from("atlas_team_members")
        .insert(inserts)
        .select("id,email");
      if (error) errors.push({ error: `Insert failed: ${error.message}` });
      else {
        added = insRows?.length ?? inserts.length;
        // Activity log per inserted member (best-effort; never blocks).
        for (const row of insRows ?? []) {
          try {
            await supabase.from("atlas_activity_log").insert({
              member_id: row.id,
              action: "Added to roster via TalentDesk sync",
              performed_by: "TalentDesk sync",
              metadata: { email: row.email },
            });
          } catch {
            /* swallow */
          }
        }
      }
    }

    // UPDATE existing — only TalentDesk fields
    for (const u of plan.toUpdate) {
      const { error } = await supabase
        .from("atlas_team_members")
        .update(tdFields(u.row))
        .eq("id", u.id);
      if (error) errors.push({ email: u.row.email, error: error.message });
      else {
        updated += 1;
        try {
          await supabase.from("atlas_activity_log").insert({
            member_id: u.id,
            action: "Record updated via TalentDesk sync",
            performed_by: "TalentDesk sync",
            metadata: { email: u.row.email },
          });
        } catch {
          /* swallow */
        }
      }
    }

    // REMOVE — only admin-selected
    const removeIds = data.removeIds.filter((id) => plan.missing.some((m) => m.id === id));
    if (removeIds.length > 0) {
      const { error, count } = await supabase
        .from("atlas_team_members")
        .update({
          is_removed: true,
          removed_at: new Date().toISOString(),
          removed_by: userId,
          updated_at: new Date().toISOString(),
        })
        .in("id", removeIds)
        .select("id", { count: "exact" });
      if (error) errors.push({ error: `Remove failed: ${error.message}` });
      else removed = count ?? removeIds.length;
    }

    const flagged = plan.missing.length; // total flagged for review (regardless of removal)

    // Write sync log
    const { error: logErr } = await supabase.from("atlas_team_sync_log").insert({
      synced_by: userId,
      records_added: added,
      records_updated: updated,
      records_flagged: flagged,
      conflicts: errors.length > 0 ? errors : [],
    });
    if (logErr) errors.push({ error: `Log write failed: ${logErr.message}` });

    return {
      added,
      updated,
      flagged,
      removed,
      conflicts: errors,
    };
  });
