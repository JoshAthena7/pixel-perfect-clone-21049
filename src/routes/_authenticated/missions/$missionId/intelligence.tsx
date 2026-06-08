import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MissionBriefView } from "@/components/intelligence/MissionBriefView";
import { StrategicAssessmentView } from "@/components/intelligence/StrategicAssessmentView";

export const Route = createFileRoute("/_authenticated/missions/$missionId/intelligence")({
  component: IntelligencePage,
});

type Tab = "mission_brief" | "strategic_assessment";

function IntelligencePage() {
  const { missionId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("mission_brief");

  return (
    <div style={{ background: "#0a0e1a", minHeight: "calc(100vh - 56px)" }}>
      <div className="mx-auto max-w-[1200px] px-6 pt-6">
        <div className="flex gap-1 border-b border-white/10">
          <TabButton active={tab === "mission_brief"} onClick={() => setTab("mission_brief")}>
            Mission Brief
          </TabButton>
          <TabButton active={tab === "strategic_assessment"} onClick={() => setTab("strategic_assessment")}>
            Strategic Assessment
          </TabButton>
        </div>
      </div>
      {tab === "mission_brief" ? (
        <MissionBriefView missionId={missionId} />
      ) : (
        <StrategicAssessmentView missionId={missionId} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-3 text-sm transition-colors"
      style={{
        color: active ? "#fff" : "rgba(255,255,255,0.55)",
        borderBottom: active ? "2px solid #C9A84C" : "2px solid transparent",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}
