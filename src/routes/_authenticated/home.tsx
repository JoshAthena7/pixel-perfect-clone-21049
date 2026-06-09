import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/home')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Athena Command Center</h1>
        <p className="text-muted-foreground mb-8">IRIS Mission Intelligence Platform</p>
        <div className="grid gap-4">
          <Link to="/missions" className="block p-6 border rounded-lg hover:bg-accent">
            <h2 className="text-xl font-semibold">Missions</h2>
            <p className="text-sm text-muted-foreground">View and manage missions</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
