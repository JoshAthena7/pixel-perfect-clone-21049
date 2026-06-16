import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/layout/Placeholder";
import { MissionRoleGuard } from "@/components/mission-command/MissionRoleGuard";

export const Route = createFileRoute("/_authenticated/missions/$missionId/reports")({
  component: ReportsRoute,
});

function ReportsRoute() {
  const { missionId } = Route.useParams();
  return (
    <MissionRoleGuard missionId={missionId} gate="admin">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <Placeholder title="Reports" />
      </div>
    </MissionRoleGuard>
  );
}
