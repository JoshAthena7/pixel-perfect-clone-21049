import { WizardStepHeading, WizardFooter } from "./WizardShellV3";
import { StepFieldList } from "./StepFieldList";

const FIELDS = [
  { key: "north_star", label: "North Star — What does winning look like?", multiline: true, hint: "2–4 sentences" },
  { key: "why_we_win", label: "Why We Win — What gives us the right to win?", multiline: true },
  { key: "why_we_could_lose", label: "Why We Could Lose — Honest vulnerabilities", multiline: true },
  { key: "biggest_concerns", label: "Biggest Concerns — What keeps you up at night?", multiline: true },
];

export function Step3Strategy({
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
        title="IRIS has drafted your strategic position."
        subtitle="Synthesized from the RFP evaluation criteria, state DNA, program DNA, and any past proposals you uploaded."
      />
      <StepFieldList missionId={missionId} wizardStep={3} fields={FIELDS} autoRun />
      <WizardFooter step={3} onBack={onBack} onContinue={onAdvance} />
    </div>
  );
}
