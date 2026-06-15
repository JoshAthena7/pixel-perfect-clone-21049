/**
 * Step 7 — Team & Question Assignments. Olympus is the single source of truth
 * for question assignments (lead writer + SMEs). Delegates to the existing
 * TeamAssignmentsTab which already handles this surface.
 *
 * Also surfaces a banner + "Re-run IRIS" button when no questions have been
 * extracted yet, so users have a recovery path without going back to Step 1.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamAssignmentsTab } from "@/components/mission-command/TeamAssignmentsTab";
import { useMissionMeta } from "@/hooks/useMissionMeta";
import { runIrisRfpExtraction } from "@/lib/run-iris-rfp.browser";
import { WizardStepHeading, WizardFooter } from "./WizardShellV3";

export function Step7Team({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const { data: meta } = useMissionMeta(missionId);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { data: questionCount, refetch } = useQuery({
    queryKey: ["step7-question-count", missionId],
    queryFn: async () => {
      const { count } = await supabase
        .from("mission_questions")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      return count ?? 0;
    },
  });

  async function rerun() {
    setRunning(true);
    setRunError(null);
    try {
      await runIrisRfpExtraction(missionId);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["mt-assignment-questions", missionId] });
      await qc.invalidateQueries({ queryKey: ["mt-assignments", missionId] });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const showBanner = questionCount === 0;

  return (
    <div>
      <WizardStepHeading
        title="Who is working on this mission?"
        subtitle="Add team members and assign a lead writer to every extracted question. This is the only place question assignments are managed."
      />

      {showBanner && (
        <div
          className="mb-4 rounded-xl p-4 flex items-start gap-3"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)" }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1">
            <p className="text-[13.5px] text-white">
              IRIS found no questions in your RFP. Go back to Step 1 and re-run IRIS, or check that
              your RFP file is a readable PDF (not a scanned image).
            </p>
            {runError && (
              <p className="text-[12.5px] text-red-400 mt-2">Re-run failed: {runError}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                disabled={running}
                onClick={rerun}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12.5px] font-medium disabled:opacity-40"
                style={{ background: "#C49A2B", color: "#0D1B3E" }}
              >
                {running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {running ? "Re-running…" : "Re-run IRIS question extraction"}
              </button>
              <button
                onClick={onBack}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-[12.5px] text-white/75 border border-white/15 hover:bg-white/5"
              >
                Back to Step 1
              </button>
            </div>
          </div>
        </div>
      )}

      <TeamAssignmentsTab missionId={missionId} missionName={meta?.name ?? "Mission"} initialSub="assignments" />
      <WizardFooter step={7} onBack={onBack} onContinue={onAdvance} />
    </div>
  );
}
