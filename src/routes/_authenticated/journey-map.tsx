import { createFileRoute, redirect } from "@tanstack/react-router";

// Gap 4: Top-level /journey-map has been deprecated. Journey Map is
// inherently mission-scoped and now lives only inside a mission at
// /missions/$missionId/journey-map. Redirect to the mission picker so
// older links land somewhere sensible.
export const Route = createFileRoute("/_authenticated/journey-map")({
  beforeLoad: () => {
    throw redirect({ to: "/missions" });
  },
});
