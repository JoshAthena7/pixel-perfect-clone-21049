import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/mission/new")({
  beforeLoad: async () => {
    // Create a fresh mission and jump straight into the wizard at step 1.
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("missions")
      .insert({
        name: "Untitled Mission",
        status: "Draft",
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !data) throw redirect({ to: "/olympus/missions" });
    throw redirect({
      to: "/olympus/missions/$missionId/wizard",
      params: { missionId: data.id },
      search: { step: 1 },
    });
  },
  component: () => null,
});
