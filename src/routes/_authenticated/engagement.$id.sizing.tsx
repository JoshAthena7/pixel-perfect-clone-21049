import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { SizingEngine } from "@/components/sizing/SizingEngine";

export const Route = createFileRoute("/_authenticated/engagement/$id/sizing")({
  head: () => ({ meta: [{ title: "Size the Opportunity — Athena" }] }),
  component: SizingPage,
});

function SizingPage() {
  const { id } = useParams({ from: "/_authenticated/engagement/$id/sizing" });
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/command" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-3 w-3" /> Back to Command
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Size the Opportunity</h1>
          <p className="text-sm text-muted-foreground">
            Page limits, evaluation weights, writer staffing, and full engagement services.
          </p>
        </div>
      </div>
      <SizingEngine engagementId={id} />
    </div>
  );
}
