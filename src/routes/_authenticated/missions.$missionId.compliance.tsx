import { createFileRoute } from "@tanstack/react-router";
import { ComplianceTab } from "@/components/mission-command/ComplianceTab";
import { MissionRoleGuard } from "@/components/mission-command/MissionRoleGuard";
import { useMissionMeta } from "@/hooks/useMissionMeta";

export const Route = createFileRoute("/_authenticated/missions/$missionId/compliance")({
  component: ComplianceRoute,
});

function ComplianceRoute() {
  const { missionId } = Route.useParams();
  const { data: meta } = useMissionMeta(missionId);
  return (
    <MissionRoleGuard missionId={missionId} gate="admin">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <ComplianceTab
          missionId={missionId}
          missionName={meta?.name ?? "Mission"}
          deadline={meta?.submission_deadline ?? null}
        />
      </div>
    </MissionRoleGuard>
  );
}
