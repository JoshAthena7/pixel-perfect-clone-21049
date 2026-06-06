import { createFileRoute, redirect } from "@tanstack/react-router";

// Status Report moved to /admin/status-report (Phase 5: Olympus / Admin).
export const Route = createFileRoute("/_authenticated/status-report")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/status-report" });
  },
});
