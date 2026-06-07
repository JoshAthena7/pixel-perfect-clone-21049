import { createFileRoute } from "@tanstack/react-router";
import { InterviewManager } from "@/components/intelligence/InterviewManager";

export const Route = createFileRoute("/_authenticated/missions/$missionId/interviews")({
  component: InterviewsPage,
});

function InterviewsPage() {
  const { missionId } = Route.useParams();
  return <InterviewManager missionId={missionId} />;
}
