import { createFileRoute } from "@tanstack/react-router";
import { WinStrategyLiveTab } from "@/components/mission-command/WinStrategyLiveTab";
import { useMissionMeta } from "@/hooks/useMissionMeta";

export const Route = createFileRoute("/_authenticated/missions/$missionId/win-strategy")({
  component: WinStrategyRoute,
});

function WinStrategyRoute() {
  const { missionId } = Route.useParams();
  const { data: meta } = useMissionMeta(missionId);
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <WinStrategyLiveTab missionId={missionId} missionName={meta?.name ?? "Mission"} />
    </div>
  );
}
