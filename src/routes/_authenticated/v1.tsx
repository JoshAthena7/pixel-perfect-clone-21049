import { createFileRoute, Outlet } from "@tanstack/react-router";
import { V1Shell } from "@/components/v1/V1Shell";

export const Route = createFileRoute("/_authenticated/v1")({
  component: () => (
    <V1Shell>
      <Outlet />
    </V1Shell>
  ),
});
