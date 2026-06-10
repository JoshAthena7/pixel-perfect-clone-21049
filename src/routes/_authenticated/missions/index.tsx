import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy /missions path → canonical /olympus/missions.
export const Route = createFileRoute("/_authenticated/missions/")({
  beforeLoad: () => {
    throw redirect({ to: "/olympus/missions" });
  },
});
