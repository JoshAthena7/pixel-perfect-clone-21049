// H-5: Firm Health rendered under the Admin layout so the Olympus sidebar
// remains visible. Re-uses the same page component as /command/health.
import { createFileRoute } from "@tanstack/react-router";
import { HealthDashboardPage } from "@/routes/_authenticated/command/health";

export const Route = createFileRoute("/_authenticated/admin/firm-health")({
  component: HealthDashboardPage,
});
