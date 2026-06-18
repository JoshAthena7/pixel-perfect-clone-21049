import { createFileRoute } from "@tanstack/react-router";
import { StateIntelDetail } from "@/components/state-intel/StateIntelDetail";

export const Route = createFileRoute("/_authenticated/admin/state-intel/$stateCode")({
  component: StateIntelRoute,
});

function StateIntelRoute() {
  const { stateCode } = Route.useParams();
  return <StateIntelDetail stateCode={stateCode.toUpperCase()} />;
}
