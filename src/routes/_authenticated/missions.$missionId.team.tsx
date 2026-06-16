import { createFileRoute } from "@tanstack/react-router";
import { TeamAssignmentsTab } from "@/components/mission-command/TeamAssignmentsTab";
import { MissionRoleGuard } from "@/components/mission-command/MissionRoleGuard";
import { useMissionMeta } from "@/hooks/useMissionMeta";

export const Route = createFileRoute("/_authenticated/missions/$missionId/team")({
  component: TeamRoute,
});

function TeamRoute() {
  const { missionId } = Route.useParams();
  const { data: meta } = useMissionMeta(missionId);
  return (
    <MissionRoleGuard missionId={missionId} gate="manager">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <TeamAssignmentsTab missionId={missionId} missionName={meta?.name ?? "Mission"} />
      </div>
    </MissionRoleGuard>
  );
}
