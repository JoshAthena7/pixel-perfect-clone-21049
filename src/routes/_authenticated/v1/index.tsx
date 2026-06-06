import { createFileRoute, redirect } from "@tanstack/react-router";
import { getMissionOverview } from "@/lib/v1/mission.functions";
import { isPmRole } from "@/lib/v1/mission";

export const Route = createFileRoute("/_authenticated/v1/")({
  loader: async () => {
    const data = await getMissionOverview();
    if (isPmRole(data.myRole)) {
      throw redirect({ to: "/v1/command" });
    }
    throw redirect({ to: "/v1/my-sections" });
  },
});
