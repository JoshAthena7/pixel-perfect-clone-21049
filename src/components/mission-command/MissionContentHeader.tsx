import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MissionEditPanel } from "@/components/missions/MissionEditPanel";
import { refreshAllMissionFeeds } from "@/lib/iris-refresh-all.functions";
import { tabLabel, type TabId } from "./MissionTabs";

const TAB_SUBTITLES: Partial<Record<TabId, string>> = {
  overview: "What you need to know · what the mission is · what you own",
  "win-strategy": "The North Star and competitive positioning",
  "decision-log": "Recorded decisions and their rationale",
  journey: "Phases and milestones to submission",
  oracle: "Your complete intelligence picture. Updated continuously by IRIS.",
  "rfp-documents": "Solicitation documents and amendments",
  "qa-log": "Questions submitted to the client",
  "sections-questions": "Response sections and assigned questions",
  "question-health": "At-risk questions and response readiness",
  compliance: "Compliance checks and fails",
  "submission-checklist": "Pre-submission checklist",
  team: "Team members and assignments",
  "style-guide": "Voice, tone, and writing standards",
  settings: "Mission configuration",
  "audit-log": "A complete record of every action taken on this mission. Read-only.",
};

const btn =
  "inline-flex items-center gap-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const baseBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.7)",
  fontSize: 12,
  padding: "5px 12px",
};

export function MissionContentHeader({
  missionId,
  activeTab,
  title,
}: {
  missionId: string;
  activeTab: TabId;
  title?: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const refresh = useServerFn(refreshAllMissionFeeds);

  const runIntel = async () => {
    setRunning(true);
    const t = toast.loading("Running intelligence check…");
    try {
      const r: any = await refresh({ data: { missionId } });
      toast.success(
        `Intelligence check complete. ${r?.inserted ?? 0} new signals, ${r?.scanned ?? 0} scanned.`,
        { id: t },
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Intelligence check failed", { id: t });
    } finally {
      setRunning(false);
    }
  };

  const showRunIntel = activeTab === "oracle";
  const heading = title ?? tabLabel(activeTab);
  const subtitle = TAB_SUBTITLES[activeTab];

  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <MissionEditPanel missionId={missionId} open={editOpen} onOpenChange={setEditOpen} />
      <div className="min-w-0">
        <h1 className="text-white text-[20px] font-medium leading-tight">{heading}</h1>
        {subtitle && (
          <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" className={btn} style={baseBtnStyle} onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit Mission
        </button>
        {showRunIntel && (
          <button
            type="button"
            className={btn}
            style={baseBtnStyle}
            onClick={runIntel}
            disabled={running}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}
            Run Intelligence Check
          </button>
        )}
      </div>
    </div>
  );
}
