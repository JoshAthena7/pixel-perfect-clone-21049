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
import { Step5IntelNetwork } from "@/components/mission-wizard-v3/Step5IntelNetwork";
import { Step7Team } from "@/components/mission-wizard-v3/Step7Team";
import { Step8Review } from "@/components/mission-wizard-v3/Step8Review";
import { Skeleton } from "@/components/ui/skeleton";

type WizardMission = { id: string; name: string; status: string | null; lastStep: number };

const TOTAL = 7;
const searchSchema = z.object({
  step: z.coerce.number().int().min(1).max(TOTAL).optional(),
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
    queryFn: async (): Promise<WizardMission | null> => {
      const [{ data, error }, { data: progressRows }] = await Promise.all([
        supabase
        .from("missions")
        .select("id, name, status")
        .eq("id", missionId)
          .maybeSingle(),
        supabase
          .from("mission_iris_extractions")
          .select("extracted_field, extracted_value, wizard_step")
          .eq("mission_id", missionId)
          .not("wizard_step", "is", null),
      ]);
      if (error) throw error;
      if (!data) return null;
      const savedStep = Number(
        progressRows?.find((r) => r.extracted_field === "__wizard_last_step")?.extracted_value,
      );
      const inferredStep = Math.max(
        1,
        ...(progressRows ?? [])
          .map((r) => r.wizard_step ?? 1)
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= TOTAL),
      );
      return { ...data, lastStep: Number.isFinite(savedStep) ? Math.min(TOTAL, Math.max(1, savedStep)) : inferredStep };
    },
  });

  const step = search.step ?? mission?.lastStep ?? 1;
  const [visited, setVisited] = useState<number[]>([step]);

  useEffect(() => {
    setVisited((cur) => (cur.includes(step) ? cur : [...cur, step]));
  }, [step]);

  async function saveProgress(s: number) {
    const safeStep = Math.min(TOTAL, Math.max(1, s));
    const { data: existing } = await supabase
      .from("mission_iris_extractions")
      .select("id")
      .eq("mission_id", missionId)
      .eq("extracted_field", "__wizard_last_step")
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from("mission_iris_extractions")
        .update({ extracted_value: String(safeStep), user_override_value: String(safeStep), wizard_step: safeStep })
        .eq("id", existing.id);
    } else {
      await supabase.from("mission_iris_extractions").insert({
        mission_id: missionId,
        extracted_field: "__wizard_last_step",
        extracted_value: String(safeStep),
        user_override_value: String(safeStep),
        wizard_step: safeStep,
        confirmed_by_user: true,
        overridden_by_user: true,
        confirmed_at: new Date().toISOString(),
      });
    }
  }

  const go = (s: number) => {
    void saveProgress(s);
    navigate({ to: "/olympus/wizard/$missionId", params: { missionId }, search: { step: s } });
  };
  const back = () => (step > 1 ? go(step - 1) : navigate({ to: "/olympus/missions" }));

  const updateName = useMemo(
    () => (n: string) => qc.setQueryData(["wizard-mission", missionId], (cur: typeof mission) => (cur ? { ...cur, name: n } : cur)),
    [missionId, qc, mission],
  );

  const isLive = !!mission && !["setup", "draft"].includes((mission.status ?? "").toLowerCase());

  if (isLoading || !mission) {
    return (
      <WizardShellV3 missionId={missionId} step={step} visitedSteps={visited} onJump={go} isLive={false}>
        <Skeleton className="h-10 w-2/3 bg-white/10" />
      </WizardShellV3>
    );
  }

  return (
    <WizardShellV3 missionId={missionId} step={step} visitedSteps={visited} onJump={go} isLive={isLive}>
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
      {step === 5 && <Step5IntelNetwork missionId={missionId} onBack={back} onAdvance={() => go(6)} />}
      {step === 6 && <Step7Team missionId={missionId} onBack={back} onAdvance={() => go(7)} />}
      {step === 7 && <Step8Review missionId={missionId} onBack={back} onJump={go} />}
    </WizardShellV3>
  );
}
