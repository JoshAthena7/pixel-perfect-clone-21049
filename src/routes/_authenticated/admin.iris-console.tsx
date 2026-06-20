/**
 * Standalone full-page IRIS Quick Intel Console.
 *
 * Admin-only. Mission selector across all active missions in the
 * left rail; panel on the right asks IRIS for the selected mission.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { IrisConsolePanel } from "@/components/iris-console/IrisConsolePanel";
import { Zap } from "lucide-react";

const GOLD = "#c9a84c";

export const Route = createFileRoute("/_authenticated/admin/iris-console")({
  component: AdminIrisConsolePage,
});

function AdminIrisConsolePage() {
  const [missionId, setMissionId] = useState<string | null>(null);

  const missionsQ = useQuery({
    queryKey: ["admin-iris-console-missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id,name,state_code,status,submission_deadline,metadata")
        .in("status", ["active", "in_progress", "draft"])
        .order("submission_deadline", { ascending: true, nullsFirst: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!missionId && missionsQ.data && missionsQ.data.length > 0) {
      setMissionId(missionsQ.data[0].id);
    }
  }, [missionId, missionsQ.data]);

  const missions = missionsQ.data ?? [];

  return (
    <div className="flex" style={{ background: "#01050b", color: "white", height: "calc(100vh - 88px)" }}>
      {/* Left rail */}
      <aside
        className="shrink-0 overflow-y-auto"
        style={{ width: 280, borderRight: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 9, color: GOLD, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'Courier New', monospace" }}>
            ⚡ IRIS Console
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            Active missions · {missions.length}
          </div>
        </div>
        {missionsQ.isLoading && (
          <div className="p-4" style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>Loading missions…</div>
        )}
        {!missionsQ.isLoading && missions.length === 0 && (
          <div className="p-4" style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>No active missions.</div>
        )}
        <ul>
          {missions.map((m: any) => {
            const active = m.id === missionId;
            const code = m?.metadata?.short_code ?? m.state_code ?? m.name?.split(" ")[0];
            const days = m.submission_deadline
              ? Math.ceil((new Date(m.submission_deadline).getTime() - Date.now()) / 86_400_000)
              : null;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setMissionId(m.id)}
                  className="w-full text-left px-4 py-2.5 flex flex-col gap-0.5"
                  style={{
                    background: active ? "rgba(201,168,76,0.08)" : "transparent",
                    borderLeft: active ? `2px solid ${GOLD}` : "2px solid transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    cursor: "pointer", color: "white",
                  }}
                >
                  <span style={{ fontSize: 11, color: active ? GOLD : "white", fontWeight: active ? 600 : 400 }}>
                    {m.name}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "'Courier New', monospace" }}>
                    {code}{days != null ? `  ·  ${days}d to submit` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right panel */}
      <main className="flex-1 min-w-0">
        {missionId ? (
          <IrisConsolePanel missionId={missionId} fullScreen />
        ) : (
          <div className="h-full flex flex-col items-center justify-center" style={{ color: "rgba(255,255,255,0.4)" }}>
            <Zap size={28} style={{ color: GOLD, marginBottom: 12 }} />
            <div style={{ fontSize: 12 }}>Select a mission to begin.</div>
          </div>
        )}
      </main>
    </div>
  );
}
