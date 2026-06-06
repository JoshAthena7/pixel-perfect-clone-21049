import { createFileRoute, redirect } from "@tanstack/react-router";
import { getMissionOverview } from "@/lib/v1/mission.functions";
import { isPmRole, NJ_CSOC_MISSION_ID } from "@/lib/v1/mission";

export const Route = createFileRoute("/_authenticated/v1/")({
  loader: async () => {
    const data = await getMissionOverview();
    if (isPmRole(data.myRole)) {
      throw redirect({ to: "/v1/command" });
    }
    // Writers/SMEs land on the mission Flight Deck (which pins their sections).
    throw redirect({
      to: "/missions/$missionId",
      params: { missionId: NJ_CSOC_MISSION_ID },
    });
  },
});
