import { createFileRoute } from "@tanstack/react-router";
import { QaLogTab } from "@/components/mission-command/QaLogTab";
import { MissionRoleGuard } from "@/components/mission-command/MissionRoleGuard";

export const Route = createFileRoute("/_authenticated/missions/$missionId/qa")({
  component: QaRoute,
});

function QaRoute() {
  const { missionId } = Route.useParams();
  return (
    <MissionRoleGuard missionId={missionId} gate="manager">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <QaLogTab missionId={missionId} />
      </div>
    </MissionRoleGuard>
  );
}
