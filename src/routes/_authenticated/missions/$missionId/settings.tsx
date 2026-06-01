import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/missions/$missionId/settings")({
  component: () => <div className="px-8 py-12 text-sm text-muted-foreground">Mission Settings — coming in next phase.</div>,
});
