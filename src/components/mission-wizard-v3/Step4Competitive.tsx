import { WizardStepHeading, WizardFooter } from "./WizardShellV3";
import { StepFieldList } from "./StepFieldList";

const FIELDS = [
  { key: "known_competitors", label: "Known Competitors", multiline: true, hint: "One per line" },
  { key: "state_priorities", label: "State Priorities", multiline: true },
  { key: "win_themes", label: "Win Themes", multiline: true, hint: "3–5 themes, one per line" },
  { key: "things_to_reinforce", label: "Things to Reinforce", multiline: true },
  { key: "things_to_avoid", label: "Things to Avoid", multiline: true },
];

export function Step4Competitive({
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
        title="IRIS built your initial playbook."
        subtitle="Sharpen these against what you know about the deal. Edit anything."
      />
      <StepFieldList missionId={missionId} wizardStep={4} fields={FIELDS} autoRun />
      <WizardFooter step={4} onBack={onBack} onContinue={onAdvance} />
    </div>
  );
}
