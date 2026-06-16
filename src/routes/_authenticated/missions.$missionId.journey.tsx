import { createFileRoute } from "@tanstack/react-router";
import { JourneyLiveTab } from "@/components/mission-command/JourneyLiveTab";
import { MissionRoleGuard } from "@/components/mission-command/MissionRoleGuard";
import { useMissionMeta } from "@/hooks/useMissionMeta";

export const Route = createFileRoute("/_authenticated/missions/$missionId/journey")({
  component: JourneyRoute,
});

function JourneyRoute() {
  const { missionId } = Route.useParams();
  const { data: meta } = useMissionMeta(missionId);
  return (
    <MissionRoleGuard missionId={missionId} gate="manager">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <JourneyLiveTab missionId={missionId} deadline={meta?.submission_deadline ?? null} />
      </div>
    </MissionRoleGuard>
  );
}
