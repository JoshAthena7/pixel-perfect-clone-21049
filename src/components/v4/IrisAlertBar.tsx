import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLatestMissionPulse } from "@/lib/mission-pulse.functions";
import { Sparkles, AlertTriangle, X } from "lucide-react";
import { useState } from "react";

export function IrisAlertBar({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getLatestMissionPulse);
  const { data, refetch } = useQuery({
    queryKey: ["iris-alert", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 30_000,
  });
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  // Live refresh when new daily_pulse signal lands
  useEffect(() => {
    const ch = supabase
      .channel(`iris-alert:${missionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signals",
          filter: `mission_id=eq.${missionId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["iris-alert", missionId] });
          refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [missionId, qc, refetch]);

  if (!data || !data.payload) return null;
  if (dismissedId === data.id) return null;

  // Only surface if within last 24h
  const ageMs = Date.now() - new Date(data.created_at).getTime();
  if (ageMs > 24 * 3_600_000) return null;

  const sev = data.severity;
  const tone =
    sev === "critical"
      ? "border-red-500/40 bg-red-500/[0.07] text-red-100"
      : sev === "warning"
        ? "border-amber-500/40 bg-amber-500/[0.07] text-amber-100"
        : "border-primary/40 bg-primary/[0.06] text-foreground";
  const Icon = sev === "info" ? Sparkles : AlertTriangle;
  const iconTone =
    sev === "critical" ? "text-red-300" : sev === "warning" ? "text-amber-300" : "text-primary";

  const author = data.payload.author ?? "Team member";
  const confidence = data.payload.confidence;

  return (
    <div className="mx-auto mt-4 max-w-[1200px] px-6">
      <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${tone}`}>
        <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconTone}`} />
        <div className="flex-1 text-[13px] leading-relaxed">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
            <span>IRIS Alert · Live from Daily Pulse</span>
            <span className="opacity-60">·</span>
            <span>confidence {confidence}</span>
          </div>
          <div className="mt-1 font-medium">{data.signal_title}</div>
          <div className="mt-0.5 text-[11px] opacity-70">
            From {author} · {timeAgo(data.created_at)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissedId(data.id)}
          aria-label="Dismiss"
          className="rounded-md p-1 opacity-60 hover:bg-foreground/10 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
