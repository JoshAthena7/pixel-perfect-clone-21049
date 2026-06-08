import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/status-report")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
