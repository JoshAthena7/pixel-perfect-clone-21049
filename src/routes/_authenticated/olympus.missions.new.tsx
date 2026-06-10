import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WizardShell } from "@/components/mission-wizard/WizardShell";
import { Step1Basics } from "@/components/mission-wizard/Step1Basics";

export const Route = createFileRoute("/_authenticated/olympus/missions/new")({
  component: NewMissionWizard,
});

function NewMissionWizard() {
  const navigate = useNavigate();
  return (
    <WizardShell step={1} onBack={() => navigate({ to: "/olympus/missions" })}>
      <Step1Basics />
    </WizardShell>
  );
}
