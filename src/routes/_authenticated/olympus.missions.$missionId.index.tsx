import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { getLastTab, setLastTab } from "@/lib/last-tab";
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
// ClientIntelligenceTab now rendered inside OracleTab > Stakeholders sub-tab
import { IntelligenceLibraryTab } from "@/components/mission-command/IntelligenceLibraryTab";
import { ComplianceTab } from "@/components/mission-command/ComplianceTab";
import { SubmissionChecklistTab } from "@/components/mission-command/SubmissionChecklistTab";
import { TeamAssignmentsTab } from "@/components/mission-command/TeamAssignmentsTab";
import { StyleGuideTab } from "@/components/mission-command/StyleGuideTab";
import { WinStrategyLiveTab } from "@/components/mission-command/WinStrategyLiveTab";
import { DecisionLogTab } from "@/components/mission-command/DecisionLogTab";
import { JourneyLiveTab } from "@/components/mission-command/JourneyLiveTab";
import { MissionSettingsTab } from "@/components/mission-command/MissionSettingsTab";
import { AuditLogTab } from "@/components/mission-command/AuditLogTab";
import { OracleTab } from "@/components/mission-command/oracle/OracleTab";
import { QuickActionsBar } from "@/components/mission-command/QuickActionsBar";

const searchSchema = z.object({
  launched: z.coerce.number().optional(),
  tab: z.string().optional(),
  sub: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: MissionCommandCenter,
});

function MissionCommandCenter() {
  const { missionId } = Route.useParams();
  const { launched, tab } = Route.useSearch();
  const navigate = useNavigate();

  let activeTab: TabId = isValidTab(tab) ? tab : "overview";
  // Restore last-visited tab when no tab is in URL
  useEffect(() => {
    if (!tab) {
      const last = getLastTab(missionId);
      if (last && isValidTab(last)) {
        navigate({
          to: "/olympus/missions/$missionId",
          params: { missionId },
          search: (prev: Record<string, unknown>) => ({ ...prev, tab: last }),
          replace: true,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, missionId]);
  // Persist tab changes
  useEffect(() => {
    if (tab && isValidTab(tab)) setLastTab(missionId, tab);
  }, [tab, missionId]);
  // Redirect old Client Intelligence tab to Oracle stakeholders sub-tab
  useEffect(() => {
    if (tab === "client-intel") {
      navigate({
        to: "/olympus/missions/$missionId",
        params: { missionId },
        search: (prev: Record<string, unknown>) => ({ ...prev, tab: "oracle", sub: "stakeholders" }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  if (activeTab === "client-intel") activeTab = "oracle";

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
        "Mission is live. Your team has been notified. IRIS is building your Mission Intelligence Graph in the background. The clock is running.",
        {
          duration: 10000,
          action: {
            label: "Go to Flight Deck",
            onClick: () => navigate({ to: "/olympus/flight-deck" }),
          },
        },
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
      <MissionTabs active={activeTab} onChange={setTab} missionId={missionId} />
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
        {activeTab === "oracle" && <OracleTab missionId={missionId} />}
        {activeTab === "intel-library" && <IntelligenceLibraryTab missionId={missionId} />}
        {activeTab === "compliance" && (
          <ComplianceTab
            missionId={missionId}
            missionName={mission.name}
            deadline={mission.submission_deadline}
          />
        )}
        {activeTab === "submission-checklist" && (
          <SubmissionChecklistTab missionId={missionId} deadline={mission.submission_deadline} />
        )}
        {activeTab === "team" && (
          <TeamAssignmentsTab missionId={missionId} missionName={mission.name} />
        )}
        {activeTab === "style-guide" && <StyleGuideTab missionId={missionId} />}
        {activeTab === "win-strategy" && (
          <WinStrategyLiveTab missionId={missionId} missionName={mission.name} />
        )}
        {activeTab === "decision-log" && (
          <DecisionLogTab missionId={missionId} missionName={mission.name} />
        )}
        {activeTab === "journey" && (
          <JourneyLiveTab missionId={missionId} deadline={mission.submission_deadline} />
        )}
        {activeTab === "settings" && <MissionSettingsTab missionId={missionId} />}
        {activeTab === "audit-log" && (
          <AuditLogTab missionId={missionId} missionName={mission.name} />
        )}
      </div>
    </div>
  );
}
