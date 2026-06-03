import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/missions/$missionId/activity")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/missions/$missionId/overview", params: { missionId: params.missionId } });
  },
});
