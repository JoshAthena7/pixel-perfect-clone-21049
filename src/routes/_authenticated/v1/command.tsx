import { createFileRoute } from "@tanstack/react-router";
import { MissionCommand } from "@/components/v1/MissionCommand";

export const Route = createFileRoute("/_authenticated/v1/command")({
  head: () => ({ meta: [{ title: "Mission Command — NJ CSOC" }] }),
  component: MissionCommand,
});
