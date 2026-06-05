import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Shell } from "@/components/asg/shell";

export const Route = createFileRoute("/demo/_app")({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
});
