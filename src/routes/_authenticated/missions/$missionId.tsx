import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Zap, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateMissionBrief } from "@/lib/iris-mission-brief.functions";
import { useMissionAccess } from "@/hooks/useAccess";
import { NotAvailable } from "@/components/access/NotAvailable";

export const Route = createFileRoute("/_authenticated/missions/$missionId")({
  component: MissionLayout,
});

function MissionLayout() {
  const { missionId } = Route.useParams();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Per the Permissions spec: a user who is not a mission member sees
  // "This mission is not available." — no name, no error, no role hint.
  const { data: access, isLoading: accessLoading } = useMissionAccess(missionId);

  if (accessLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!access?.allowed) {
    return <NotAvailable kind="mission" />;
  }

  // Hide persistent IRIS strip on Studio / section workspace / settings.
  const hideStrip =
    path.includes("/sections") ||
    path.endsWith("/studio") ||
    path.endsWith("/settings");

  return (
    <div className="flex flex-col min-h-full">
      <OracleWarmingBanner missionId={missionId} />
      {!hideStrip && <IrisBriefStrip missionId={missionId} />}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

function OracleWarmingBanner({ missionId }: { missionId: string }) {
  const storageKey = `iris-warming:${missionId}`;
  const [active, setActive] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["mission-kickoff-status", missionId],
    enabled: active && !dismissed,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("iris_kickoff_status")
        .eq("id", missionId)
        .maybeSingle();
      return (data?.iris_kickoff_status ?? null) as string | null;
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  // Auto-dismiss once kickoff completes (or hard-fails — no point polling forever).
  useEffect(() => {
    if (data === "complete" || data === "failed") {
      try { sessionStorage.removeItem(storageKey); } catch {}
      setActive(false);
    }
  }, [data, storageKey]);

  if (!active || dismissed) return null;

  return (
    <div className="border-b border-[color:var(--iris,#22d3ee)]/20 bg-[color:var(--iris,#22d3ee)]/[0.05]">
      <div className="mx-auto max-w-[1400px] px-8 py-2 flex items-center gap-2 text-xs text-[color:var(--iris,#22d3ee)]">
        <Zap className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">
          IRIS is finishing your Oracle — check back in a few minutes.
        </span>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded text-[color:var(--iris,#22d3ee)]/70 hover:bg-[color:var(--iris,#22d3ee)]/10 hover:text-[color:var(--iris,#22d3ee)]"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}


function IrisBriefStrip({ missionId }: { missionId: string }) {
  const [open, setOpen] = useState(true);
  const qc = useQueryClient();
  const generate = useServerFn(generateMissionBrief);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["iris-mission-brief", missionId],
    queryFn: async () => {
      try {
        return await generate({ data: { missionId, force: false } });
      } catch {
        return missingMissionBrief();
      }
    },
    staleTime: 15 * 60 * 1000,
  });

  const refresh = async () => {
    const fresh = await generate({ data: { missionId, force: true } }).catch(() => missingMissionBrief());
    qc.setQueryData(["iris-mission-brief", missionId], fresh);
  };

  const brief = data?.brief ?? "";
  const firstSentence = brief.split(/(?<=[.!?])\s/)[0] ?? brief;
  const stamp = data?.generated_at
    ? relativeStamp(data.generated_at)
    : "—";

  return (
    <div className="border-b border-border bg-surface/40">
      <div className="mx-auto max-w-[1400px] px-8 py-3">
        <div className="iris-panel rounded-[10px] border border-[color:var(--iris,#22d3ee)]/30 border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04] px-4 py-2.5">
          <div className="flex items-start gap-3">
            <span className="iris-label inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)] shrink-0 mt-0.5">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#22d3ee)]/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--iris,#22d3ee)]" />
              </span>
              IRIS
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {isLoading ? (
                  <span className="italic text-muted-foreground">IRIS is reading the mission…</span>
                ) : open ? (
                  brief
                ) : (
                  firstSentence
                )}
              </p>
              {!isLoading && open && (
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>Updated {stamp}</span>
                  <button
                    onClick={refresh}
                    disabled={isFetching}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-2.5 w-2.5 ${isFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Collapse IRIS brief" : "Expand IRIS brief"}
              className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function relativeStamp(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function missingMissionBrief() {
  return {
    brief: "Mission brief is unavailable. You may not have access to this mission, or it no longer exists.",
    generated_at: new Date().toISOString(),
    cached: false,
    error: "mission_not_found" as const,
  };
}
