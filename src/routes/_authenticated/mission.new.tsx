import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/mission/new")({
  beforeLoad: () => {
    throw redirect({ to: "/olympus/wizard/new" });
  },
  component: () => null,
});

