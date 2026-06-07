import { createFileRoute, redirect } from "@tanstack/react-router";

// R-4: Default mission landing is Journey Map (orientation) — not Flight Deck.
export const Route = createFileRoute("/_authenticated/missions/$missionId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/journey-map",
      params: { missionId: params.missionId },
      replace: true,
    });
  },
});
