import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { MissionRadar } from "@/components/mission-radar/MissionRadar";

export const Route = createFileRoute("/_authenticated/missions/$missionId/radar")({
  head: () => ({ meta: [{ title: "Mission Radar — ATLAS" }] }),
  component: RadarPage,
  errorComponent: ({ error }) => (
    <div className="p-8" style={{ color: "rgba(255,255,255,0.7)" }}>
      Radar failed to load: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8" style={{ color: "rgba(255,255,255,0.7)" }}>Mission not found.</div>
  ),
});

function RadarPage() {
  const { missionId } = Route.useParams();
  return (
    <Suspense
      fallback={
        <div className="p-8" style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
          Loading radar…
        </div>
      }
    >
      <MissionRadar missionId={missionId} />
    </Suspense>
  );
}
