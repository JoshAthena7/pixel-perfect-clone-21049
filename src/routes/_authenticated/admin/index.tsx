import { createFileRoute } from "@tanstack/react-router";

import MissionCommand from "@/components/olympus/MissionCommand";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: MissionCommand,
});
