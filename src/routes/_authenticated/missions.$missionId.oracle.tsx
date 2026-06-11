import { createFileRoute } from "@tanstack/react-router";
import { OracleTab } from "@/components/mission-command/oracle/OracleTab";

export const Route = createFileRoute("/_authenticated/missions/$missionId/oracle")({
  component: OracleRoute,
});

function OracleRoute() {
  const { missionId } = Route.useParams();
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <OracleTab missionId={missionId} />
    </div>
  );
}
