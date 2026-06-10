import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { WizardShell } from "@/components/mission-wizard/WizardShell";
import { Step1Basics, type Step1Values } from "@/components/mission-wizard/Step1Basics";
import { Skeleton } from "@/components/ui/skeleton";

const searchSchema = z.object({
  step: z.coerce.number().int().min(1).max(6).optional(),
});

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/wizard")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: ResumeWizardPage,
});

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchMissionForWizard(missionId: string) {
  const [mission, docs, sections] = await Promise.all([
    supabase.from("missions").select("*").eq("id", missionId).single(),
    supabase.from("mission_documents").select("id").eq("mission_id", missionId).limit(1),
    supabase.from("mission_sections").select("id").eq("mission_id", missionId).limit(1),
  ]);
  if (mission.error) throw mission.error;
  return {
    mission: mission.data,
    hasDocs: (docs.data?.length ?? 0) > 0,
    hasSections: (sections.data?.length ?? 0) > 0,
  };
}

function ResumeWizardPage() {
  const { missionId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mission-wizard", missionId],
    queryFn: () => fetchMissionForWizard(missionId),
  });

  const inferredStep = data?.hasSections ? 3 : data?.hasDocs ? 2 : 1;
  const step = search.step ?? inferredStep;

  const back = () => {
    if (step <= 1) navigate({ to: "/olympus/missions" });
    else navigate({ to: "/olympus/missions/$missionId/wizard", params: { missionId }, search: { step: step - 1 } });
  };

  if (isLoading) {
    return (
      <WizardShell step={step} onBack={back}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </WizardShell>
    );
  }

  if (isError || !data) {
    return (
      <WizardShell step={1} onBack={back}>
        <p className="text-destructive">Failed to load mission.</p>
      </WizardShell>
    );
  }

  if (step === 1) {
    const initial: Partial<Step1Values> = {
      name: data.mission.name ?? "",
      client_name: data.mission.client_name ?? "",
      procurement_type: data.mission.procurement_type ?? "",
      submission_deadline: toDatetimeLocal(data.mission.submission_deadline),
      primary_contact_name: data.mission.primary_contact_name ?? "",
      primary_contact_email: data.mission.primary_contact_email ?? "",
      contract_value: data.mission.contract_value != null ? String(data.mission.contract_value) : "",
    };
    return (
      <WizardShell step={1} onBack={back}>
        <Step1Basics initial={initial} missionId={missionId} />
      </WizardShell>
    );
  }

  const go = (s: number) =>
    navigate({ to: "/olympus/missions/$missionId/wizard", params: { missionId }, search: { step: s } });

  if (step === 2) {
    return (
      <WizardShell step={2} onBack={back}>
        <Step1BUpload missionId={missionId} onAdvance={() => go(3)} />
      </WizardShell>
    );
  }
  if (step === 3) {
    return (
      <WizardShell step={3} onBack={back}>
        <Step1CProcessing missionId={missionId} onContinue={() => go(4)} />
      </WizardShell>
    );
  }
  if (step === 4) {
    return (
      <WizardShell step={4} onBack={back}>
        <Step1DSummary missionId={missionId} />
      </WizardShell>
    );
  }

  return (
    <WizardShell step={step} onBack={back}>
      <div className="text-center py-16">
        <h2 className="text-2xl font-semibold mb-2">Step {step} — Coming next</h2>
        <p className="text-muted-foreground">
          This step is part of a later sprint. Your mission is saved.
        </p>
      </div>
    </WizardShell>
  );
}
