import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WriterMissionCard = {
  id: string;
  name: string;
  agency: string | null;
  status: string;
};

const WRITER_VISIBLE_STATUSES = ["active"];

export const getWriterMissionLanding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Canonical admin check: has_role(auth.uid(), 'admin') via user_roles.
    // profiles.is_platform_admin is deprecated; see ATLAS-ARCHITECTURE.md (Known Tech Debt).
    const [{ data: adminRole }, { data: atlasMemberId }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      supabase.rpc("current_atlas_member_id"),
    ]);
    const isAdmin = !!adminRole;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const assignedMissionIds = new Set<string>();

    const memberIds = Array.from(new Set([atlasMemberId, userId].filter(Boolean) as string[]));
    if (memberIds.length > 0) {
      const { data: teamRows } = await admin
        .from("mission_team_members")
        .select("mission_id")
        .in("member_id", memberIds);
      for (const row of teamRows ?? []) if (row.mission_id) assignedMissionIds.add(row.mission_id);
    }

    const { data: legacyRows } = await admin
      .from("mission_members")
      .select("mission_id")
      .eq("user_id", userId);
    for (const row of legacyRows ?? []) if (row.mission_id) assignedMissionIds.add(row.mission_id);

    const toCards = (rows: any[] | null): WriterMissionCard[] =>
      (rows ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        agency: m.agency_name ?? m.client_name ?? null,
        status: m.status ?? "active",
      }));

    const assignedIds = Array.from(assignedMissionIds);
    if (assignedIds.length > 0) {
      const { data: assigned } = await admin
        .from("missions")
        .select("id,name,agency_name,client_name,status,updated_at")
        .in("id", assignedIds)
        .in("status", WRITER_VISIBLE_STATUSES)
        .order("updated_at", { ascending: false });
      const missions = toCards(assigned);
      if (missions.length > 0) {
        return { isAdmin, assignedCount: missions.length, usedFallback: false, missions };
      }
    }

    const { data: fallback } = await admin
      .from("missions")
      .select("id,name,agency_name,client_name,status,updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    return {
      isAdmin,
      assignedCount: 0,
      usedFallback: true,
      missions: toCards(fallback),
    };
  });