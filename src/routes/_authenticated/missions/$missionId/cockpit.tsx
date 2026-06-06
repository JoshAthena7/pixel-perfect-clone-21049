import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy /missions/$missionId/cockpit → silent redirect to .../flight-deck.
export const Route = createFileRoute("/_authenticated/missions/$missionId/cockpit")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/flight-deck",
      params: { missionId: params.missionId },
      replace: true,
    });
  },
});
