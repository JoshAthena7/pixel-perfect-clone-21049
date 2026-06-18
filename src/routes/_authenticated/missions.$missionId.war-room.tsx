import { createFileRoute } from "@tanstack/react-router";
import { WarRoomPage } from "@/components/war-room/WarRoomPage";

export const Route = createFileRoute("/_authenticated/missions/$missionId/war-room")({
  component: WarRoomRoute,
});

function WarRoomRoute() {
  const { missionId } = Route.useParams();
  return <WarRoomPage missionId={missionId} />;
}
