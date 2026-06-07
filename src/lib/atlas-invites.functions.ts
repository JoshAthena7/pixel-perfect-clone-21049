import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only platform admins can manage Atlas invites.");
}

export const listAtlasInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("atlas_invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(254),
        displayName: z.string().min(1).max(120).optional(),
        roleHint: z.string().max(60).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("atlas_invites")
      .insert({
        email: data.email.toLowerCase(),
        display_name: data.displayName ?? null,
        role_hint: data.roleHint ?? null,
        notes: data.notes ?? null,
        invited_by: userId,
        status: "awaiting_contract",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        displayName: z.string().max(120).nullable().optional(),
        roleHint: z.string().max(60).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      display_name?: string | null;
      role_hint?: string | null;
      notes?: string | null;
    } = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.roleHint !== undefined) patch.role_hint = data.roleHint;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setContractSigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), signed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readErr } = await supabaseAdmin
      .from("atlas_invites")
      .select("status, invite_sent_at, accepted_at")
      .eq("id", data.id)
      .single();
    if (readErr) throw new Error(readErr.message);
    const nextStatus = data.signed
      ? current.accepted_at
        ? "accepted"
        : current.invite_sent_at
          ? "invite_sent"
          : "ready_to_invite"
      : "awaiting_contract";
    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .update({
        contract_signed: data.signed,
        contract_signed_at: data.signed ? new Date().toISOString() : null,
        contract_signed_by: data.signed ? userId : null,
        status: nextStatus,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: readErr } = await supabaseAdmin
      .from("atlas_invites")
      .select("*")
      .eq("id", data.id)
      .single();
    if (readErr) throw new Error(readErr.message);
    if (!invite.contract_signed) {
      throw new Error("Contract must be marked signed before sending an invite.");
    }

    // If they already have an Atlas profile, link it and mark accepted.
    let acceptedUserId: string | null = invite.accepted_user_id;
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", invite.email)
      .maybeSingle();
    if (existing?.id) acceptedUserId = existing.id;

    if (!acceptedUserId) {
      const { data: invited, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(invite.email);
      if (inviteErr) {
        // User already exists in auth.users without a profile row — find them.
        const target = invite.email.toLowerCase();
        let found: string | null = null;
        for (let page = 1; page <= 20 && !found; page++) {
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: 200,
          });
          if (listErr) break;
          const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === target);
          if (hit) found = hit.id;
          if (list.users.length < 200) break;
        }
        if (!found) throw new Error(inviteErr.message);
        acceptedUserId = found;
      } else {
        acceptedUserId = invited.user?.id ?? null;
      }
    }

    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .update({
        invite_sent_at: new Date().toISOString(),
        invite_sent_by: userId,
        accepted_user_id: acceptedUserId,
        status: existing?.id ? "accepted" : "invite_sent",
        accepted_at: existing?.id ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, userId: acceptedUserId };
  });

export const deleteAtlasInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ─────────── Three-state user model ─────────── */

export const loadUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(254),
        displayName: z.string().min(1).max(120).optional(),
        roleHint: z.string().max(60).optional(),
        notes: z.string().max(2000).optional(),
        missionId: z.string().uuid().optional(),
        role: z.string().max(120).optional(),
        expectedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        engagementLeadId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const { data: row, error } = await supabaseAdmin
      .from("atlas_invites")
      .insert({
        email,
        display_name: data.displayName ?? null,
        role_hint: data.roleHint ?? data.role ?? null,
        role: data.role ?? null,
        mission_id: data.missionId ?? null,
        expected_start_date: data.expectedStartDate ?? null,
        engagement_lead_id: data.engagementLeadId ?? userId,
        notes: data.notes ?? null,
        invited_by: userId,
        contract_signed: true,
        contract_signed_at: new Date().toISOString(),
        contract_signed_by: userId,
        status: "ready_to_invite",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const sendOfficialInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        baseUrl: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: readErr } = await supabaseAdmin
      .from("atlas_invites")
      .select("*")
      .eq("id", data.id)
      .single();
    if (readErr) throw new Error(readErr.message);

    // Resolve mission name
    let missionName = "your pursuit";
    if (invite.mission_id) {
      const { data: m } = await supabaseAdmin
        .from("missions")
        .select("name")
        .eq("id", invite.mission_id)
        .maybeSingle();
      if (m?.name) missionName = m.name;
    }

    // Resolve engagement lead name
    let engagementLeadName = "Your Engagement Lead";
    const leadId = invite.engagement_lead_id ?? invite.invited_by;
    if (leadId) {
      const { data: lead } = await supabaseAdmin
        .from("profiles")
        .select("display_name,email")
        .eq("id", leadId)
        .maybeSingle();
      if (lead) engagementLeadName = lead.display_name || lead.email || engagementLeadName;
    }

    // Mint a fresh 72hr token
    const rawToken = generateInviteToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    // Invalidate prior unused tokens for this invite
    await supabaseAdmin
      .from("atlas_invite_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("invite_id", invite.id)
      .is("used_at", null);

    const { error: tokErr } = await supabaseAdmin
      .from("atlas_invite_tokens")
      .insert({
        invite_id: invite.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: userId,
      });
    if (tokErr) throw new Error(tokErr.message);

    const acceptUrl = `${data.baseUrl.replace(/\/$/, "")}/onboarding?token=${rawToken}`;
    const expectedStartDate = invite.expected_start_date
      ? new Date(invite.expected_start_date + "T00:00:00Z").toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "TBD";

    // Render branded email and enqueue via Lovable email infrastructure
    try {
      const React = await import("react");
      const { render } = await import("@react-email/components");
      const { template } = await import("@/lib/email-templates/mission-invite");

      const templateData = {
        recipientName: invite.display_name || invite.email.split("@")[0],
        missionName,
        role: invite.role || invite.role_hint || "Team Member",
        engagementLeadName,
        expectedStartDate,
        acceptUrl,
      };

      const element = React.createElement(template.component as any, templateData);
      const html = await render(element);
      const text = await render(element, { plainText: true });
      const subject =
        typeof template.subject === "function"
          ? template.subject(templateData)
          : template.subject;

      const messageId = crypto.randomUUID();
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "mission-invite",
        recipient_email: invite.email,
        status: "pending",
      });

      const { error: enqueueErr } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: invite.email,
          from: "Athena Strategy Command <noreply@athenacommandcenter.com>",
          sender_domain: "notify.athenacommandcenter.com",
          subject,
          html,
          text,
          purpose: "transactional",
          label: "mission-invite",
          idempotency_key: `mission-invite-${invite.id}-${Date.now()}`,
          queued_at: new Date().toISOString(),
        },
      });
      if (enqueueErr) {
        console.error("Failed to enqueue mission invite email", enqueueErr);
      }
    } catch (err) {
      console.error("Failed to render/enqueue mission invite email", err);
    }

    // Mark invite as sent
    const { error: upErr } = await supabaseAdmin
      .from("atlas_invites")
      .update({
        invite_sent_at: new Date().toISOString(),
        invite_sent_by: userId,
        status: "invite_sent",
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, acceptUrl };
  });

export const listMissionsForRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("missions")
      .select("id,name")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const validateInviteToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(16).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await sha256Hex(data.token);
    const { data: row } = await supabaseAdmin
      .from("atlas_invite_tokens")
      .select("id,invite_id,expires_at,used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!row) return { valid: false as const, reason: "invalid" as const };
    if (row.used_at) return { valid: false as const, reason: "used" as const };
    if (new Date(row.expires_at).getTime() < Date.now())
      return { valid: false as const, reason: "expired" as const };

    const { data: invite } = await supabaseAdmin
      .from("atlas_invites")
      .select("email,display_name,mission_id,role")
      .eq("id", row.invite_id)
      .maybeSingle();
    if (!invite) return { valid: false as const, reason: "invalid" as const };

    let missionName: string | null = null;
    if (invite.mission_id) {
      const { data: m } = await supabaseAdmin
        .from("missions")
        .select("name")
        .eq("id", invite.mission_id)
        .maybeSingle();
      missionName = m?.name ?? null;
    }

    return {
      valid: true as const,
      email: invite.email,
      displayName: invite.display_name,
      missionName,
      role: invite.role,
    };
  });

export const claimInviteToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        token: z.string().min(16).max(128),
        password: z.string().min(8).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await sha256Hex(data.token);

    const { data: row } = await supabaseAdmin
      .from("atlas_invite_tokens")
      .select("id,invite_id,expires_at,used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!row) throw new Error("Invalid invitation link.");
    if (row.used_at) throw new Error("This invitation has already been used.");
    if (new Date(row.expires_at).getTime() < Date.now())
      throw new Error("This invitation has expired. Contact your Engagement Lead.");

    const { data: invite, error: invErr } = await supabaseAdmin
      .from("atlas_invites")
      .select("email,display_name")
      .eq("id", row.invite_id)
      .single();
    if (invErr) throw new Error(invErr.message);

    // Find or create the auth user with this email and password
    let authUserId: string | null = null;
    for (let page = 1; page <= 20 && !authUserId; page++) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listErr) break;
      const hit = list.users.find(
        (u) => (u.email ?? "").toLowerCase() === invite.email.toLowerCase(),
      );
      if (hit) authUserId = hit.id;
      if (list.users.length < 200) break;
    }

    if (authUserId) {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: data.password,
        email_confirm: true,
      });
      if (updErr) throw new Error(updErr.message);
    } else {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: invite.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { display_name: invite.display_name ?? undefined },
      });
      if (createErr) throw new Error(createErr.message);
      authUserId = created.user?.id ?? null;
    }
    if (!authUserId) throw new Error("Could not provision account.");

    // Mark token used + invite accepted
    await supabaseAdmin
      .from("atlas_invite_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);
    await supabaseAdmin
      .from("atlas_invites")
      .update({ accepted_user_id: authUserId })
      .eq("id", row.invite_id);

    return { ok: true, email: invite.email };
  });


type RosterEntry = {
  key: string;
  state: "loaded" | "invited" | "active";
  email: string;
  display_name: string | null;
  role_hint: string | null;
  invite_id: string | null;
  invite_sent_at: string | null;
  user_id: string | null;
  last_login_at: string | null;
  has_onboarded: boolean;
  active_missions: number;
  created_at: string;
  mission_id: string | null;
  mission_name: string | null;
  role: string | null;
  expected_start_date: string | null;
  engagement_lead_name: string | null;
};

export const listTeamRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: invites }, { data: profiles }, { data: memberships }, { data: missions }] =
      await Promise.all([
        supabaseAdmin
          .from("atlas_invites")
          .select(
            "id,email,display_name,role_hint,role,invite_sent_at,accepted_user_id,created_at,mission_id,expected_start_date,engagement_lead_id,invited_by",
          )
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("profiles")
          .select("id,display_name,email,has_onboarded,last_login_at,created_at"),
        supabaseAdmin.from("mission_members").select("user_id,mission_id"),
        supabaseAdmin.from("missions").select("id,name"),
      ]);

    const missionsByUser = new Map<string, number>();
    for (const m of memberships ?? []) {
      if (!m.user_id) continue;
      missionsByUser.set(m.user_id, (missionsByUser.get(m.user_id) ?? 0) + 1);
    }
    const missionNameById = new Map<string, string>();
    for (const m of missions ?? []) missionNameById.set(m.id, m.name);

    const profileByEmail = new Map<string, any>();
    const profileById = new Map<string, any>();
    for (const p of profiles ?? []) {
      if (p.email) profileByEmail.set(p.email.toLowerCase(), p);
      profileById.set(p.id, p);
    }

    const entries: RosterEntry[] = [];
    const claimedProfileIds = new Set<string>();

    for (const inv of invites ?? []) {
      const emailLower = inv.email.toLowerCase();
      const linked =
        (inv.accepted_user_id ? profileById.get(inv.accepted_user_id) : null) ??
        profileByEmail.get(emailLower) ??
        null;
      if (linked?.id) claimedProfileIds.add(linked.id);

      let state: RosterEntry["state"];
      if (linked?.has_onboarded) state = "active";
      else if (inv.invite_sent_at) state = "invited";
      else state = "loaded";

      const leadId = inv.engagement_lead_id ?? inv.invited_by ?? null;
      const leadProfile = leadId ? profileById.get(leadId) : null;

      entries.push({
        key: `inv:${inv.id}`,
        state,
        email: inv.email,
        display_name: linked?.display_name ?? inv.display_name ?? null,
        role_hint: inv.role_hint ?? null,
        invite_id: inv.id,
        invite_sent_at: inv.invite_sent_at,
        user_id: linked?.id ?? null,
        last_login_at: linked?.last_login_at ?? null,
        has_onboarded: linked?.has_onboarded === true,
        active_missions: linked?.id ? (missionsByUser.get(linked.id) ?? 0) : 0,
        created_at: inv.created_at,
        mission_id: inv.mission_id ?? null,
        mission_name: inv.mission_id ? (missionNameById.get(inv.mission_id) ?? null) : null,
        role: inv.role ?? inv.role_hint ?? null,
        expected_start_date: inv.expected_start_date ?? null,
        engagement_lead_name:
          leadProfile?.display_name ?? leadProfile?.email ?? null,
      });
    }


    // Legacy profiles with no invite row → treat as ACTIVE.
    for (const p of profiles ?? []) {
      if (claimedProfileIds.has(p.id)) continue;
      entries.push({
        key: `prof:${p.id}`,
        state: p.has_onboarded ? "active" : "invited",
        email: p.email ?? "",
        display_name: p.display_name ?? null,
        role_hint: null,
        invite_id: null,
        invite_sent_at: null,
        user_id: p.id,
        last_login_at: p.last_login_at ?? null,
        has_onboarded: p.has_onboarded === true,
        active_missions: missionsByUser.get(p.id) ?? 0,
        created_at: p.created_at ?? new Date(0).toISOString(),
        mission_id: null,
        mission_name: null,
        role: null,
        expected_start_date: null,
        engagement_lead_name: null,
      });
    }

    entries.sort((a, b) => {
      const order = { loaded: 0, invited: 1, active: 2 } as const;
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return b.created_at.localeCompare(a.created_at);
    });

    return entries;
  });

export const markOnboardingComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ has_onboarded: true, onboarded_at: nowIso })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("atlas_invites")
      .update({
        accepted_user_id: userId,
        accepted_at: nowIso,
        status: "accepted",
      })
      .eq("accepted_user_id", userId);

    return { ok: true };
  });

/**
 * Mint a fresh 72hr invite token and return the onboarding URL — without
 * sending an email. Used by the "Copy Invite Link" admin action.
 */
export const generateInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), baseUrl: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rawToken = generateInviteToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("atlas_invite_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("invite_id", data.id)
      .is("used_at", null);

    const { error: tokErr } = await supabaseAdmin
      .from("atlas_invite_tokens")
      .insert({
        invite_id: data.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: userId,
      });
    if (tokErr) throw new Error(tokErr.message);

    const url = `${data.baseUrl.replace(/\/$/, "")}/onboarding?token=${rawToken}`;
    return { url, expires_at: expiresAt };
  });

/**
 * Remove an invite from the roster. Invalidates any outstanding tokens,
 * then deletes the atlas_invites row. Leaves any linked profile in place.
 */
export const removeInviteFromRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("atlas_invite_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("invite_id", data.id)
      .is("used_at", null);

    const { error } = await supabaseAdmin
      .from("atlas_invites")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
