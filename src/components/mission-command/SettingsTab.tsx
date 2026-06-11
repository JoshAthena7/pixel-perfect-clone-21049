import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SegmentedControl } from "./SegmentedControl";
import { MissionSettingsTab } from "./MissionSettingsTab";
import { RfpDocumentsTab } from "./RfpDocumentsTab";
import { AuditLogTab } from "./AuditLogTab";

type Sub = "details" | "documents" | "audit-log";

export function SettingsTab({
  missionId,
  missionName,
  sub,
}: {
  missionId: string;
  missionName: string;
  sub?: string;
}) {
  const navigate = useNavigate();
  const initial: Sub = sub === "documents" || sub === "audit-log" ? sub : "details";
  const [value, setValue] = useState<Sub>(initial);

  useEffect(() => {
    if (sub === "details" || sub === "documents" || sub === "audit-log") setValue(sub);
  }, [sub]);

  const setSub = (v: Sub) => {
    setValue(v);
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: "settings", sub: v }),
      replace: true,
    });
  };

  return (
    <div>
      <SegmentedControl
        value={value}
        onChange={setSub}
        options={[
          { id: "details", label: "Details" },
          { id: "documents", label: "Documents" },
          { id: "audit-log", label: "Audit Log" },
        ]}
      />
      {value === "details" && <MissionSettingsTab missionId={missionId} />}
      {value === "documents" && <RfpDocumentsTab missionId={missionId} />}
      {value === "audit-log" && <AuditLogTab missionId={missionId} missionName={missionName} />}
    </div>
  );
}
