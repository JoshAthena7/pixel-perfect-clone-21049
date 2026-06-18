import { WizardStepHeading, WizardFooter } from "./WizardShellV3";
import { StepFieldList } from "./StepFieldList";

// state_location is captured in the dedicated Step 2 (State) and is intentionally omitted here.
const FIELDS = [
  { key: "client_agency", label: "Client / Agency" },
  { key: "opportunity_title", label: "Opportunity Title" },
  { key: "solicitation_number", label: "Solicitation Number" },
  { key: "program_type", label: "Program Type / Classification" },
  { key: "mission_type", label: "Mission Type", hint: "rfp · rfq · csa · sole_source · recompete" },
  { key: "prime_or_sub", label: "Prime or Sub" },
  { key: "contract_value", label: "Contract Value" },
  { key: "period_of_performance", label: "Period of Performance" },
  { key: "rfp_release_date", label: "RFP Release Date", hint: "YYYY-MM-DD" },
  { key: "proposal_due_date", label: "Proposal Due Date", hint: "YYYY-MM-DD" },
  { key: "page_limit", label: "Page Limit" },
  { key: "submission_method", label: "Submission Method" },
];

export function Step2Basics({
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
        title="Confirm what IRIS found about this opportunity."
        subtitle="IRIS extracted these fields from your RFP. Confirm each, edit, or write your own."
      />
      <StepFieldList missionId={missionId} wizardStep={2} fields={FIELDS} />
      <WizardFooter step={2} onBack={onBack} onContinue={onAdvance} />
    </div>
  );
}
