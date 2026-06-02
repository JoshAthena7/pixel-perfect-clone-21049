import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/missions/$missionId")({
  component: MissionLayout,
});

function MissionLayout() {
  const { missionId } = Route.useParams();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Hide persistent IRIS strip on Studio / question workspace / settings.
  const hideStrip =
    path.includes("/questions") ||
    path.endsWith("/studio") ||
    path.endsWith("/settings");

  return (
    <div className="flex flex-col min-h-full">
      {!hideStrip && <IrisBriefStrip missionId={missionId} />}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

function IrisBriefStrip({ missionId }: { missionId: string }) {
  const [open, setOpen] = useState(true);

  const { data: mission } = useQuery({
    queryKey: ["mlayout-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,submission_date,rfp_parsed")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["mlayout-counts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,health,current_score")
        .eq("mission_id", missionId);
      const qs = data ?? [];
      const g = qs.filter((q: any) => q.health === "green").length;
      const y = qs.filter((q: any) => q.health === "yellow").length;
      const r = qs.filter((q: any) => q.health === "red").length;
      return { total: qs.length, g, y, r };
    },
  });

  const brief = useMemo(() => {
    if (!mission) return "";
    if (!mission.rfp_parsed && (counts?.total ?? 0) === 0) {
      return "IRIS is ready. Upload the RFP to activate mission intelligence.";
    }
    const parts: string[] = [];
    const days = mission.submission_date
      ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
      : null;
    if (days !== null) {
      if (days < 0) parts.push(`Submission is ${Math.abs(days)} days overdue.`);
      else if (days <= 7) parts.push(`Submission in ${days} days — critical window.`);
      else if (days <= 21) parts.push(`${days} days to submission.`);
      else parts.push(`${days} days to submission; comfortable runway.`);
    }
    if (counts && counts.total > 0) {
      parts.push(
        `${counts.total} questions in flight: ${counts.g} green, ${counts.y} yellow, ${counts.r} red.`,
      );
      if (counts.r > 0) {
        parts.push(`${counts.r} red question${counts.r > 1 ? "s need" : " needs"} immediate attention.`);
      }
    }
    if (parts.length === 0) parts.push("Mission underway. IRIS is monitoring.");
    return parts.join(" ");
  }, [mission, counts]);

  const firstSentence = brief.split(/(?<=[.!?])\s/)[0] ?? brief;

  return (
    <div className="border-b border-border bg-surface/40">
      <div className="mx-auto max-w-[1400px] px-8 py-3">
        <div className="iris-panel rounded-[10px] border border-[color:var(--iris,#22d3ee)]/30 border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04] px-4 py-2.5">
          <div className="flex items-start gap-3">
            <span className="iris-label inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)] shrink-0 mt-0.5">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#22d3ee)]/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--iris,#22d3ee)]" />
              </span>
              IRIS
            </span>
            <p className="flex-1 text-sm text-foreground/90 leading-relaxed">
              {open ? brief : firstSentence}
            </p>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Collapse IRIS brief" : "Expand IRIS brief"}
              className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
