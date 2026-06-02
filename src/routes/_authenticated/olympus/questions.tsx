import { createFileRoute } from "@tanstack/react-router";
import { useSelectedOlympusMission } from "../olympus";
import { SectionStub } from "@/components/v2/OlympusSectionStub";

export const Route = createFileRoute("/_authenticated/olympus/questions")({
  component: QuestionsPage,
});

function QuestionsPage() {
  const missionId = useSelectedOlympusMission();
  return (
    <SectionStub
      eyebrow="Questions"
      title="Question Management"
      description="Master inline-editable table over every question in the mission. Assign writer/SME, set pens-down dates, page limits, status, weights. Import from RFP, bulk-assign, full detail drawer."
      missionId={missionId}
      phase="Phase 4"
    />
  );
}
