import { createFileRoute } from "@tanstack/react-router";
import { useMissionMeta } from "@/hooks/useMissionMeta";
import { WriterCockpit } from "@/components/flight-deck/WriterCockpit";

export const Route = createFileRoute("/_authenticated/missions/$missionId/flight-deck")({
  component: FlightDeckRoute,
});

function FlightDeckRoute() {
  const { missionId } = Route.useParams();
  const { data: meta } = useMissionMeta(missionId);
  return <WriterCockpit missionId={missionId} missionName={meta?.name ?? "Mission"} />;
}
