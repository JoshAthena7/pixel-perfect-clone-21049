import { createFileRoute } from "@tanstack/react-router";
import { MissionsListPage } from "@/routes/_authenticated/olympus.missions.index";

export const Route = createFileRoute("/_authenticated/missions/")({
  component: MissionsListPage,
});
