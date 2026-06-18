import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /olympus and its children. Children continue to render through
// the existing _authenticated shell (wizard, missions/$id, etc.).
export const Route = createFileRoute("/_authenticated/olympus")({
  component: () => <Outlet />,
});
