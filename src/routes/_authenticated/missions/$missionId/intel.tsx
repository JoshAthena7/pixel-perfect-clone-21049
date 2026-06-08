import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/missions/$missionId/intel")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/missions/$missionId/setup",
      params: { missionId: params.missionId },
      hash: "documents",
    });
  },
});
