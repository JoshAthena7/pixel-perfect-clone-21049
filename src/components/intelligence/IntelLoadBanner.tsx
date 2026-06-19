import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#C49A2B";

/**
 * Shows a prominent banner pointing users to the Setup Wizard for document
 * ingestion. Auto-hides once ORACLE has >=10 approved or pushed signals.
 */
export function IntelLoadBanner({ missionId }: { missionId: string }) {
  const [dismissed, setDismissed] = useState(false);

  const { data: count } = useQuery({
    queryKey: ["intel-load-banner-count", missionId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("oracle_signals")
        .select("id", { head: true, count: "exact" })
        .eq("mission_id", missionId)
        .in("status", ["approved", "pushed"]);
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  if (dismissed) return null;
  if (count === undefined) return null;
  if (count >= 10) return null;

  return (
    <div
      className="relative rounded-lg px-4 py-3 flex items-start gap-3"
      style={{
        background: "rgba(5,13,24,0.85)",
        border: `1px solid ${GOLD}`,
      }}
    >
      <FileText className="h-5 w-5 shrink-0 mt-0.5" style={{ color: GOLD }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white leading-snug">
          📄 To load documents — RFP, state plan, research, or support docs — use the Mission Setup Wizard. IRIS will extract intelligence automatically.
        </p>
        <div className="mt-2">
          <Link
            to="/olympus/missions/$missionId/wizard"
            params={{ missionId }}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-medium"
            style={{ background: GOLD, color: "#0a0a0a" }}
          >
            Open Setup Wizard
          </Link>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-1 text-white/40 hover:text-white/80"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
