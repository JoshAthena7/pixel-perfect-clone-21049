import { createFileRoute } from "@tanstack/react-router";
import { CommandCenter } from "@/routes/_authenticated/command/attention";

export const Route = createFileRoute("/_authenticated/missions/$missionId/command")({
  component: MissionCommand,
});

function MissionCommand() {
  const { missionId } = Route.useParams();
  return <CommandCenter missionId={missionId} />;
}
