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
      .eq("role", "admin")
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

    return { allowed: !!memberRow, isAdmin: false };
  });
