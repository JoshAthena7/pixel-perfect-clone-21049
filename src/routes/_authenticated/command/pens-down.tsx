import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/command/pens-down")({
  component: () => <div className="px-8 py-12 text-sm text-muted-foreground">Pens Down Watch — coming in next phase.</div>,
});
