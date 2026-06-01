import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/missions/$missionId/brief")({
  component: () => <div className="px-8 py-12 text-sm text-muted-foreground">IRIS Mission Brief — coming in next phase.</div>,
});
