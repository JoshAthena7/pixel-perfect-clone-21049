import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WizardShell, WizardStepHeading } from "@/components/mission-wizard/WizardShell";
import { Step1Basics } from "@/components/mission-wizard/Step1Basics";

export const Route = createFileRoute("/_authenticated/olympus/missions/new")({
  component: NewMissionWizard,
});

function NewMissionWizard() {
  const navigate = useNavigate();
  return (
    <WizardShell step={1} onBack={() => navigate({ to: "/olympus/missions" })}>
      <WizardStepHeading
        title="Name this mission."
        subtitle="Give it a name and the basics. Next, you'll upload the RFP and IRIS will take it from there."
      />
      <Step1Basics />
    </WizardShell>
  );
}
