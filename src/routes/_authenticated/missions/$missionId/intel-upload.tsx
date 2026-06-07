import { createFileRoute } from "@tanstack/react-router";
import { IntelligenceVault } from "@/components/intelligence/IntelligenceVault";

export const Route = createFileRoute("/_authenticated/missions/$missionId/intel-upload")({
  component: IntelUploadPage,
});

function IntelUploadPage() {
  const { missionId } = Route.useParams();
  return <IntelligenceVault missionId={missionId} />;
}
