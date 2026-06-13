import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { WizardShellV3 } from "@/components/mission-wizard-v3/WizardShellV3";
import { Step1Fuel } from "@/components/mission-wizard-v3/Step1Fuel";
import { Step2Basics } from "@/components/mission-wizard-v3/Step2Basics";
import { Step3Strategy } from "@/components/mission-wizard-v3/Step3Strategy";
import { Step4Competitive } from "@/components/mission-wizard-v3/Step4Competitive";
import { Step5Stakeholder } from "@/components/mission-wizard-v3/Step5Stakeholder";
import { Step6Executive } from "@/components/mission-wizard-v3/Step6Executive";
import { Step7Team } from "@/components/mission-wizard-v3/Step7Team";
import { Step8Review } from "@/components/mission-wizard-v3/Step8Review";
import { Skeleton } from "@/components/ui/skeleton";

const searchSchema = z.object({
  step: z.coerce.number().int().min(1).max(8).optional(),
});

export const Route = createFileRoute("/_authenticated/olympus/wizard/$missionId")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: WizardPage,
});

function WizardPage() {
  const { missionId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: mission, isLoading } = useQuery({
    queryKey: ["wizard-mission", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name, status")
        .eq("id", missionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const step = search.step ?? 1;
  const [visited, setVisited] = useState<number[]>([step]);

  useEffect(() => {
    setVisited((cur) => (cur.includes(step) ? cur : [...cur, step]));
  }, [step]);

  const go = (s: number) =>
    navigate({ to: "/olympus/wizard/$missionId", params: { missionId }, search: { step: s } });
  const back = () => (step > 1 ? go(step - 1) : navigate({ to: "/olympus/missions" }));

  const updateName = useMemo(
    () => (n: string) => qc.setQueryData(["wizard-mission", missionId], (cur: typeof mission) => (cur ? { ...cur, name: n } : cur)),
    [missionId, qc, mission],
  );

  if (isLoading || !mission) {
    return (
      <WizardShellV3 missionId={missionId} step={step} visitedSteps={visited} onJump={go}>
        <Skeleton className="h-10 w-2/3 bg-white/10" />
      </WizardShellV3>
    );
  }

  return (
    <WizardShellV3 missionId={missionId} step={step} visitedSteps={visited} onJump={go}>
      {step === 1 && (
        <Step1Fuel
          missionId={missionId}
          missionName={mission.name ?? ""}
          onMissionNameChange={updateName}
          onAdvance={() => go(2)}
          onBack={back}
        />
      )}
      {step === 2 && <Step2Basics missionId={missionId} onBack={back} onAdvance={() => go(3)} />}
      {step === 3 && <Step3Strategy missionId={missionId} onBack={back} onAdvance={() => go(4)} />}
      {step === 4 && <Step4Competitive missionId={missionId} onBack={back} onAdvance={() => go(5)} />}
      {step === 5 && <Step5Stakeholder missionId={missionId} onBack={back} onAdvance={() => go(6)} />}
      {step === 6 && <Step6Executive missionId={missionId} onBack={back} onAdvance={() => go(7)} />}
      {step === 7 && <Step7Team missionId={missionId} onBack={back} onAdvance={() => go(8)} />}
      {step === 8 && <Step8Review missionId={missionId} onBack={back} onJump={go} />}
    </WizardShellV3>
  );
}
