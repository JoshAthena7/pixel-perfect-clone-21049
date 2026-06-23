import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MissionRadar } from "@/components/mission-radar/MissionRadar";
import { generateMissionRadar } from "@/lib/mission-radar-generator.functions";

export const Route = createFileRoute("/_authenticated/missions/$missionId/radar")({
  head: () => ({ meta: [{ title: "Mission Radar — ATLAS" }] }),
  component: RadarPage,
  errorComponent: ({ error }) => (
    <div className="p-8" style={{ color: "rgba(255,255,255,0.7)" }}>
      Radar failed to load: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8" style={{ color: "rgba(255,255,255,0.7)" }}>Mission not found.</div>
  ),
});

function RadarPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();
  const regen = useServerFn(generateMissionRadar);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onRegenerate() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await regen({ data: { missionId } });
      setMsg(`Generated ${res.inserted} signals.`);
      await qc.invalidateQueries({ queryKey: ["mission-radar", missionId] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to regenerate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: "oklch(0.18 0.02 250)" }}>
      <div className="flex items-center justify-end gap-3 px-6 pt-4">
        {msg && (
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{msg}</span>
        )}
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{
            background: "oklch(0.28 0.04 250)",
            color: "white",
            border: "1px solid oklch(0.40 0.04 250 / 0.5)",
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          {busy ? "Generating…" : "Regenerate radar"}
        </button>
      </div>
      <Suspense
        fallback={
          <div className="p-8" style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
            Loading radar…
          </div>
        }
      >
        <MissionRadar missionId={missionId} />
      </Suspense>
    </div>
  );
}
