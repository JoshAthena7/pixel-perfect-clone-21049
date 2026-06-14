import { createFileRoute } from "@tanstack/react-router";
import { useMissionMeta } from "@/hooks/useMissionMeta";
import { FlightDeckV2 } from "@/components/flight-deck/FlightDeckV2";

export const Route = createFileRoute("/_authenticated/missions/$missionId/flight-deck")({
  component: FlightDeckRoute,
});

function FlightDeckRoute() {
  const { missionId } = Route.useParams();
  const { data: meta } = useMissionMeta(missionId);

  return (
    <div
      style={{ background: "#0a0a0f", color: "white", minHeight: "100vh" }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-8 py-8">
        <FlightDeckV2 missionId={missionId} missionName={meta?.name ?? "Mission"} />
      </div>
    </div>
  );
}
