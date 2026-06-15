/** @deprecated Retired from wizard in Phase 2. File kept for history; not imported anywhere. */
import { WizardStepHeading, WizardFooter } from "./WizardShellV3";
import { StepFieldList } from "./StepFieldList";

const ROLES = [
  "executive_sponsor",
  "market_lead",
  "product_clinical_lead",
  "operations_lead",
  "network_lead",
  "bd_lead",
] as const;

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  executive_sponsor: "Executive Sponsor",
  market_lead: "Market Lead",
  product_clinical_lead: "Product / Clinical Lead",
  operations_lead: "Operations Lead",
  network_lead: "Network Lead",
  bd_lead: "BD Lead",
};

const FIELDS = ROLES.flatMap((role) => [
  { key: `exec_${role}_perspective`, label: `${ROLE_LABELS[role]} — Perspective`, multiline: true },
  { key: `exec_${role}_priorities`, label: `${ROLE_LABELS[role]} — Top priorities`, multiline: true },
]);

export function Step6Executive({
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
        title="Capture leadership perspective."
        subtitle="Optional — IRIS will infer what it can from past proposals and program DNA. Fill in the rest."
      />
      <StepFieldList missionId={missionId} wizardStep={6} fields={FIELDS} autoRun />
      <WizardFooter step={6} onBack={onBack} onContinue={onAdvance} continueLabel="Continue (optional step)" />
    </div>
  );
}
