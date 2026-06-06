import { createFileRoute } from "@tanstack/react-router";
import { SectionsTracker } from "@/components/v1/SectionsTracker";

export const Route = createFileRoute("/_authenticated/v1/sections/")({
  head: () => ({ meta: [{ title: "Sections — NJ CSOC" }] }),
  component: SectionsTracker,
});
