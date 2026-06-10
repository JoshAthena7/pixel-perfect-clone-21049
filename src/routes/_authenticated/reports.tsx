import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPlaceholder,
});

function ReportsPlaceholder() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="text-4xl font-bold text-foreground mb-2">Fast Reports</h1>
      <p className="text-muted-foreground">
        Coming next: Mission Portfolio Health, Team Availability, Assignment Acceptance,
        Intelligence Coverage.
      </p>
    </div>
  );
}
