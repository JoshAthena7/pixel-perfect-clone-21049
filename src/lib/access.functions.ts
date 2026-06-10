import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "project_manager"])
      .limit(1)
      .maybeSingle();
    return { isAdmin: !!data, userId };
  });

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
    if (adminRow) return { allowed: true, isAdmin: true, role: "admin" as string | null };

    const { data: memberRow } = await supabase
      .from("mission_team_members")
      .select("mission_role")
      .eq("member_id", userId)
      .eq("mission_id", data.missionId)
      .maybeSingle();

    return {
      allowed: !!memberRow,
      isAdmin: false,
      role: (memberRow?.mission_role as string | null) ?? null,
    };
  });

export const getDefaultLandingMission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("mission_team_members")
      .select("mission_id")
      .eq("member_id", userId)
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (member?.mission_id) return { missionId: member.mission_id as string };

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
    if (adminRow) return { allowed: true, isAdmin: true, role: "admin" as string | null };

    const { data: memberRow } = await supabase
      .from("mission_team_members")
      .select("mission_role")
      .eq("member_id", userId)
      .eq("mission_id", data.missionId)
      .maybeSingle();
    const role = (memberRow?.mission_role as string | null) ?? null;
    const allowed =
      role === "admin" ||
      role === "lead" ||
      role === "engagement_lead" ||
      role === "project_manager";
    return { allowed, isAdmin: false, role };
  });
