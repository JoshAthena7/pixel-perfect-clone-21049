import { createFileRoute } from "@tanstack/react-router";
import { MissionSettingsTab } from "@/components/mission-command/MissionSettingsTab";
import { MissionRoleGuard } from "@/components/mission-command/MissionRoleGuard";

export const Route = createFileRoute("/_authenticated/missions/$missionId/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const { missionId } = Route.useParams();
  return (
    <MissionRoleGuard missionId={missionId} gate="admin">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <MissionSettingsTab missionId={missionId} />
      </div>
    </MissionRoleGuard>
  );
}
