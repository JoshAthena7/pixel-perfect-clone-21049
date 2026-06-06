import { createFileRoute } from "@tanstack/react-router";
import { JourneyMapPage } from "@/routes/_authenticated/journey-map";

// PR 2b: Journey Map promoted into the mission interior.
// Renders the existing Journey Map content in the per-mission context so the
// 5-item Mission Nav can link to it directly. The top-level /journey-map
// route remains for Atrium-level access.
export const Route = createFileRoute("/_authenticated/missions/$missionId/journey-map")({
  component: JourneyMapPage,
});
