import { createFileRoute } from "@tanstack/react-router";
import { SectionWorkspace } from "@/components/v1/SectionWorkspace";

export const Route = createFileRoute("/_authenticated/v1/sections/$sectionId")({
  head: () => ({ meta: [{ title: "Section Workspace — NJ CSOC" }] }),
  component: SectionRoute,
});

function SectionRoute() {
  const { sectionId } = Route.useParams();
  return <SectionWorkspace sectionId={sectionId} />;
}
