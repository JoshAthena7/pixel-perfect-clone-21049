/**
 * Atlas onboarding gate — server functions.
 *
 * Every ATLAS user must complete the 5-step onboarding flow before they can
 * access any part of the platform. This file owns:
 *   - getAtlasOnboardingState(): resolve gate state for the current user;
 *     on first-ever hit it stamps atlas_first_login_at / onboarding_started_at
 *     and logs "First login — onboarding started".
 *   - updateAtlasOnboardingStep(step): persist the highest completed step
 *     (monotonic — never decreases).
 *   - completeAtlasOnboarding(): final writebacks when step 5 is confirmed.
 *
 * Notes
 * -----
 * Writes to atlas_team_members and atlas_activity_log are admin-only by RLS,
 * so this module uses the service-role admin client. We still require auth
 * (requireSupabaseAuth) and look the member up by the authenticated user's
 * email — users can only ever resolve / mutate their OWN row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AtlasOnboardingState =
  | { status: "no_member" }
  | {
      status: "complete";
      memberId: string;
      firstName: string | null;
      step: 5;
    }
  | {
      status: "incomplete";
      memberId: string;
      firstName: string | null;
      step: 0 | 1 | 2 | 3 | 4;
      resuming: boolean; // true when step > 0 (user is mid-flow)
    };

async function loadMemberByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("atlas_team_members")
    .select(
      "id,email,first_name,last_name,atlas_role,atlas_onboarding_complete,onboarding_step_completed,atlas_first_login_at,onboarding_started_at,is_removed",
    )
    .ilike("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export type CelebrationContext = {
  firstName: string | null;
  lastName: string | null;
  atlasRole: string;
  firstMission: {
    id: string;
    name: string;
    subtitle: string | null;
  } | null;
};

export const getAtlasCelebrationContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CelebrationContext> => {
    const email = (context.claims?.email as string | undefined) ?? "";
    const userId = context.userId as string | undefined;
    const member = email ? await loadMemberByEmail(email) : null;
    const base: CelebrationContext = {
      firstName: member?.first_name ?? null,
      lastName: member?.last_name ?? null,
      atlasRole: member?.atlas_role ?? "unassigned",
      firstMission: null,
    };
    if (!userId) return base;
    try {
      const { data } = await supabaseAdmin
        .from("mission_team_members")
        .select("mission_id,active,missions(id,name,client_name,status)")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(5);
      const row = (data ?? []).find(
        // @ts-expect-error -- joined shape from PostgREST
        (r) => r.missions && (r.missions.status ?? "active") !== "archived",
      );
      if (row) {
        // @ts-expect-error -- joined shape
        const m = row.missions;
        base.firstMission = {
          id: m.id,
          name: m.name,
          subtitle: m.client_name ?? null,
        };
      }
    } catch (e) {
      console.error("[atlas-onboarding] first mission lookup failed", e);
    }
    return base;
  });

export const getAtlasOnboardingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AtlasOnboardingState> => {
    const email = (context.claims?.email as string | undefined) ?? "";
    if (!email) return { status: "no_member" };

    const member = await loadMemberByEmail(email);
    if (!member || member.is_removed) return { status: "no_member" };

    // First-ever login — stamp first_login_at + onboarding_started_at and log.
    if (!member.atlas_first_login_at) {
      const now = new Date().toISOString();
      await supabaseAdmin
        .from("atlas_team_members")
        .update({
          atlas_first_login_at: now,
          onboarding_started_at: member.onboarding_started_at ?? now,
          atlas_invite_status: "onboarding_incomplete",
        })
        .eq("id", member.id);
      try {
        await supabaseAdmin.from("atlas_activity_log").insert({
          member_id: member.id,
          action: "First login — onboarding started",
          performed_by: member.email,
          metadata: {},
        });
      } catch (e) {
        console.error("[atlas-onboarding] activity log write failed", e);
      }
    }

    if (member.atlas_onboarding_complete) {
      return {
        status: "complete",
        memberId: member.id,
        firstName: member.first_name,
        step: 5,
      };
    }

    const rawStep = member.onboarding_step_completed ?? 0;
    const step = Math.max(0, Math.min(4, rawStep)) as 0 | 1 | 2 | 3 | 4;
    return {
      status: "incomplete",
      memberId: member.id,
      firstName: member.first_name,
      step,
      resuming: step > 0,
    };
  });

export const updateAtlasOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        step: z.number().int().min(1).max(4),
        activityMessage: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string | undefined) ?? "";
    if (!email) throw new Error("No email on session.");
    const member = await loadMemberByEmail(email);
    if (!member) throw new Error("No team-member record found for this user.");
    const current = member.onboarding_step_completed ?? 0;
    if (data.step > current) {
      const { error } = await supabaseAdmin
        .from("atlas_team_members")
        .update({ onboarding_step_completed: data.step })
        .eq("id", member.id);
      if (error) throw new Error(error.message);
      if (data.activityMessage) {
        try {
          await supabaseAdmin.from("atlas_activity_log").insert({
            member_id: member.id,
            action: data.activityMessage,
            performed_by: member.email,
            metadata: { step: data.step },
          });
        } catch (e) {
          console.error("[atlas-onboarding] activity log write failed", e);
        }
      }
    }
    return { ok: true, step: Math.max(current, data.step) };
  });

export const acknowledgeAtlasHipaa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        signature: z
          .string()
          .trim()
          .min(5, "Please enter your full legal name to continue.")
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string | undefined) ?? "";
    if (!email) throw new Error("No email on session.");
    const member = await loadMemberByEmail(email);
    if (!member) throw new Error("No team-member record found for this user.");

    const { error } = await supabaseAdmin
      .from("atlas_team_members")
      .update({
        atlas_hipaa_acknowledged: true,
        // Authoritative server timestamp.
        atlas_hipaa_acknowledged_at: new Date().toISOString(),
        atlas_hipaa_signature: data.signature,
        onboarding_step_completed: Math.max(
          member.onboarding_step_completed ?? 0,
          2,
        ),
      })
      .eq("id", member.id);
    if (error) throw new Error(error.message);

    // BEFORE-UPDATE trigger recomputes atlas_profile_completeness, so the
    // +10 HIPAA points land automatically.

    try {
      await supabaseAdmin.from("atlas_activity_log").insert({
        member_id: member.id,
        action:
          "Onboarding Step 2 completed — HIPAA and security acknowledgment signed",
        performed_by: member.email,
        metadata: { signature: data.signature, step: 2 },
      });
    } catch (e) {
      console.error("[atlas-onboarding] activity log write failed", e);
    }
    return { ok: true };
  });




export const completeAtlasOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims?.email as string | undefined) ?? "";
    if (!email) throw new Error("No email on session.");
    const member = await loadMemberByEmail(email);
    if (!member) throw new Error("No team-member record found for this user.");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("atlas_team_members")
      .update({
        atlas_onboarding_complete: true,
        atlas_invite_status: "active",
        atlas_last_active_at: now,
        onboarding_completed_at: now,
        onboarding_step_completed: 5,
      })
      .eq("id", member.id);
    if (error) throw new Error(error.message);

    // The BEFORE-UPDATE trigger on atlas_team_members recomputes
    // atlas_profile_completeness via public.calc_atlas_profile_completeness —
    // no manual recalculation needed here.

    try {
      await supabaseAdmin.from("atlas_activity_log").insert({
        member_id: member.id,
        action: "Onboarding completed — user is now active",
        performed_by: member.email,
        metadata: {},
      });
    } catch (e) {
      console.error("[atlas-onboarding] activity log write failed", e);
    }
    return { ok: true };
  });
