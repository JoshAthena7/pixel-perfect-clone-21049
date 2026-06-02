import { createFileRoute } from "@tanstack/react-router";
import { useSelectedOlympusMission } from "../olympus";
import { SectionStub } from "@/components/v2/OlympusSectionStub";

export const Route = createFileRoute("/_authenticated/olympus/team")({
  component: TeamPage,
});

function TeamPage() {
  const missionId = useSelectedOlympusMission();
  return (
    <SectionStub
      eyebrow="Team"
      title="Manage Mission Team"
      description="Add writers, invite teammates, assign roles, and remove access. Two-column layout: roster left, invite panel right."
      missionId={missionId}
      phase="Phase 3"
    />
  );
}
