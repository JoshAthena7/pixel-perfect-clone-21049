import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminIndex,
});

function AdminIndex() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage Athena's connected intelligence platform.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          to="/admin/team"
          className="rounded-lg border p-4 hover:border-primary transition-colors block"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> Athena Team Roster →
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Import the team from a TalentDesk CSV, or add members manually. Populates the Mission Wizard team pickers.
          </p>
        </Link>
      </div>
    </div>
  );
}
