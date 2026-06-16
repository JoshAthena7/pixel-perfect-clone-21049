import { createFileRoute, redirect } from "@tanstack/react-router";

// /intelligence is a nav alias for the Oracle intelligence surface.
// Sidebar "INTELLIGENCE" already routes to /oracle; this redirect makes
// the bare /intelligence URL resolve instead of 404'ing as "Mission not found."
export const Route = createFileRoute("/_authenticated/missions/$missionId/intelligence")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$missionId/oracle" as never,
      params: { missionId: params.missionId } as never,
    });
  },
});
