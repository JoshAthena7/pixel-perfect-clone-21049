import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/olympus/wizard/new")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("missions")
      .insert({
        name: "Untitled Mission",
        status: "setup",
        wizard_step: 1,
        created_by: userData.user?.id ?? null,
        submission_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw redirect({ to: "/olympus/missions" });
    throw redirect({
      to: "/olympus/wizard/$missionId",
      params: { missionId: data.id },
      search: { step: 1 },
    });
  },
  component: () => null,
});
