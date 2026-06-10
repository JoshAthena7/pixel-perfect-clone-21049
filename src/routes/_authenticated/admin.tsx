import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="min-h-screen bg-background px-8 py-8 text-foreground">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-[11px] font-extrabold uppercase tracking-[0.28em]">Olympus</span>
        </div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">Admin tools are being rebuilt after the legacy cleanup.</p>
        <Link to="/missions" className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <Home className="h-4 w-4" /> Back to missions
        </Link>
      </div>
    </div>
  );
}
