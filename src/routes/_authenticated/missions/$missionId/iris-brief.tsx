import { createFileRoute } from "@tanstack/react-router";
import { MissionBriefView } from "@/components/intelligence/MissionBriefView";

export const Route = createFileRoute("/_authenticated/missions/$missionId/iris-brief")({
  component: IrisBriefPage,
});

function IrisBriefPage() {
  const { missionId } = Route.useParams();
  return <MissionBriefView missionId={missionId} />;
}
