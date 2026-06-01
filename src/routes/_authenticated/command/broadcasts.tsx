import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/command/broadcasts")({
  component: () => <div className="px-8 py-12 text-sm text-muted-foreground">Broadcasts — coming in next phase.</div>,
});
