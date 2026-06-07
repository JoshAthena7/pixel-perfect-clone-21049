import { createFileRoute } from "@tanstack/react-router";
import { SectionBriefManager } from "@/components/intelligence/SectionBriefManager";

export const Route = createFileRoute("/_authenticated/missions/$missionId/section-briefs")({
  component: SectionBriefsPage,
});

function SectionBriefsPage() {
  const { missionId } = Route.useParams();
  return <SectionBriefManager missionId={missionId} />;
}
