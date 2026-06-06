import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Calendar, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScaffoldEditor, TemplateCompliancePanel } from "@/components/v2/ScaffoldEditor";

export const Route = createFileRoute(
  "/_authenticated/missions/$missionId/sections/$sectionId",
)({
  component: SectionWorkspace,
});

type Section = {
  id: string;
  mission_id: string;
  number: string;
  title: string;
  rfp_page_ref: string | null;
  assigned_user_id: string | null;
  internal_due_date: string | null;
  studio_status: string | null;
  studio_progress_pct: number | null;
};

function SectionWorkspace() {
  const { missionId, sectionId } = Route.useParams();

  const { data: section, isLoading } = useQuery({
    queryKey: ["mission-section", sectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_sections")
        .select("id, mission_id, number, title, rfp_page_ref, assigned_user_id, internal_due_date, studio_status, studio_progress_pct")
        .eq("id", sectionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as Section;
    },
  });

  const { data: assignee } = useQuery({
    queryKey: ["section-assignee", section?.assigned_user_id],
    enabled: !!section?.assigned_user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, full_name, email")
        .eq("id", section!.assigned_user_id!)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background px-6 py-8">
        <div className="mx-auto max-w-5xl text-sm text-muted-foreground">Loading section…</div>
      </div>
    );
  }
  if (!section) return null;

  const assigneeName =
    (assignee as any)?.display_name ||
    (assignee as any)?.full_name ||
    (assignee as any)?.email ||
    "Unassigned";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link
          to="/missions/$missionId/overview"
          params={{ missionId }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Mission Overview
        </Link>

        <header className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono mb-2">
            Section Workspace · {section.number}
          </div>
          <h1 className="text-2xl font-semibold text-foreground">{section.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" /> {assigneeName}
            </span>
            {section.internal_due_date && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Due {new Date(section.internal_due_date).toLocaleDateString()}
              </span>
            )}
            {section.rfp_page_ref && (
              <span className="font-mono">RFP {section.rfp_page_ref}</span>
            )}
            {section.studio_status && (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                {section.studio_status}
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          <ScaffoldEditor missionId={missionId} sectionId={sectionId} />
          <aside className="space-y-4">
            <TemplateCompliancePanel missionId={missionId} sectionId={sectionId} />
          </aside>
        </div>
      </div>
    </div>
  );
}
