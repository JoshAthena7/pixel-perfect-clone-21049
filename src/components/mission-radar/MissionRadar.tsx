import { useMemo } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMissionRadar, type RadarCategory, type RadarSignal, type MissionRadarData } from "@/lib/mission-radar.functions";

const CATEGORIES: { key: RadarCategory; label: string; angle: number; color: string }[] = [
  { key: "risk",          label: "Risks",         angle: -90, color: "oklch(0.62 0.22 25)" },
  { key: "opportunity",   label: "Opportunities", angle: -38, color: "oklch(0.70 0.18 145)" },
  { key: "intelligence",  label: "Intel",         angle:  14, color: "oklch(0.68 0.16 230)" },
  { key: "readiness",     label: "Readiness",     angle:  66, color: "oklch(0.78 0.16 75)" },
  { key: "stakeholder",   label: "Stakeholders",  angle: 118, color: "oklch(0.60 0.18 300)" },
  { key: "competitive",   label: "Competitive",   angle: 170, color: "oklch(0.68 0.18 45)" },
  { key: "schedule",      label: "Schedule",      angle: 222, color: "oklch(0.70 0.14 200)" },
];

const RING_RADIUS = { inner: 90, mid: 165, outer: 235 };
const SIZE = 560;
const CENTER = SIZE / 2;

function polar(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CENTER + Math.cos(a) * radius, y: CENTER + Math.sin(a) * radius };
}

function severityRadius(sev: RadarSignal["severity"]) {
  return sev === "critical" ? 7 : sev === "high" ? 6 : sev === "medium" ? 5 : 4;
}
function severityOpacity(sev: RadarSignal["severity"]) {
  return sev === "critical" ? 1 : sev === "high" ? 0.9 : sev === "medium" ? 0.75 : 0.45;
}

export function MissionRadar({ missionId }: { missionId: string }) {
  const fetchRadar = useServerFn(getMissionRadar);
  const opts = useMemo(
    () =>
      queryOptions({
        queryKey: ["mission-radar", missionId],
        queryFn: () => fetchRadar({ data: { missionId } }) as Promise<MissionRadarData>,
        staleTime: 30_000,
      }),
    [fetchRadar, missionId],
  );
  const { data } = useSuspenseQuery(opts);

  const signalsByCategory = useMemo(() => {
    const groups = new Map<RadarCategory, RadarSignal[]>();
    for (const s of data.signals) {
      const arr = groups.get(s.category) ?? [];
      arr.push(s);
      groups.set(s.category, arr);
    }
    return groups;
  }, [data.signals]);

  return (
    <div className="min-h-[calc(100vh-200px)] px-6 py-6" style={{ background: "oklch(0.18 0.02 250)" }}>
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Mission Radar
            </div>
            <div style={{ color: "white", fontSize: 22, fontWeight: 600, marginTop: 2 }}>{data.northStar.title}</div>
          </div>
          <div className="flex items-center gap-6">
            <Metric label="Win probability" value={data.northStar.winProbability != null ? `${data.northStar.winProbability}%` : "—"} accent="oklch(0.95 0.12 95)" />
            <Metric label="Critical" value={String(data.counts.critical)} accent="oklch(0.62 0.22 25)" />
            <Metric label="High" value={String(data.counts.high)} accent="oklch(0.78 0.16 75)" />
            <Metric label="Total" value={String(data.signals.length)} accent="rgba(255,255,255,0.85)" />
          </div>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
          {/* Radar SVG */}
          <div
            className="rounded-xl flex items-center justify-center p-4"
            style={{ background: "oklch(0.20 0.02 250)", border: "1px solid oklch(0.32 0.02 250 / 0.4)" }}
          >
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", maxWidth: 640, height: "auto" }}>
              {/* Rings */}
              {(["outer", "mid", "inner"] as const).map((ring) => (
                <circle
                  key={ring}
                  cx={CENTER}
                  cy={CENTER}
                  r={RING_RADIUS[ring]}
                  fill="none"
                  stroke="oklch(0.32 0.02 250 / 0.45)"
                  strokeWidth={1}
                  strokeDasharray={ring === "inner" ? "0" : "3 4"}
                />
              ))}

              {/* Sector spokes & labels */}
              {CATEGORIES.map((cat) => {
                const end = polar(cat.angle, RING_RADIUS.outer + 20);
                const label = polar(cat.angle, RING_RADIUS.outer + 38);
                return (
                  <g key={cat.key}>
                    <line
                      x1={CENTER} y1={CENTER}
                      x2={end.x} y2={end.y}
                      stroke="oklch(0.32 0.02 250 / 0.3)"
                      strokeWidth={1}
                    />
                    <text
                      x={label.x} y={label.y}
                      fill={cat.color}
                      fontSize={10}
                      fontWeight={600}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ letterSpacing: 1, textTransform: "uppercase" }}
                    >
                      {cat.label}
                    </text>
                  </g>
                );
              })}

              {/* Signals */}
              {CATEGORIES.flatMap((cat) => {
                const sigs = signalsByCategory.get(cat.key) ?? [];
                const halfArc = 22; // degrees of jitter around spoke
                return sigs.map((sig, i) => {
                  const jitter = sigs.length > 1 ? -halfArc + (i / (sigs.length - 1)) * (halfArc * 2) : 0;
                  const r = RING_RADIUS[sig.ring];
                  const p = polar(cat.angle + jitter, r);
                  return (
                    <g key={sig.id}>
                      <title>{sig.headline}</title>
                      {sig.severity === "critical" && (
                        <circle cx={p.x} cy={p.y} r={severityRadius(sig.severity) + 6} fill={cat.color} opacity={0.18}>
                          <animate attributeName="r" values={`${severityRadius(sig.severity) + 6};${severityRadius(sig.severity) + 12};${severityRadius(sig.severity) + 6}`} dur="1.6s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.25;0.05;0.25" dur="1.6s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle
                        cx={p.x} cy={p.y}
                        r={severityRadius(sig.severity)}
                        fill={cat.color}
                        opacity={severityOpacity(sig.severity)}
                        stroke="oklch(0.10 0.02 250)"
                        strokeWidth={1}
                      />
                    </g>
                  );
                });
              })}

              {/* North Star */}
              <circle cx={CENTER} cy={CENTER} r={28} fill="oklch(0.22 0.04 95)" stroke="oklch(0.95 0.12 95)" strokeWidth={1.5} />
              <text x={CENTER} y={CENTER - 2} fill="oklch(0.95 0.12 95)" fontSize={11} fontWeight={700} textAnchor="middle">
                ★
              </text>
              <text x={CENTER} y={CENTER + 12} fill="oklch(0.95 0.12 95)" fontSize={9} textAnchor="middle" style={{ letterSpacing: 0.8 }}>
                {data.northStar.winProbability != null ? `${data.northStar.winProbability}%` : "NORTH STAR"}
              </text>
            </svg>
          </div>

          {/* Top signals list */}
          <div
            className="rounded-xl p-4"
            style={{ background: "oklch(0.20 0.02 250)", border: "1px solid oklch(0.32 0.02 250 / 0.4)" }}
          >
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
              Top signals
            </div>
            {data.signals.length === 0 ? (
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
                No radar signals yet. IRIS will populate as it scans this mission.
              </div>
            ) : (
              <ul className="space-y-3">
                {data.signals.slice(0, 12).map((s) => {
                  const cat = CATEGORIES.find((c) => c.key === s.category)!;
                  return (
                    <li key={s.id} className="flex gap-3 items-start">
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: 999, background: cat.color,
                          marginTop: 6, flexShrink: 0, opacity: severityOpacity(s.severity),
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span style={{ color: cat.color, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                            {s.severity}
                          </span>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                            {cat.label} · {s.ring}
                          </span>
                        </div>
                        <div style={{ color: "white", fontSize: 13, marginTop: 2, lineHeight: 1.35 }}>
                          {s.headline}
                        </div>
                        {s.iris_rationale && (
                          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>
                            {s.iris_rationale}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="text-right">
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: accent, fontSize: 18, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
