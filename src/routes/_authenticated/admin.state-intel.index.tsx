import { createFileRoute } from "@tanstack/react-router";
import { StateIntelGrid } from "@/components/state-intel/StateIntelGrid";

export const Route = createFileRoute("/_authenticated/admin/state-intel/")({
  component: StateIntelGrid,
});
