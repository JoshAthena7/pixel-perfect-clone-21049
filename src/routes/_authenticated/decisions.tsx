import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/decisions")({
  component: () => (
    <div className="mx-auto max-w-7xl p-8">
      <h1 className="text-2xl font-bold capitalize">decisions</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming next phase.</p>
    </div>
  ),
});
