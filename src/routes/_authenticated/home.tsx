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
    return <div className="p-8 text-[14px] text-muted-foreground">Loading…</div>;
  }

  if (data?.isAdmin) {
    // eslint-disable-next-line no-console
    console.warn("[ATLAS-NAV] /home → /admin (isAdmin=true). Stack:", new Error().stack);
    return <Navigate to="/admin" replace />;
  }


  if (data && !data.usedFallback && data.assignedCount === 1 && data.missions[0]) {
    // eslint-disable-next-line no-console
    console.warn("[ATLAS-NAV] /home → /missions/$id/flight-deck (single assignment)");
    return (
      <Navigate
        to="/missions/$missionId/flight-deck"
        params={{ missionId: data.missions[0].id }}
        replace
      />
    );
  }

  // eslint-disable-next-line no-console
  console.warn("[ATLAS-NAV] /home → /missions (fallback list)", data);
  return <Navigate to="/missions" replace />;
}

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRoute,
});
