// H-5: Firm Health rendered under the Admin layout so the Olympus sidebar
// remains visible. The original /command/health route still exists for any
// deep links but the canonical admin entry now lives here.
import { createFileRoute } from "@tanstack/react-router";
import { FirmHealthView } from "@/components/admin/FirmHealthView";

export const Route = createFileRoute("/_authenticated/admin/firm-health")({
  component: FirmHealthView,
});
