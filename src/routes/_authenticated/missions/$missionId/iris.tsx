import { createFileRoute, Navigate } from "@tanstack/react-router";

// Phase 4: IRIS is no longer a navigation destination.
// The standalone IRIS page redirects to Mission Brief, where the IRIS
// health score and intelligence summary already live (Phase 1).
// IRIS Command power view is available at /missions/$missionId/iris-command.
export const Route = createFileRoute("/_authenticated/missions/$missionId/iris")({
  component: IrisRedirect,
});

function IrisRedirect() {
  const { missionId } = Route.useParams();
  return (
    <Navigate
      to="/missions/$missionId/brief"
      params={{ missionId }}
      replace
    />
  );
}
