import { createFileRoute } from "@tanstack/react-router";
import { MissionIntel } from "@/components/v1/MissionIntel";

export const Route = createFileRoute("/_authenticated/v1/intel")({
  head: () => ({ meta: [{ title: "Mission Intel — NJ CSOC" }] }),
  component: MissionIntel,
});
