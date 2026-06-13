import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useIris } from "@/components/iris/IrisContext";
import { CollapsibleSection } from "./CollapsibleSection";
import { WinStrategyLiveTab } from "./WinStrategyLiveTab";
import { JourneyLiveTab } from "./JourneyLiveTab";
import { QuestionHealthTab } from "./QuestionHealthTab";
import { DecisionLogTab } from "./DecisionLogTab";
import { ComplianceTab } from "./ComplianceTab";
import { SubmissionChecklistTab } from "./SubmissionChecklistTab";
import { useViewerMissionRole, type TabId } from "./MissionTabs";
import { IrisThreadExtractionPanel } from "./IrisThreadExtractionPanel";

const GOLD = "#C49A2B";

export function OverviewTab({
  missionId,
  scrollTo,
  onNavigateTab,
}: {
  missionId: string;
  scrollTo?: string | null;
  onNavigateTab: (t: TabId) => void;
}) {
  const iris = useIris();
  const { data: role } = useViewerMissionRole(missionId);
  const isAdminish = role === "admin" || role === "engagement_lead";
  const isExec = role === "executive";

  useEffect(() => {
    iris.setSection(null, "Mission Overview");
  }, [iris, missionId]);

  // Scroll to a target section when arriving via redirect
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(scrollTo);
    if (el) {
      // small delay so collapsibles can render
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }, [scrollTo, missionId]);

  const { data: mission } = useQuery({
    queryKey: ["overview-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, name, client_name, submission_deadline")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 860 }}>
      <MissionHealthBar missionId={missionId} deadline={mission?.submission_deadline ?? null} />

      <CollapsibleSection id="win-strategy" title="Win Strategy" missionId={missionId}>
        <WinStrategyLiveTab missionId={missionId} missionName={mission?.name ?? ""} />
      </CollapsibleSection>

      <CollapsibleSection id="journey" title="Mission Journey" missionId={missionId}>
        <JourneyLiveTab missionId={missionId} deadline={mission?.submission_deadline ?? null} />
      </CollapsibleSection>

      <CollapsibleSection id="question-health" title="Question Health" missionId={missionId}>
        <QuestionHealthTab missionId={missionId} onNavigateTab={onNavigateTab} />
      </CollapsibleSection>

      {!isExec && (
        <CollapsibleSection id="decision-log" title="Decision Log" missionId={missionId}>
          <DecisionLogTab missionId={missionId} missionName={mission?.name ?? ""} />
        </CollapsibleSection>
      )}

      <CollapsibleSection
        id="compliance"
        title="Compliance & Submission"
        missionId={missionId}
        defaultOpen={false}
      >
        <div className="space-y-6">
          <ComplianceTab
            missionId={missionId}
            missionName={mission?.name ?? ""}
            deadline={mission?.submission_deadline ?? null}
          />
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
          <SubmissionChecklistTab
            missionId={missionId}
            deadline={mission?.submission_deadline ?? null}
          />
        </div>
      </CollapsibleSection>

      {isAdminish && null /* admin-only flourishes could go here */}
    </div>
  );
}

function MissionHealthBar({
  missionId,
  deadline,
}: {
  missionId: string;
  deadline: string | null;
}) {
  const { data } = useQuery({
    queryKey: ["overview-health-bar", missionId],
    queryFn: async () => {
      const [total, healthy, atRisk, notStarted, phase] = await Promise.all([
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .eq("health_status", "healthy"),
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .eq("health_status", "at_risk"),
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .eq("health_status", "not_started"),
        supabase
          .from("mission_journey_phases")
          .select("name, is_cleared, order_index")
          .eq("mission_id", missionId)
          .eq("is_cleared", false)
          .order("order_index", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        total: total.count ?? 0,
        healthy: healthy.count ?? 0,
        at_risk: atRisk.count ?? 0,
        not_started: notStarted.count ?? 0,
        phase: (phase.data?.name as string | null) ?? null,
      };
    },
  });

  const total = data?.total ?? 0;
  const healthy = data?.healthy ?? 0;
  const atRisk = data?.at_risk ?? 0;
  const notStarted = data?.not_started ?? 0;
  const healthyPct = total > 0 ? (healthy / total) * 100 : 0;
  const atRiskPct = total > 0 ? (atRisk / total) * 100 : 0;
  const notStartedPct = total > 0 ? (notStarted / total) * 100 : 0;
  const days = deadline ? differenceInCalendarDays(new Date(deadline), new Date()) : null;
  const dueColor =
    days === null
      ? "rgba(255,255,255,0.55)"
      : days < 14
        ? "#f08080"
        : days < 30
          ? "#f5b86b"
          : "rgba(255,255,255,0.7)";

  return (
    <div
      className="mb-5 rounded-lg"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        padding: "14px 20px",
      }}
    >
      <div className="flex items-center gap-5">
        {/* Left — counts */}
        <div className="flex items-center gap-1.5 shrink-0" style={{ fontSize: 12 }}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>
            {total} question{total === 1 ? "" : "s"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
          <span style={{ color: healthy > 0 ? "#7dcf7d" : "rgba(255,255,255,0.5)" }}>
            {healthy} healthy
          </span>
          <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
          <button
            onClick={() => document.getElementById("question-health")?.scrollIntoView({ behavior: "smooth" })}
            className="hover:underline"
            style={{ color: atRisk > 0 ? "#f08080" : "rgba(255,255,255,0.5)", fontWeight: atRisk > 0 ? 500 : 400 }}
          >
            {atRisk} at risk
          </button>
          <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>{notStarted} not started</span>
        </div>

        {/* Center — progress bar */}
        <div
          className="flex-1 rounded-full overflow-hidden flex"
          style={{ height: 6, background: "rgba(255,255,255,0.04)" }}
        >
          {atRiskPct > 0 && <div style={{ width: `${atRiskPct}%`, background: "#f08080" }} />}
          {healthyPct > 0 && <div style={{ width: `${healthyPct}%`, background: "#7dcf7d" }} />}
          {notStartedPct > 0 && <div style={{ width: `${notStartedPct}%`, background: "rgba(255,255,255,0.18)" }} />}
        </div>

        {/* Right — deadline + phase */}
        <div className="flex items-center gap-1.5 shrink-0" style={{ fontSize: 12 }}>
          {deadline && (
            <>
              <span style={{ color: dueColor }}>
                Due {format(new Date(deadline), "MMM d")}
                {days !== null && (
                  <> · {days < 0 ? `${Math.abs(days)}d past` : `${days} day${days === 1 ? "" : "s"}`}</>
                )}
              </span>
              {data?.phase && <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>}
            </>
          )}
          {data?.phase && (
            <span style={{ color: "rgba(255,255,255,0.55)" }}>{data.phase} phase</span>
          )}
        </div>
      </div>
    </div>
  );
}
