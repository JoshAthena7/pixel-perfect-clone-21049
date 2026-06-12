import { Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBriefingHeader } from "@/lib/briefing-room.functions";
import { BriefingHeader } from "@/components/briefing-room/BriefingHeader";
import { SectionSkeleton } from "@/components/briefing-room/SectionCard";
import { SectionSnapshot } from "@/components/briefing-room/SectionSnapshot";
import { SectionWhyMatters } from "@/components/briefing-room/SectionWhyMatters";
import { SectionNorthStar } from "@/components/briefing-room/SectionNorthStar";
import { SectionIntelligence } from "@/components/briefing-room/SectionIntelligence";
import { SectionClientStory } from "@/components/briefing-room/SectionClientStory";
import { SectionMissionMap } from "@/components/briefing-room/SectionMissionMap";
import { SectionRisks } from "@/components/briefing-room/SectionRisks";
import { SectionDocuments } from "@/components/briefing-room/SectionDocuments";
import { SectionSignals } from "@/components/briefing-room/SectionSignals";
import { SectionTimeline } from "@/components/briefing-room/SectionTimeline";

export const Route = createFileRoute("/_authenticated/missions/$missionId/briefing")({
  component: BriefingPage,
});

function BriefingPage() {
  const { missionId } = Route.useParams();
  const { isAdmin } = Route.useRouteContext() as { isAdmin?: boolean };
  const headerFn = useServerFn(getBriefingHeader);
  const { data: header } = useSuspenseQuery({
    queryKey: ["briefing", "header", missionId],
    queryFn: () => headerFn({ data: { missionId } }),
    staleTime: 60_000,
  });

  const props = { missionId, isAdmin: !!isAdmin };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
      <BriefingHeader
        missionName={header.mission?.name ?? "Mission"}
        clientName={header.mission?.client_name ?? null}
        health={header.health}
      />

      <div className="space-y-4">
        <Suspense fallback={<SectionSkeleton height={220} />}><SectionSnapshot {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={200} />}><SectionTimeline {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={180} />}><SectionWhyMatters {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={260} />}><SectionNorthStar {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={300} />}><SectionIntelligence {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={220} />}><SectionClientStory {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={300} />}><SectionMissionMap {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={160} />}><SectionRisks {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={160} />}><SectionDocuments {...props} /></Suspense>
        <Suspense fallback={<SectionSkeleton height={180} />}><SectionSignals {...props} /></Suspense>
      </div>
    </div>
  );
}
