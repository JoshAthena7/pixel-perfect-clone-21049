import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy /cockpit → silent redirect to /flight-deck.
export const Route = createFileRoute("/_authenticated/cockpit")({
  beforeLoad: () => {
    throw redirect({ to: "/flight-deck", replace: true });
  },
});
