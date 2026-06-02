import { createFileRoute } from "@tanstack/react-router";
import { useSelectedOlympusMission } from "../olympus";
import { SectionStub } from "@/components/v2/OlympusSectionStub";

export const Route = createFileRoute("/_authenticated/olympus/win-themes")({
  component: WinThemesPage,
});

function WinThemesPage() {
  const missionId = useSelectedOlympusMission();
  return (
    <SectionStub
      eyebrow="Win Themes"
      title="Mission Win Themes"
      description="Create and manage win themes for this pursuit. Link each theme to the questions it applies to — themes surface as chips in Studio automatically."
      missionId={missionId}
      phase="Phase 5"
    />
  );
}
