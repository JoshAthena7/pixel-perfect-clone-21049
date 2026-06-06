import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/v1/sections")({
  component: () => <Outlet />,
});
