import { createFileRoute } from "@tanstack/react-router";
import { useSelectedOlympusMission } from "../olympus";
import { SectionStub } from "@/components/v2/OlympusSectionStub";

export const Route = createFileRoute("/_authenticated/olympus/gates")({
  component: GatesPage,
});

function GatesPage() {
  const missionId = useSelectedOlympusMission();
  return (
    <SectionStub
      eyebrow="Gates"
      title="Review Gates"
      description="Create custom review gates (Pink Team, Red Team, Gold Team, anything). Target date, reviewers, completion tracking. No hardcoded gate names — every gate is mission-specific."
      missionId={missionId}
      phase="Phase 5"
    />
  );
}
