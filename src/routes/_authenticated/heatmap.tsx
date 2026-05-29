import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/heatmap")({
  component: () => (
    <div className="mx-auto max-w-7xl p-8">
      <h1 className="text-2xl font-bold capitalize">heatmap</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming next phase.</p>
    </div>
  ),
});
