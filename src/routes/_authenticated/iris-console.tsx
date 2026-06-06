import { createFileRoute, redirect } from "@tanstack/react-router";

// Phase 4: IRIS is a layer, not a destination. The global IRIS Console has
// been retired — IRIS now surfaces inline (Mission Brief, section panels,
// Atrium Attention) and the power view lives at
// /missions/$missionId/iris-command. Redirect any lingering links to Atrium.
export const Route = createFileRoute("/_authenticated/iris-console")({
  beforeLoad: () => {
    throw redirect({ to: "/atrium" });
  },
});
