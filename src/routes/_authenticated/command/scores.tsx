import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/command/scores")({
  component: () => <div className="px-8 py-12 text-sm text-muted-foreground">Score Dashboard — coming in next phase.</div>,
});
