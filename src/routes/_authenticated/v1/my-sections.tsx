import { createFileRoute, redirect } from "@tanstack/react-router";
import { NJ_CSOC_MISSION_ID } from "@/lib/v1/mission";

// Retired: "My Sections" is now pinned at the top of the Cockpit.
// Redirect to the user's mission Cockpit.
export const Route = createFileRoute("/_authenticated/v1/my-sections")({
  loader: () => {
    throw redirect({
      to: "/missions/$missionId",
      params: { missionId: NJ_CSOC_MISSION_ID },
    });
  },
});
