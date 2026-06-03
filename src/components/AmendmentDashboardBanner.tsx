import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X } from "lucide-react";
import { AmendmentReviewPanel } from "./AmendmentReviewPanel";

type AmendmentSummary = {
  id: string;
  amendment_type: string;
  total_changes: number;
  critical_changes: number;
  analyzed_at: string | null;
};

function dismissKey(amendmentId: string) {
  return `iris.amendment.dismissed.${amendmentId}`;
}

export function AmendmentDashboardBanner({ missionId }: { missionId: string }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const { data: latest } = useQuery({
    queryKey: ["mission-latest-amendment", missionId],
    enabled: !!missionId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("rfp_amendments")
        .select("id,amendment_type,total_changes,critical_changes,analyzed_at")
        .eq("mission_id", missionId)
        .eq("status", "analyzed")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as AmendmentSummary | null;
    },
  });

  useEffect(() => {
    if (!latest) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(dismissKey(latest.id))) setDismissedId(latest.id);
  }, [latest]);

  if (!latest || latest.total_changes === 0) return null;
  if (dismissedId === latest.id) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") localStorage.setItem(dismissKey(latest.id), "1");
    setDismissedId(latest.id);
  };

  return (
    <>
      <div className="rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-amber-300">
            Amendment analyzed — {latest.critical_changes} critical change{latest.critical_changes === 1 ? "" : "s"}
          </span>
          <span className="text-muted-foreground"> · {latest.total_changes} total · {latest.amendment_type.replace(/_/g, " ")}</span>
        </div>
        <button
          onClick={() => setReviewOpen(true)}
          className="rounded-md border border-amber-500/40 bg-background px-3 py-1.5 text-xs font-medium hover:bg-amber-500/10"
        >
          View changes →
        </button>
        <button
          onClick={dismiss}
          className="rounded-md border border-border p-1.5 hover:bg-muted/40"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {reviewOpen && (
        <AmendmentReviewPanel
          amendmentId={latest.id}
          missionId={missionId}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </>
  );
}
