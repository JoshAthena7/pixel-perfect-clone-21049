import { createFileRoute, redirect } from "@tanstack/react-router";

// /home is legacy — canonical landing is /olympus/missions.
export const Route = createFileRoute("/_authenticated/home")({
  beforeLoad: () => {
    throw redirect({ to: "/olympus/missions" });
  },
});
