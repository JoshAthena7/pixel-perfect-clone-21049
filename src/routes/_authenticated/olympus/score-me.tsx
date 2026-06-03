import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/olympus/score-me")({
  component: OlympusScoreMePage,
});

const SELECTED_KEY = "olympus:mission";

type Mission = { id: string; name: string; client: string };

function OlympusScoreMePage() {
  const [missionId, setMissionId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_KEY) : null,
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onChange = (e: any) => setMissionId(e.detail);
    window.addEventListener("olympus:mission-changed", onChange);
    return () => window.removeEventListener("olympus:mission-changed", onChange);
  }, []);

  const { data: mission } = useQuery({
    queryKey: ["olympus-score-me-mission", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state")
        .eq("id", missionId!)
        .maybeSingle();
      return (data ?? null) as (Mission & { state: string | null }) | null;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["olympus-score-me-history", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("score_me_history")
        .select("id,question_id,score,projected_score,created_at,scored_by")
        .eq("mission_id", missionId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: "var(--iris, #22d3ee)" }}>
        <Sparkles className="h-3 w-3" /> Score Me
      </div>
      <h1 className="mt-2 text-2xl font-semibold">IRIS Response Scoring</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Run scoring sessions on past responses, training exercises, or competitive analysis. Paste any response and IRIS scores it against the active mission's RFP criteria.
      </p>

      <div className="mt-6 rounded-[12px] border border-white/10 bg-card px-6 py-5">
        <div className="text-xs text-muted-foreground">Active mission</div>
        <div className="mt-1 text-base font-semibold">{mission?.name ?? "No mission selected"}</div>
        {mission?.client && <div className="text-xs text-muted-foreground">{mission.client}{mission.state ? ` · ${mission.state}` : ""}</div>}
        <button
          onClick={() => setOpen(true)}
          disabled={!missionId}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--iris, #22d3ee)" }}
        >
          Score a Response →
        </button>
      </div>

      <div className="mt-10">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground mb-3">Recent Score Sessions</h2>
        {history.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No scoring sessions yet for this mission.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {history.map((row: any) => (
              <li key={row.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-9 w-12 items-center justify-center rounded-md text-sm font-bold tabular-nums"
                    style={{
                      background: row.score >= 4.5 ? "rgba(34,197,94,0.15)" : row.score >= 4.0 ? "rgba(255,255,255,0.05)" : row.score >= 3.0 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                      color: row.score >= 4.5 ? "rgb(34,197,94)" : row.score >= 4.0 ? "var(--foreground)" : row.score >= 3.0 ? "rgb(245,158,11)" : "rgb(239,68,68)",
                    }}
                  >
                    {Number(row.score).toFixed(1)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm">Projected after changes: <span className="font-semibold">{Number(row.projected_score ?? row.score).toFixed(1)}</span></div>
                    <div className="text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleString()}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {missionId && (
        <ScoreMeOverlay open={open} onClose={() => setOpen(false)} missionId={missionId} />
      )}
    </div>
  );
}
