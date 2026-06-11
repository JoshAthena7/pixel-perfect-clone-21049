import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SegmentedControl } from "./SegmentedControl";
import { TeamAssignmentsTab } from "./TeamAssignmentsTab";
import { StyleGuideTab } from "./StyleGuideTab";

type Sub = "roster" | "style-guide";

export function TeamTab({
  missionId,
  missionName,
  sub,
}: {
  missionId: string;
  missionName: string;
  sub?: string;
}) {
  const navigate = useNavigate();
  const initial: Sub = sub === "style-guide" ? "style-guide" : "roster";
  const [value, setValue] = useState<Sub>(initial);

  useEffect(() => {
    if (sub === "roster" || sub === "style-guide") setValue(sub);
  }, [sub]);

  const setSub = (v: Sub) => {
    setValue(v);
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: "team", sub: v }),
      replace: true,
    });
  };

  return (
    <div>
      <SegmentedControl
        value={value}
        onChange={setSub}
        options={[
          { id: "roster", label: "Roster" },
          { id: "style-guide", label: "Style Guide" },
        ]}
      />
      {value === "roster" && (
        <TeamAssignmentsTab missionId={missionId} missionName={missionName} />
      )}
      {value === "style-guide" && <StyleGuideTab missionId={missionId} />}
    </div>
  );
}
