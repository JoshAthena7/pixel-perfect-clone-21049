import { createFileRoute } from "@tanstack/react-router";
import { JourneyMapPage } from "@/components/journey-map/JourneyMapPage";

// Journey Map lives inside a mission (Phase 1 Mission Nav). The top-level
// /journey-map route is deprecated and now redirects to /missions.
export const Route = createFileRoute("/_authenticated/missions/$missionId/journey-map")({
  component: JourneyMapPage,
});

