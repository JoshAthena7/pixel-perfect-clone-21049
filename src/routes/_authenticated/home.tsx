import { createFileRoute } from "@tanstack/react-router";
import { MissionsListPage } from "@/components/missions/MissionsListPage";

export const Route = createFileRoute("/_authenticated/home")({
  component: MissionsListPage,
});
