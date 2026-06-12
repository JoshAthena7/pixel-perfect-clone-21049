import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { WizardShell, WizardStepHeading } from "@/components/mission-wizard/WizardShell";
import { Step1BUpload } from "@/components/mission-wizard/Step1BUpload";
import { Step3WinStrategy } from "@/components/mission-wizard/Step3WinStrategy";
import { Step4Journey } from "@/components/mission-wizard/Step4Journey";
import { Step5Team, type SubView } from "@/components/mission-wizard/Step5Team";
import { Step6BlastOff } from "@/components/mission-wizard/Step6BlastOff";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * v2 5-step wizard:
 *   1 → Upload RFP        (Step1BUpload + IRIS background processing)
 *   2 → Set the Strategy  (Step3WinStrategy)
 *   3 → Build the Team    (Step5Team)
 *   4 → Set the Timeline  (Step4Journey)
 *   5 → BLAST OFF         (Step6BlastOff)
 *
 * The Cascade Review, Territory, Intelligence Uploads, Monitoring Feeds, and
 * Competitive Profile (v1 steps 4, 8–11) are no longer wizard gates. They are
 * accessible after launch through the Oracle "Enhance Intelligence" panel.
 */

const searchSchema = z.object({
  step: z.coerce.number().int().min(1).max(5).optional(),
  view: z.enum(["team", "questions", "invites"]).optional(),
});

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/wizard")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: ResumeWizardPage,
});

async function fetchMissionForWizard(missionId: string) {
  const [mission, docs, strategy, team, journey] = await Promise.all([
    supabase.from("missions").select("*").eq("id", missionId).single(),
    supabase.from("mission_documents").select("id").eq("mission_id", missionId).limit(1),
    supabase.from("mission_win_strategy").select("north_star_message,central_claim").eq("mission_id", missionId).maybeSingle(),
    supabase.from("mission_team_members").select("member_id,mission_role").eq("mission_id", missionId),
    supabase.from("mission_journey_phases").select("id").eq("mission_id", missionId).limit(1),
  ]);
  if (mission.error) throw mission.error;
  const teamRows = (team.data ?? []) as Array<{ mission_role: string | null }>;
  return {
    mission: mission.data,
    hasDocs: (docs.data?.length ?? 0) > 0,
    hasStrategy: !!(strategy.data?.north_star_message ?? "").trim(),
    hasEngagementLead: teamRows.some((r) => /engagement|lead/i.test(r.mission_role ?? "")),
    hasTeam: teamRows.length > 0,
    hasJourney: (journey.data?.length ?? 0) > 0,
    hasDeadline: !!mission.data?.submission_deadline,
  };
}

function inferStep(d: Awaited<ReturnType<typeof fetchMissionForWizard>>): number {
  if (!d.hasDocs) return 1;
  if (!d.hasStrategy) return 2;
  if (!d.hasEngagementLead) return 3;
  if (!d.hasDeadline || !d.hasJourney) return 4;
  return 5;
}

function ResumeWizardPage() {
  const { missionId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mission-wizard", missionId],
    queryFn: () => fetchMissionForWizard(missionId),
  });

  const step = search.step ?? (data ? inferStep(data) : 1);

  // Trigger IRIS background extraction the moment a primary RFP exists and
  // no sections have been extracted yet. Fire-and-forget — the user advances
  // without waiting.
  useEffect(() => {
    if (!data?.hasDocs) return;
    let cancelled = false;
    (async () => {
      const { data: sections } = await supabase
        .from("mission_sections")
        .select("id")
        .eq("mission_id", missionId)
        .limit(1);
      if (cancelled) return;
      if ((sections?.length ?? 0) > 0) return;
      // best-effort kick — ignore failure; user can re-trigger from Work tab
      void supabase.functions.invoke("extract-rfp-sections", { body: { missionId } }).catch(() => undefined);
    })();
    return () => { cancelled = true; };
  }, [data?.hasDocs, missionId]);

  // Poll for IRIS processing completion so the header chip clears.
  const { data: irisReading } = useQuery({
    queryKey: ["wizard-iris-reading", missionId],
    enabled: !!data?.hasDocs,
    refetchInterval: 8_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("mission_sections")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      return (count ?? 0) === 0;
    },
  });

  const back = () => {
    if (step <= 1) navigate({ to: "/olympus/missions" });
    else navigate({ to: "/olympus/missions/$missionId/wizard", params: { missionId }, search: { step: step - 1 } });
  };
  const go = (s: number) =>
    navigate({ to: "/olympus/missions/$missionId/wizard", params: { missionId }, search: { step: s } });

  if (isLoading) {
    return (
      <WizardShell step={step} onBack={back}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3 bg-white/10" />
          <Skeleton className="h-6 w-1/2 bg-white/10" />
          <Skeleton className="h-10 w-full bg-white/10" />
        </div>
      </WizardShell>
    );
  }

  if (isError || !data) {
    return (
      <WizardShell step={1} onBack={back}>
        <p className="text-red-400">Failed to load mission.</p>
      </WizardShell>
    );
  }

  const irisStatus = { reading: !!irisReading };

  if (step === 1) {
    return (
      <Step1BUpload
        missionId={missionId}
        onAdvance={() => {
          qc.invalidateQueries({ queryKey: ["mission-wizard", missionId] });
          go(2);
        }}
      />
    );
  }

  if (step === 2) {
    return (
      <WizardShell step={2} onBack={back} irisStatus={irisStatus}>
        <WizardStepHeading
          title="Set the North Star."
          subtitle="One sentence that defines why you win this. IRIS has drafted it from the RFP — edit until it is exactly right."
        />
        <Step3WinStrategy missionId={missionId} />
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => go(3)}
            disabled={!data.hasStrategy}
            className="px-5 py-2.5 rounded-md text-[14px] font-medium disabled:opacity-50"
            style={{ background: "#C49A2B", color: "#0D1B3E" }}
            title={!data.hasStrategy ? "Set the North Star to continue" : undefined}
          >
            {data.hasStrategy ? "Continue →" : "Set the North Star to continue"}
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === 3) {
    const view: SubView = (search.view as SubView) ?? "team";
    return (
      <WizardShell step={3} onBack={back} wide irisStatus={irisStatus}>
        <WizardStepHeading
          title="Build your team."
          subtitle="Add the writers and experts working on this mission. Assign questions after launch — for now just get the right people in."
        />
        <Step5Team
          missionId={missionId}
          view={view}
          setView={(v) =>
            navigate({
              to: "/olympus/missions/$missionId/wizard",
              params: { missionId },
              search: { step: 3, view: v },
            })
          }
          onAdvanceToBlastOff={() => go(4)}
        />
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => go(4)}
            disabled={!data.hasEngagementLead}
            className="px-5 py-2.5 rounded-md text-[14px] font-medium disabled:opacity-50"
            style={{ background: "#C49A2B", color: "#0D1B3E" }}
          >
            {data.hasEngagementLead ? "Continue →" : "Add at least one Engagement Lead to continue"}
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === 4) {
    return (
      <WizardShell step={4} onBack={back} wide irisStatus={irisStatus}>
        <WizardStepHeading
          title="Set the deadline."
          subtitle="One date. IRIS builds the entire mission timeline automatically."
        />
        <Step4Journey missionId={missionId} />
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => go(5)}
            disabled={!data.hasDeadline}
            className="px-5 py-2.5 rounded-md text-[14px] font-medium disabled:opacity-50"
            style={{ background: "#C49A2B", color: "#0D1B3E" }}
          >
            {data.hasDeadline ? "Continue →" : "Select a submission deadline to continue"}
          </button>
        </div>
      </WizardShell>
    );
  }

  if (step === 5) {
    return (
      <WizardShell step={5} onBack={back} wide irisStatus={irisStatus}>
        <WizardStepHeading
          title="Ready to launch."
          subtitle="Review the checklist. When everything looks right — launch the mission."
        />
        <Step6BlastOff missionId={missionId} />
      </WizardShell>
    );
  }

  return (
    <WizardShell step={step} onBack={back}>
      <div className="text-center py-16">
        <h2 className="text-2xl font-semibold mb-2 text-white">Step {step}</h2>
        <p className="text-white/55">Unknown step.</p>
      </div>
    </WizardShell>
  );
}
