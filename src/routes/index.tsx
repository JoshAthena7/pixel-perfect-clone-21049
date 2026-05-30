import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // Front door — let _authenticated guard auth, then route through the picker
    throw redirect({ to: "/select-engagement" });
  },
});
