import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/missions/')({
  component: MissionsPage,
});

function MissionsPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Missions</h1>
        <p className="text-muted-foreground">Mission list — being rebuilt in Sprint 8.</p>
      </div>
    </div>
  );
}
