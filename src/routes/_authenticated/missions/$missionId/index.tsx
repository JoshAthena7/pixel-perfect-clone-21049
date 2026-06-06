import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/missions/$missionId/")({
  beforeLoad: async ({ params }) => {
    const { missionId } = params;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("mission_members")
          .select("role")
          .eq("mission_id", missionId)
          .eq("user_id", user.id);
        const roles = (data ?? []).map((r: { role: string }) => r.role);
        const isLeader = roles.includes("admin") || roles.includes("lead");
        if (isLeader) {
          throw redirect({ to: "/missions/$missionId/command", params: { missionId } });
        }
      }
    } catch (e: any) {
      // If this is a redirect, rethrow; otherwise fall through to default
      if (e?.isRedirect || e?.to) throw e;
    }
    throw redirect({ to: "/missions/$missionId/brief", params: { missionId } });
  },
});
