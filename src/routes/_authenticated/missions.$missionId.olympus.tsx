import { createFileRoute } from "@tanstack/react-router";
import { OlympusCommand } from "@/components/olympus/OlympusCommand";

export const Route = createFileRoute("/_authenticated/missions/$missionId/olympus")({
  component: MissionOlympus,
});

function MissionOlympus() {
  const { missionId } = Route.useParams();
  return <OlympusCommand initialMissionId={missionId} />;
}
