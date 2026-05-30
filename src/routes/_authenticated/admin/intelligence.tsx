import { createFileRoute } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const Route = createFileRoute("/_authenticated/admin/intelligence")({
  head: () => ({ meta: [{ title: "Intelligence — Admin" }] }),
  component: () => (
    <AdminPlaceholder
      icon={Brain}
      title="Intelligence"
      description="Oversight for the insights engine and market intel pipeline."
      comingSoon="Triage Radar™, Compass™, and WinIQ insights across all engagements, tune source weights, and action high-signal items."
    />
  ),
});
