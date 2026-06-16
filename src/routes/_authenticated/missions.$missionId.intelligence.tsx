import { createFileRoute } from "@tanstack/react-router";
import { OracleTab } from "@/components/mission-command/oracle/OracleTab";

// /intelligence is a nav alias for the Oracle intelligence surface.
// Renders the same component as /oracle so the URL resolves cleanly
// inside the mission layout (which provides the header/nav).
export const Route = createFileRoute("/_authenticated/missions/$missionId/intelligence")({
  component: IntelligenceRoute,
});

function IntelligenceRoute() {
  const { missionId } = Route.useParams();
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <OracleTab missionId={missionId} />
    </div>
  );
}
