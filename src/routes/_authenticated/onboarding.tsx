import { createFileRoute, redirect } from "@tanstack/react-router";

// /onboarding is an alias of /welcome — both resolve to the IRIS onboarding flow.
export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: () => {
    throw redirect({ to: "/welcome" });
  },
});
