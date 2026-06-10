import { createFileRoute, redirect } from "@tanstack/react-router";

// /olympus/team is an alias for the Athena Team admin page.
export const Route = createFileRoute("/_authenticated/olympus/team")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/team" });
  },
});
