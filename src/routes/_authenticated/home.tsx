import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWriterMissionLanding } from "@/lib/writer-missions.functions";

function HomeRoute() {
  const getLanding = useServerFn(getWriterMissionLanding);
  const { data, isLoading } = useQuery({
    queryKey: ["writer-mission-landing"],
    queryFn: () => getLanding(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (data?.isAdmin) return <Navigate to="/admin" replace />;

  if (data && !data.usedFallback && data.assignedCount === 1 && data.missions[0]) {
    return (
      <Navigate
        to="/missions/$missionId/briefing"
        params={{ missionId: data.missions[0].id }}
        replace
      />
    );
  }

  return <Navigate to="/missions" replace />;
}

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRoute,
});
