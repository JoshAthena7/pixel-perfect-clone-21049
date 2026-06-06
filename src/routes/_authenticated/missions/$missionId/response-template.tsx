import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { ResponseTemplateConfigurator } from "@/components/v2/ResponseTemplateConfigurator";

export const Route = createFileRoute("/_authenticated/missions/$missionId/response-template")({
  component: ResponseTemplatePage,
});

function ResponseTemplatePage() {
  const { missionId } = Route.useParams();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          to="/missions/$missionId/brief"
          params={{ missionId }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Mission Overview
        </Link>
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono mb-2">
            Mission Setup · Step 5
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Response Template</h1>
        </div>
        <ResponseTemplateConfigurator missionId={missionId} />
      </div>
    </div>
  );
}
