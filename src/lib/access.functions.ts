import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the current user's platform-level access flags.
 * `isAdmin` is the platform admin role from `user_roles` — gives access to
 * Olympus and every mission per the Permissions spec.
 */
export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "project_manager"])
      .limit(1)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      console.error("getMyAccess error", error);
    }
    return { isAdmin: !!data, userId };
  });

/**
 * Returns whether the current user can access the given mission.
 * Admins always can. Otherwise checks mission_members membership.
 * RLS would also filter, but we want a single explicit boolean for the gate.
 */
export const canAccessMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ missionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRow) return { allowed: true, isAdmin: true };

    const { data: memberRow } = await supabase
      .from("mission_members")
      .select("role")
      .eq("user_id", userId)
      .eq("mission_id", data.missionId)
      .maybeSingle();

    return { allowed: !!memberRow, isAdmin: false, role: memberRow?.role ?? null };
  });

/**
 * Returns the mission a user should land on by default (most recent membership,
 * or — for admins with no memberships — the most recent mission overall).
 * Used to redirect users who hit a surface they're not allowed to see.
 */
export const getDefaultLandingMission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Most recent mission this user is a member of.
    const { data: member } = await supabase
      .from("mission_members")
      .select("mission_id, missions!inner(created_at)")
      .eq("user_id", userId)
      .order("missions(created_at)", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (member?.mission_id) return { missionId: member.mission_id as string };

    // Admin fallback: most recent mission overall.
    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRow) {
      const { data: mission } = await supabase
        .from("missions")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { missionId: (mission?.id as string) ?? null };
    }

    return { missionId: null };
  });

/**
 * PM-level access for a mission: admins, plus mission_members rows whose role
 * is admin/lead/engagement_lead/project_manager. Used to gate Mission Command.
 */
export const canPmAccessMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ missionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRow) return { allowed: true, isAdmin: true };

    const { data: memberRow } = await supabase
      .from("mission_members")
      .select("role")
      .eq("user_id", userId)
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const role = memberRow?.role ?? null;
    const allowed =
      role === "admin" ||
      role === "lead" ||
      role === "engagement_lead" ||
      role === "project_manager";
    return { allowed, isAdmin: false, role };
  });
