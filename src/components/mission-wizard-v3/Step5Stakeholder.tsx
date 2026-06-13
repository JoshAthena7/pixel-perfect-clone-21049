import { WizardStepHeading, WizardFooter } from "./WizardShellV3";
import { StepFieldList } from "./StepFieldList";

const FIELDS = [
  { key: "stakeholder_member_family", label: "Member / Family", multiline: true, hint: "Who are we writing for?" },
  { key: "stakeholder_provider", label: "Provider", multiline: true },
  { key: "stakeholder_evaluator", label: "Evaluator", multiline: true },
];

export function Step5Stakeholder({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  return (
    <div>
      <WizardStepHeading
        title="Who is IRIS writing for?"
        subtitle="Optional — enriches every IRIS output. Skip if you don't have specific language yet."
      />
      <StepFieldList missionId={missionId} wizardStep={5} fields={FIELDS} autoRun />
      <WizardFooter step={5} onBack={onBack} onContinue={onAdvance} continueLabel="Continue (optional step)" />
    </div>
  );
}
