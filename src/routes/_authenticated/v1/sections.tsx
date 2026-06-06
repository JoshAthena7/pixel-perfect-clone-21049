import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SectionsTracker } from "@/components/v1/SectionsTracker";

export const Route = createFileRoute("/_authenticated/v1/sections")({
  head: () => ({ meta: [{ title: "Sections — NJ CSOC" }] }),
  component: SectionsRoute,
});

function SectionsRoute() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // If a child route (sections/$sectionId) is active, render only the child
  if (path !== "/v1/sections") return <Outlet />;
  return <SectionsTracker />;
}
