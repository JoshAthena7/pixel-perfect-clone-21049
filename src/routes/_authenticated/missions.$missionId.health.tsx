import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { QuestionHealthTab } from "@/components/mission-command/QuestionHealthTab";

export const Route = createFileRoute("/_authenticated/missions/$missionId/health")({
  component: HealthRoute,
});

function HealthRoute() {
  const { missionId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <QuestionHealthTab
        missionId={missionId}
        onNavigateTab={(t) => {
          // Map mission tabs to their existing routes
          const map: Record<string, string> = {
            work: "qa",
            overview: "briefing",
            oracle: "oracle",
            team: "team",
            settings: "settings",
          };
          const path = map[t] ?? "briefing";
          void navigate({ to: `/missions/$missionId/${path}` as any, params: { missionId } });
        }}
      />
    </div>
  );
}
