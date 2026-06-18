/**
 * Admin-only "Map Story Structure" button. Runs the IRIS narrative mapping
 * engine: every question gets a primary/secondary win theme, evaluator
 * fear, and narrative role. Shown when the mission is active, the caller
 * has the admin role, and there is at least one question to map.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Map as MapIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mapNarrativeStructure } from "@/lib/oracle/map-narrative-structure.functions";

const GOLD = "#C9972B";

export function MapNarrativeCard({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const mapFn = useServerFn(mapNarrativeStructure);

  const { data: gate } = useQuery({
    queryKey: ["map-narrative-gate", missionId],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return { show: false };
      const [{ data: roles }, { data: mission }, { count: qCount }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.user.id)
          .eq("role", "admin"),
        supabase.from("missions").select("status").eq("id", missionId).maybeSingle(),
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .eq("is_withdrawn", false),
      ]);
      const isAdmin = (roles?.length ?? 0) > 0;
      const isActive = mission?.status === "active";
      return { show: isAdmin && isActive && (qCount ?? 0) > 0 };
    },
  });

  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<null | {
    mapped: number;
    failed: number;
    skipped: number;
    edgesCreated: number;
    winThemeDistribution: Record<string, number>;
    message?: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setSummary(null);
    try {
      const res = await mapFn({ data: { missionId, force: true } });
      if (!res.ok) {
        setError(res.message ?? "Mapping failed");
      } else {
        setSummary(res);
        qc.invalidateQueries({ queryKey: ["map-narrative-gate", missionId] });
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!gate?.show) return null;

  return (
    <div
      className="mb-5 rounded-lg p-4"
      style={{
        background: "rgba(201,151,43,0.06)",
        border: `1px solid ${GOLD}`,
        color: "white",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <MapIcon className="h-5 w-5 mt-0.5 shrink-0" style={{ color: GOLD }} />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">Map Story Structure</p>
            <p className="text-[12.5px] opacity-70 mt-0.5">
              IRIS will tag every question with its win theme, evaluator fear, and
              narrative role — building one connected story across the proposal.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12.5px] font-semibold"
          style={{
            background: "transparent",
            color: GOLD,
            border: `1px solid ${GOLD}`,
            opacity: running ? 0.6 : 1,
          }}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "🗺"}
          {running ? "Mapping…" : "Map Story Structure"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-300 mt-0.5 shrink-0" />
          <p className="text-[12.5px] text-red-200">{error}</p>
        </div>
      )}

      {summary && (
        <div
          className="mt-3 rounded-md p-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: GOLD }}>
            <CheckCircle2 className="h-4 w-4" />
            {summary.message ??
              `Mapped ${summary.mapped} question${summary.mapped === 1 ? "" : "s"} · ${summary.edgesCreated} narrative edges · ${summary.failed} failed`}
          </div>
          {Object.keys(summary.winThemeDistribution).length > 0 && (
            <ul className="mt-2 space-y-1 text-[12px] text-white/80">
              {Object.entries(summary.winThemeDistribution)
                .sort((a, b) => b[1] - a[1])
                .map(([theme, count]) => (
                  <li key={theme} className="flex items-center justify-between gap-3">
                    <span className="truncate">{theme}</span>
                    <span style={{ color: GOLD }}>{count}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
