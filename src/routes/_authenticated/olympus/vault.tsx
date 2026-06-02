import { createFileRoute } from "@tanstack/react-router";
import { useSelectedOlympusMission } from "../olympus";
import { SectionStub } from "@/components/v2/OlympusSectionStub";

export const Route = createFileRoute("/_authenticated/olympus/vault")({
  component: VaultPage,
});

function VaultPage() {
  const missionId = useSelectedOlympusMission();
  return (
    <SectionStub
      eyebrow="Vault"
      title="Document Vault"
      description="Upload and manage every mission document. Categories on the left, document list center, drag-and-drop upload on the right. RFP uploads prompt IRIS to parse into question records."
      missionId={missionId}
      phase="Phase 5"
    />
  );
}
