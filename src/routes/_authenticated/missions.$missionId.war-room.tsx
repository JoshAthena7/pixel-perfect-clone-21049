import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { WarRoomPage } from "@/components/war-room/WarRoomPage";

const PM_ROLES = new Set(["admin", "lead", "engagement_lead", "project_manager"]);

export const Route = createFileRoute("/_authenticated/missions/$missionId/war-room")({
  beforeLoad: async ({ params }) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    // Admin?
    const { data: adminRow } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (adminRow) return;
    // PM-level mission role?
    const { data: mem } = await supabase
      .from("mission_team_members").select("mission_role")
      .eq("member_id", u.user.id).eq("mission_id", params.missionId).maybeSingle();
    if (!mem || !mem.mission_role || !PM_ROLES.has(mem.mission_role)) {
      throw redirect({
        to: "/missions/$missionId/flight-deck",
        params: { missionId: params.missionId },
      });
    }
  },
  component: WarRoomRoute,
});

function WarRoomRoute() {
  const { missionId } = Route.useParams();
  return <WarRoomPage missionId={missionId} />;
}
