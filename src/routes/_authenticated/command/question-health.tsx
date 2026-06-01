import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/command/question-health")({
  component: () => <div className="px-8 py-12 text-sm text-muted-foreground">Question Health — coming in next phase.</div>,
});
