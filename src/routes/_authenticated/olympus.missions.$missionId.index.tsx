import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { getLastTab, setLastTab } from "@/lib/last-tab";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { MissionContentHeader } from "@/components/mission-command/MissionContentHeader";
import {
  MissionTabs,
  isValidTab,
  TAB_REDIRECTS,
  visibleTabsForRole,
  defaultTabForRole,
  useViewerMissionRole,
  type TabId,
} from "@/components/mission-command/MissionTabs";
import { OverviewTab } from "@/components/mission-command/OverviewTab";
import { WorkTab } from "@/components/mission-command/WorkTab";
import { TeamTab } from "@/components/mission-command/TeamTab";
import { SettingsTab } from "@/components/mission-command/SettingsTab";
import { OracleTab } from "@/components/mission-command/oracle/OracleTab";

const searchSchema = z.object({
  launched: z.coerce.number().optional(),
  tab: z.string().optional(),
  sub: z.string().optional(),
  add: z.union([z.string(), z.number()]).optional(),
});

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: MissionCommandCenter,
});

function MissionCommandCenter() {
  const { missionId } = Route.useParams();
  const { launched, tab, sub } = Route.useSearch();
  const navigate = useNavigate();
  const { data: role } = useViewerMissionRole(missionId);

  // Compute the resolved tab + redirect target (if any) for the raw `tab` value.
  const resolved = useMemo(() => {
    if (!tab) return null;
    if (isValidTab(tab)) return { tab: tab as TabId, sub: sub as string | undefined, section: null as string | null };
    const r = TAB_REDIRECTS[tab];
    if (r) return { tab: r.tab, sub: r.sub ?? (sub as string | undefined), section: r.section ?? null };
    return null;
  }, [tab, sub]);

  const activeTab: TabId = resolved?.tab ?? "overview";
  const activeSub = resolved?.sub;
  const scrollTo = resolved?.section ?? null;

  // Apply redirects: if the URL had an old tab id, normalize to the new one.
  useEffect(() => {
    if (!tab) return;
    if (isValidTab(tab)) return;
    const r = TAB_REDIRECTS[tab];
    if (r) {
      navigate({
        to: "/olympus/missions/$missionId",
        params: { missionId },
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          tab: r.tab,
          ...(r.sub ? { sub: r.sub } : {}),
        }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, missionId]);

  // Restore last-visited tab when no tab is in URL
  useEffect(() => {
    if (tab) return;
    const last = getLastTab(missionId);
    const target = last ?? defaultTabForRole(role ?? null);
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: target }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, missionId, role]);

  // Persist tab changes
  useEffect(() => {
    if (tab && isValidTab(tab)) setLastTab(missionId, tab);
  }, [tab, missionId]);

  // Enforce role-based visibility — if user navigates to a tab they cannot see,
  // bounce to their default. Silent.
  useEffect(() => {
    if (!role || !tab || !isValidTab(tab)) return;
    const visible = visibleTabsForRole(role);
    if (!visible.includes(tab)) {
      navigate({
        to: "/olympus/missions/$missionId",
        params: { missionId },
        search: (prev: Record<string, unknown>) => ({ ...prev, tab: defaultTabForRole(role) }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, tab, missionId]);

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
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: next, sub: undefined }),
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
      <MissionTabs active={activeTab} onChange={setTab} missionId={missionId} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <MissionContentHeader missionId={missionId} activeTab={activeTab} />
        {activeTab === "overview" && (
          <OverviewTab missionId={missionId} scrollTo={scrollTo} onNavigateTab={setTab} />
        )}
        {activeTab === "work" && (
          <WorkTab missionId={missionId} missionName={mission.name} sub={activeSub} />
        )}
        {activeTab === "oracle" && <OracleTab missionId={missionId} />}
        {activeTab === "team" && (
          <TeamTab missionId={missionId} missionName={mission.name} sub={activeSub} />
        )}
        {activeTab === "settings" && (
          <SettingsTab missionId={missionId} missionName={mission.name} sub={activeSub} />
        )}
      </div>
    </div>
  );
}
