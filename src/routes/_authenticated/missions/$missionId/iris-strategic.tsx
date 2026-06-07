import { createFileRoute } from "@tanstack/react-router";
import { StrategicAssessmentView } from "@/components/intelligence/StrategicAssessmentView";

export const Route = createFileRoute("/_authenticated/missions/$missionId/iris-strategic")({
  component: IrisStrategicPage,
});

function IrisStrategicPage() {
  const { missionId } = Route.useParams();
  return <StrategicAssessmentView missionId={missionId} />;
}
