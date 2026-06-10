import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Activity, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MissionEditPanel } from "@/components/missions/MissionEditPanel";
import { refreshAllMissionFeeds } from "@/lib/iris-refresh-all.functions";

export function QuickActionsBar({ missionId }: { missionId: string }) {
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

  const shareLink = async () => {
    const url = `${window.location.origin}/olympus/missions/${missionId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Mission link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="border-b border-border bg-surface/20">
      <MissionEditPanel missionId={missionId} open={editOpen} onOpenChange={setEditOpen} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">
          Quick actions
        </span>
        <button type="button" className={btn} onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit Mission
        </button>
        <button type="button" className={btn} onClick={runIntel} disabled={running}>
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Activity className="h-3.5 w-3.5" />
          )}
          Run Intelligence Check
        </button>
        <button type="button" className={btn} onClick={shareLink}>
          <Link2 className="h-3.5 w-3.5" /> Share Mission Link
        </button>
      </div>
    </div>
  );
}
