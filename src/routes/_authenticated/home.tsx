import { createFileRoute } from "@tanstack/react-router";

// /home is the neutral landing path; the authenticated shell resolves the
// user-specific destination without forcing writers into the mission list.
export const Route = createFileRoute("/_authenticated/home")({
  component: () => null,
});
