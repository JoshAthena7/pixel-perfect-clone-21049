import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Activity, Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { MissionEditPanel } from "@/components/missions/MissionEditPanel";
import { refreshAllMissionFeeds } from "@/lib/iris-refresh-all.functions";
import { ScoreDraftPanel } from "@/components/my-work/ScoreDraftPanel";
import { AskIrisButton } from "@/components/iris/AskIrisButton";
import { tabLabel, type TabId } from "./MissionTabs";

const TAB_SUBTITLES: Partial<Record<TabId, string>> = {
  overview: "Mission health, strategy, journey, and progress in one place.",
  work: "Sections, questions, Q&A, and Athena insights.",
  oracle: "Your complete intelligence picture. Updated continuously by IRIS.",
  team: "Roster, assignments, and style guide.",
  settings: "Mission details, documents, and audit log.",
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
  const [scoreOpen, setScoreOpen] = useState(false);
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
        <button
          type="button"
          onClick={() => setScoreOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md transition-colors"
          style={{
            background: "rgba(196,154,43,0.15)",
            border: "1px solid rgba(196,154,43,0.4)",
            color: "#C49A2B",
            fontSize: 12,
            padding: "5px 12px",
          }}
        >
          <Target className="h-3.5 w-3.5" /> Score Draft
        </button>
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
      <ScoreDraftPanel
        open={scoreOpen}
        onOpenChange={setScoreOpen}
        missionId={missionId}
      />
    </div>
  );
}
