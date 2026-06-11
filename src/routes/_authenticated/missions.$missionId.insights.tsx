import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/layout/Placeholder";

export const Route = createFileRoute("/_authenticated/missions/$missionId/insights")({
  component: () => (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <Placeholder title="Athena Insights" />
    </div>
  ),
});
