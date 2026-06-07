import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/v1/")({
  loader: () => {
    throw redirect({ to: "/flight-deck" });
  },
});
