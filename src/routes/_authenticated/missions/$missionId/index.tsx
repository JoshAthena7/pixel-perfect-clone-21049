import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/missions/$missionId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/flight-deck",
      params: { missionId: params.missionId },
      replace: true,
    });
  },
});