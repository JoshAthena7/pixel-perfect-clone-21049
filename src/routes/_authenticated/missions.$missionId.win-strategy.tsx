import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/missions/$missionId/win-strategy")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/briefing",
      params: { missionId: params.missionId },
    });
  },
});
