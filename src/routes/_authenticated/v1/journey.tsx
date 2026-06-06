import { createFileRoute } from "@tanstack/react-router";
import { JourneyMapPage } from "@/components/journey-map/JourneyMapPage";

export const Route = createFileRoute("/_authenticated/v1/journey")({
  head: () => ({ meta: [{ title: "Journey Map — NJ CSOC" }] }),
  component: JourneyMapPage,
});
