import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/missions/$missionId/studio")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/questions",
      params: { missionId: params.missionId },
    });
  },
});
