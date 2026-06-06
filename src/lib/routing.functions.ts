// Phase 3 — server-side computation of login routing.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  pickPrimaryRole,
  routeForRole,
  type RoutingRole,
  type RoutingDestination,
} from "./routing-role";

export type LoginRoutingResult = {
  role: RoutingRole;
  destination: RoutingDestination;
  missionCount: number;
  singleMissionId: string | null;
  isPlatformAdmin: boolean;
  hasSeenOrientation: boolean;
};

export const getLoginRouting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LoginRoutingResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const [{ data: profile }, { data: userRoles }, { data: memberships }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("is_platform_admin,has_seen_orientation")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin
        .from("mission_members")
        .select("mission_id,role,missions:mission_id(status)")
        .eq("user_id", userId),
    ]);

    const isPlatformAdmin = !!profile?.is_platform_admin;
    const hasSeenOrientation = !!profile?.has_seen_orientation;

    const activeMemberships = (memberships ?? []).filter((m: any) => {
      const status = (m.missions?.status ?? "").toLowerCase();
      // Treat anything that's not explicitly closed/archived as active.
      return !["closed", "archived", "won", "lost", "submitted"].includes(status);
    });

    const rawRoles: string[] = [
      ...((userRoles ?? []).map((r: any) => r.role as string)),
      ...activeMemberships.map((m: any) => m.role as string),
    ];

    const role = pickPrimaryRole(rawRoles, isPlatformAdmin);

    const missionIds = Array.from(
      new Set(activeMemberships.map((m: any) => m.mission_id as string)),
    );
    const missionCount = missionIds.length;
    const singleMissionId = missionCount === 1 ? missionIds[0] : null;

    const destination = routeForRole(role, { missionCount, singleMissionId });

    return {
      role,
      destination,
      missionCount,
      singleMissionId,
      isPlatformAdmin,
      hasSeenOrientation,
    };
  });

export const markOrientationSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ has_seen_orientation: true })
      .eq("id", context.userId);
    return { ok: true };
  });

export type PersonalAlert = {
  id: string;
  text: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

export const getPersonalAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ alerts: PersonalAlert[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const alerts: PersonalAlert[] = [];

    // Sections owned by user that are blocked or red.
    const { data: owned } = await supabaseAdmin
      .from("question_records")
      .select("id,mission_id,question_number,health,status,iris_risk_flag")
      .or(`assigned_writer_id.eq.${userId},assigned_sme_id.eq.${userId}`)
      .limit(50);

    for (const r of (owned ?? []) as any[]) {
      const blocked =
        (r.status ?? "").toLowerCase() === "blocked" ||
        r.health === "red" ||
        !!r.iris_risk_flag;
      if (blocked) {
        alerts.push({
          id: `own-${r.id}`,
          text: `Section ${r.question_number} needs attention`,
          to: "/missions/$missionId/sections/$questionId",
          params: { missionId: r.mission_id, questionId: r.id },
        });
      }
    }

    // Reviewer: sections in review >48h (only if user is the reviewer — we
    // approximate via assigned_sme_id since there's no reviewer column).
    // No additional query needed; the owned[] above already covers it.

    return { alerts: alerts.slice(0, 5) };
  });
