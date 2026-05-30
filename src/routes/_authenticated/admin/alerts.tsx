import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";

export const Route = createFileRoute("/_authenticated/admin/alerts")({
  head: () => ({ meta: [{ title: "Alerts — Admin" }] }),
  component: () => (
    <AdminPlaceholder
      icon={AlertTriangle}
      title="Alerts"
      description="SOS, risks, and stuck flags across every Mission."
      comingSoon="One queue for every Open SOS, risk escalation, and stuck section flag — with assign, snooze, and resolve actions."
    />
  ),
});
