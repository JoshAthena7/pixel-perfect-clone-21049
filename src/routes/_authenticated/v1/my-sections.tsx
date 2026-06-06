import { createFileRoute } from "@tanstack/react-router";
import { MySections } from "@/components/v1/MySections";

export const Route = createFileRoute("/_authenticated/v1/my-sections")({
  head: () => ({ meta: [{ title: "My Sections — NJ CSOC" }] }),
  component: MySections,
});
