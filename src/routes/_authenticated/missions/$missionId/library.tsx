import { createFileRoute, redirect } from "@tanstack/react-router";

// PR 2b legacy redirect: /missions/$id/library → /missions/$id/intel
export const Route = createFileRoute("/_authenticated/missions/$missionId/library")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/intel",
      params: { missionId: params.missionId },
      replace: true,
    });
  },
});
