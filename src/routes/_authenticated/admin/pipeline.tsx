import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const Route = createFileRoute("/_authenticated/admin/pipeline")({
  head: () => ({ meta: [{ title: "Pipeline — Admin" }] }),
  component: () => (
    <AdminPlaceholder
      icon={TrendingUp}
      title="Pipeline"
      description="Procurement opportunity tracker across the portfolio."
      comingSoon="Visualize deal stages, TCV-weighted forecasts, and capture-decision health for every opportunity in flight."
    />
  ),
});
