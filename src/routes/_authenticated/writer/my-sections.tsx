import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/writer/my-sections")({
  head: () => ({ meta: [{ title: "Assignments — Athena Command" }] }),
  component: () => <Navigate to="/command" search={{ tab: "assignments" }} replace />,
});
