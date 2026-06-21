import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useMissionAccess } from "@/hooks/useAccess";

import { RequestChangeButton } from "@/components/RequestChangeButton";
import { WriterIntelView } from "@/components/oracle/WriterIntelView";
import { listOracleSignalsForMission } from "@/lib/oracle-intel.functions";

import { JumpNav, useScrollSpy } from "./sections/JumpNav";
import { ExecutiveSummary } from "./sections/ExecutiveSummary";
import { KeySignals } from "./sections/KeySignals";
import { StakeholderIntel } from "./sections/StakeholderIntel";
import { CompetitiveIntel } from "./sections/CompetitiveIntel";
import { EvidenceBase } from "./sections/EvidenceBase";
import { SourceNetwork } from "./sections/SourceNetwork";
import { IntelligenceGaps } from "./sections/IntelligenceGaps";
import { AnalysisTools } from "./sections/AnalysisTools";
import { IntelSidebar } from "./sections/IntelSidebar";
import { ATLASCommandSurface } from "./sections/ATLASCommandSurface";

export function OracleTab({ missionId }: { missionId: string }) {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: access, isLoading: accessLoading } = useMissionAccess(missionId);
  const missionRole = access?.role ?? null;
  const LEAD_ROLES = ["engagement_lead", "manager", "project_manager", "lead", "admin"];
  const canLead = isAdmin || (missionRole != null && LEAD_ROLES.includes(missionRole));
  const showWriter = !isAdmin && !canLead;
  const roleResolving = adminLoading || accessLoading;

  const activeSection = useScrollSpy();

  const { data: mission } = useQuery({
    queryKey: ["oracle-mission-header", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client_name,agency_name,state_code,program_type")
        .eq("id", missionId)
        .single();
      return data;
    },
  });

  const listOracleFn = useServerFn(listOracleSignalsForMission);
  const { data: signals = [] } = useQuery({
    queryKey: ["oracle-signals", missionId],
    queryFn: () => listOracleFn({ data: { missionId } }),
    staleTime: 30_000,
  });

  const { data: sourceCount = 0 } = useQuery({
    queryKey: ["oracle-source-count", missionId, mission?.state_code],
    queryFn: async () => {
      const sb = supabase as any;
      const orParts = [`tier.eq.platform`, `and(tier.eq.mission,mission_id.eq.${missionId})`];
      if (mission?.state_code)
        orParts.push(`and(tier.eq.state,state_code.eq.${mission.state_code})`);
      const { count } = await sb
        .from("oracle_source_registry")
        .select("id", { count: "exact", head: true })
        .or(orParts.join(","));
      return count ?? 0;
    },
    enabled: !!mission,
    staleTime: 60_000,
  });

  const approvedCount = useMemo(
    () => (signals as any[]).filter((s) => ["approved", "pushed"].includes(s.status)).length,
    [signals]
  );
  const pendingReviewCount = useMemo(
    () => (signals as any[]).filter((s) => s.status === "needs_review" || s.status === "pending_review").length,
    [signals]
  );

  if (roleResolving) {
    return (
      <div className="py-12 text-center" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
        Loading…
      </div>
    );
  }

  if (showWriter) {
    return <WriterIntelView missionId={missionId} />;
  }

  const stateLabel = mission?.state_code ?? "platform";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8">
      <IntelSidebar
        missionId={missionId}
        approvedCount={approvedCount}
        activeSection={activeSection}
      />

      <main className="min-w-0">
        <ATLASCommandSurface missionId={missionId} signals={signals as any[]} />
        <JumpNav active={activeSection} />

        <div className="flex items-center justify-end gap-2 mb-3">
          {pendingReviewCount > 0 && (
            <button
              onClick={() => document.getElementById("oracle-review-queue")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="inline-flex items-center text-[13px] font-medium rounded transition-colors"
              style={{
                height: 36,
                padding: "0 14px",
                background: "rgba(196,154,43,0.9)",
                color: "#0D1B3E",
              }}
            >
              Review {pendingReviewCount} signal{pendingReviewCount === 1 ? "" : "s"} →
            </button>
          )}
          <RequestChangeButton
            surface="oracle:intelligence"
            missionId={missionId}
            section="Intelligence"
          />
        </div>

        <ExecutiveSummary
          missionId={missionId}
          approvedCount={approvedCount}
          signals={signals as any[]}
        />

        <div id="oracle-review-queue">
          <KeySignals signals={signals as any[]} />
        </div>

        <StakeholderIntel missionId={missionId} signals={signals as any[]} />

        <CompetitiveIntel signals={signals as any[]} />

        <EvidenceBase signals={signals as any[]} />

        <SourceNetwork
          missionId={missionId}
          signals={signals as any[]}
          sourceCount={sourceCount as number}
          stateLabel={stateLabel}
        />

        <IntelligenceGaps missionId={missionId} />

        <AnalysisTools
          missionId={missionId}
          isAdmin={isAdmin}
          canLead={canLead}
          completeness={Math.min(100, Math.round((approvedCount / 50) * 100))}
        />
      </main>
    </div>
  );
}
