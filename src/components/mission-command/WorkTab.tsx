import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SegmentedControl } from "./SegmentedControl";
import { SectionsQuestionsTab } from "./SectionsQuestionsTab";
import { QaLogTab } from "./QaLogTab";

type Sub = "questions" | "qa" | "insights";

export function WorkTab({
  missionId,
  missionName,
  sub,
}: {
  missionId: string;
  missionName: string;
  sub?: string;
}) {
  const navigate = useNavigate();
  const initial: Sub = sub === "qa" || sub === "insights" ? sub : "questions";
  const [value, setValue] = useState<Sub>(initial);

  useEffect(() => {
    if (sub === "qa" || sub === "insights" || sub === "questions") setValue(sub);
  }, [sub]);

  const setSub = (v: Sub) => {
    setValue(v);
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: "work", sub: v }),
      replace: true,
    });
  };

  return (
    <div>
      <SegmentedControl
        value={value}
        onChange={setSub}
        options={[
          { id: "questions", label: "Questions" },
          { id: "qa", label: "Q&A" },
          { id: "insights", label: "Insights" },
        ]}
      />
      {value === "questions" && (
        <SectionsQuestionsTab missionId={missionId} missionName={missionName} />
      )}
      {value === "qa" && <QaLogTab missionId={missionId} />}
      {value === "insights" && <InsightsPlaceholder />}
    </div>
  );
}

function InsightsPlaceholder() {
  return (
    <div
      className="rounded-lg p-8 text-center"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.55)",
      }}
    >
      <div className="text-sm">Athena Insights coming soon.</div>
      <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
        Daily insights and writer's notes from Athena strategists will appear here.
      </div>
    </div>
  );
}
