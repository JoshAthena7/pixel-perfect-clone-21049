import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { OverviewTab } from "@/components/mission-command/OverviewTab";
import type { TabId } from "@/components/mission-command/MissionTabs";

export const Route = createFileRoute("/_authenticated/missions/$missionId/briefing")({
  component: BriefingRoute,
});

const TAB_TO_ROUTE: Partial<Record<TabId, string>> = {
  work: "/missions/$missionId/qa",
  oracle: "/missions/$missionId/oracle",
  team: "/missions/$missionId/team",
  settings: "/missions/$missionId/settings",
  overview: "/missions/$missionId/briefing",
};

function BriefingRoute() {
  const { missionId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <OverviewTab
        missionId={missionId}
        onNavigateTab={(t) => {
          const to = TAB_TO_ROUTE[t] ?? "/missions/$missionId/briefing";
          navigate({ to: to as never, params: { missionId } as never });
        }}
      />
    </div>
  );
}
