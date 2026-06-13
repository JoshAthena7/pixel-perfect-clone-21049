import { Suspense, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBriefingHeader } from "@/lib/briefing-room.functions";
import { BriefingHeader } from "@/components/briefing-room/BriefingHeader";
import { SectionSkeleton } from "@/components/briefing-room/SectionCard";
import { SectionSnapshot } from "@/components/briefing-room/SectionSnapshot";
import { SectionWhyMatters } from "@/components/briefing-room/SectionWhyMatters";
import { SectionIntelligence } from "@/components/briefing-room/SectionIntelligence";
import { SectionClientStory } from "@/components/briefing-room/SectionClientStory";
import { SectionBriefAtRisk } from "@/components/briefing-room/SectionBriefAtRisk";
import { SectionDocuments } from "@/components/briefing-room/SectionDocuments";
import { SectionSignals } from "@/components/briefing-room/SectionSignals";
import { SectionTimeline } from "@/components/briefing-room/SectionTimeline";
import { StrategyView } from "@/components/mission-command/StrategyView";
import { MissionBriefArtifact } from "@/components/briefing-room/MissionBriefArtifact";
import { CompetitorIntelPanel } from "@/components/mission-wizard-v3/CompetitorIntelPanel";
import { MissionOutcomeCard } from "@/components/mission-command/MissionOutcomeCard";



export const Route = createFileRoute("/_authenticated/missions/$missionId/briefing")({
  component: BriefingPage,
});

const GOLD = "#c9a84c";
type SubTab = "brief" | "strategy";

function BriefingPage() {
  const { missionId } = Route.useParams();
  const { isAdmin } = Route.useRouteContext() as { isAdmin?: boolean };
  const headerFn = useServerFn(getBriefingHeader);
  const { data: header } = useSuspenseQuery({
    queryKey: ["briefing", "header", missionId],
    queryFn: () => headerFn({ data: { missionId } }),
    staleTime: 60_000,
  });

  const [tab, setTab] = useState<SubTab>("brief");
  const props = { missionId, isAdmin: !!isAdmin };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
      <BriefingHeader
        missionName={header.mission?.name ?? "Mission"}
        clientName={header.mission?.client_name ?? null}
        health={header.health}
        missionId={missionId}
        isAdmin={!!isAdmin}
      />
      <MissionOutcomeCard missionId={missionId} />


      <div className="flex items-center gap-2 mb-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {([
          { id: "brief", label: "BRIEF" },
          { id: "strategy", label: "STRATEGY" },
        ] as { id: SubTab; label: string }[]).map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="transition-colors"
              style={{
                padding: "8px 14px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: isActive ? GOLD : "rgba(255,255,255,0.45)",
                borderBottom: `2px solid ${isActive ? GOLD : "transparent"}`,
                background: "transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "brief" ? (
        <div className="space-y-4">
          <MissionBriefArtifact missionId={missionId} />

          <div className="pt-2">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Competitive Intelligence
              </h3>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
            <CompetitorIntelPanel missionId={missionId} readOnly />
          </div>



          <div className="pt-2">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Supporting Materials
              </h3>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
            <div className="space-y-4 opacity-95">
              <Suspense fallback={<SectionSkeleton height={140} />}><SectionSnapshot {...props} /></Suspense>
              <Suspense fallback={<SectionSkeleton height={200} />}><SectionTimeline {...props} /></Suspense>
              <Suspense fallback={<SectionSkeleton height={180} />}><SectionWhyMatters {...props} /></Suspense>
              <Suspense fallback={<SectionSkeleton height={260} />}><SectionIntelligence {...props} /></Suspense>
              <Suspense fallback={<SectionSkeleton height={220} />}><SectionClientStory {...props} /></Suspense>
              <Suspense fallback={<SectionSkeleton height={200} />}><SectionBriefAtRisk {...props} /></Suspense>
              <Suspense fallback={<SectionSkeleton height={120} />}><SectionDocuments {...props} /></Suspense>
              <Suspense fallback={<SectionSkeleton height={160} />}><SectionSignals {...props} /></Suspense>
            </div>
          </div>
        </div>
      ) : (
        <StrategyView missionId={missionId} missionName={header.mission?.name ?? "Mission"} />
      )}
    </div>
  );
}
