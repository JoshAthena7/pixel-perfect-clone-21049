import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/olympus")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
