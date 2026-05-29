import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => {
    // _authenticated index → redirect handled by parent /command via /
  },
  component: () => null,
});
