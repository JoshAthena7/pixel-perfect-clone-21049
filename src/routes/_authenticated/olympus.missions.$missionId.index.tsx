import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { MissionHeader } from "@/components/mission-command/MissionHeader";
import {
  MissionTabs,
  isValidTab,
  tabLabel,
  type TabId,
} from "@/components/mission-command/MissionTabs";
import { OverviewTab } from "@/components/mission-command/OverviewTab";
import { SectionsQuestionsTab } from "@/components/mission-command/SectionsQuestionsTab";
import { QuestionHealthTab } from "@/components/mission-command/QuestionHealthTab";
import { RfpDocumentsTab } from "@/components/mission-command/RfpDocumentsTab";
import { QaLogTab } from "@/components/mission-command/QaLogTab";
import { ClientIntelligenceTab } from "@/components/mission-command/ClientIntelligenceTab";
import { IntelligenceLibraryTab } from "@/components/mission-command/IntelligenceLibraryTab";

const searchSchema = z.object({
  launched: z.coerce.number().optional(),
  tab: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: MissionCommandCenter,
});

function MissionCommandCenter() {
  const { missionId } = Route.useParams();
  const { launched, tab } = Route.useSearch();
  const navigate = useNavigate();

  const activeTab: TabId = isValidTab(tab) ? tab : "overview";

  const { data: mission, isLoading } = useQuery({
    queryKey: ["mission-header", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name, client_name, status, submission_deadline")
        .eq("id", missionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["mission-unread", missionId],
    queryFn: async () => {
      const { count } = await supabase
        .from("atlas_notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (launched) {
      toast.success(
        "Mission is live. Your team has been notified. The clock is running. Go win this.",
        { duration: 6000 },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launched]);

  const setTab = (next: TabId) => {
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: next }),
    });
  };

  if (isLoading || !mission) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <MissionHeader mission={mission} unreadCount={unreadCount} />
      <MissionTabs active={activeTab} onChange={setTab} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {activeTab === "overview" && (
          <OverviewTab missionId={missionId} onNavigateTab={setTab} />
        )}
        {activeTab === "sections-questions" && (
          <SectionsQuestionsTab missionId={missionId} missionName={mission.name} />
        )}
        {activeTab === "question-health" && (
          <QuestionHealthTab missionId={missionId} onNavigateTab={setTab} />
        )}
        {activeTab === "rfp-documents" && <RfpDocumentsTab missionId={missionId} />}
        {activeTab === "qa-log" && <QaLogTab missionId={missionId} />}
        {activeTab === "client-intel" && <ClientIntelligenceTab missionId={missionId} />}
        {activeTab === "intel-library" && <IntelligenceLibraryTab missionId={missionId} />}
        {activeTab !== "overview" &&
          activeTab !== "sections-questions" &&
          activeTab !== "question-health" &&
          activeTab !== "rfp-documents" &&
          activeTab !== "qa-log" &&
          activeTab !== "client-intel" &&
          activeTab !== "intel-library" && (
            <div className="rounded-xl border border-dashed border-border p-16 text-center">
              <p className="text-lg text-muted-foreground">
                {tabLabel(activeTab)} — Coming in a future sprint.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
