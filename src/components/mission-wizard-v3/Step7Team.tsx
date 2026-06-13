/**
 * Step 7 — Team & Question Assignments. Olympus is the single source of truth
 * for question assignments (lead writer + SMEs). Delegates to the existing
 * TeamAssignmentsTab which already handles this surface.
 */
import { TeamAssignmentsTab } from "@/components/mission-command/TeamAssignmentsTab";
import { useMissionMeta } from "@/hooks/useMissionMeta";
import { WizardStepHeading, WizardFooter } from "./WizardShellV3";

export function Step7Team({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const { data: meta } = useMissionMeta(missionId);
  return (
    <div>
      <WizardStepHeading
        title="Who is working on this mission?"
        subtitle="Add team members and assign a lead writer to every extracted question. This is the only place question assignments are managed."
      />
      <TeamAssignmentsTab missionId={missionId} missionName={meta?.name ?? "Mission"} />
      <WizardFooter step={7} onBack={onBack} onContinue={onAdvance} />
    </div>
  );
}
