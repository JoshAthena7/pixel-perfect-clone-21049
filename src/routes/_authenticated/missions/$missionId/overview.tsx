import { createFileRoute, redirect } from "@tanstack/react-router";

// PR 2b legacy redirect: /missions/$id/overview → /missions/$id/brief
export const Route = createFileRoute("/_authenticated/missions/$missionId/overview")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/brief",
      params: { missionId: params.missionId },
      replace: true,
    });
  },
});
