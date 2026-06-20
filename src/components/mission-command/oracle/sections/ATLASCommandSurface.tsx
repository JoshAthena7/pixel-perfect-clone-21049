import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ============================================================================
 * ORACLE INTELLIGENCE TERRAIN
 * A unified topographic visualization of the mission's intelligence landscape.
 * SVG + CSS only. No canvas, no libraries.
 * ========================================================================== */

type Signal = {
  id: string;
  title: string;
  category: string;
  status?: string;
  tier?: string | null;
  relevance_score?: number | null;
  urgency_level?: string | null;
  urgency?: string | null;
  topic_tags?: string[] | null;
  what_happened?: string | null;
  why_it_matters?: string | null;
  recommended_action?: string | null;
  source_name?: string | null;
  published_at?: string | null;
  created_at?: string | null;
};

const GOLD = "196,154,43";

const CATEGORY_STYLES: Record<
  string,
  { color: string; rgb: string; label: string; abbr: string; zone: { cx: number; cy: number } }
> = {
  regulatory_federal: {
    color: "#60A5FA", rgb: "96,165,250", label: "REGULATORY · FEDERAL", abbr: "REG_F",
    zone: { cx: 0.12, cy: 0.22 },
  },
  regulatory_state: {
    color: "#34D399", rgb: "52,211,153", label: "REGULATORY · STATE", abbr: "REG_S",
    zone: { cx: 0.20, cy: 0.68 },
  },
  quality_performance: {
    color: "#A78BFA", rgb: "167,139,250", label: "QUALITY · PERFORMANCE", abbr: "QUAL",
    zone: { cx: 0.38, cy: 0.18 },
  },
  health_outcomes_sdoh: {
    color: "#F472B6", rgb: "244,114,182", label: "HEALTH · SDOH", abbr: "SDOH",
    zone: { cx: 0.35, cy: 0.78 },
  },
  policy_innovation: {
    color: "#38BDF8", rgb: "56,189,248", label: "POLICY · INNOVATION", abbr: "POLI",
    zone: { cx: 0.55, cy: 0.28 },
  },
  evidence_base: {
    color: "#FB923C", rgb: "251,146,60", label: "EVIDENCE BASE", abbr: "EVID",
    zone: { cx: 0.52, cy: 0.72 },
  },
  field_intelligence: {
    color: "#FACC15", rgb: "250,204,21", label: "FIELD INTELLIGENCE", abbr: "FIELD",
    zone: { cx: 0.72, cy: 0.22 },
  },
  competitive_landscape: {
    color: "#F87171", rgb: "248,113,113", label: "COMPETITIVE", abbr: "COMP",
    zone: { cx: 0.78, cy: 0.72 },
  },
  client_content_map: {
    color: "#E5E7EB", rgb: "229,231,235", label: "CLIENT CONTENT MAP", abbr: "CCM",
    zone: { cx: 0.88, cy: 0.45 },
  },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_STYLES);
const FALLBACK_STYLE = CATEGORY_STYLES.client_content_map;

function styleFor(cat: string) {
  return CATEGORY_STYLES[cat] ?? FALLBACK_STYLE;
}

/* ----------------------------- deterministic hash ----------------------- */
function hashCode(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
function hashFloat(s: string, salt = ""): number {
  return (hashCode(s + salt) % 100000) / 100000;
}

function relevanceFor(s: Signal): number {
  if (typeof s.relevance_score === "number")
    return Math.max(0, Math.min(100, s.relevance_score));
  return 45 + Math.floor(hashFloat(s.id, "rel") * 50);
}
function urgencyFor(s: Signal): "immediate" | "high" | "normal" | "low" {
  const u = (s.urgency_level ?? s.urgency ?? "").toLowerCase();
  if (u === "immediate" || u === "high" || u === "normal" || u === "low") return u as any;
  const r = relevanceFor(s);
  if (r >= 90) return "immediate";
  if (r >= 75) return "high";
  if (r >= 55) return "normal";
  return "low";
}

function getSignalPosition(signal: Signal, width: number, height: number) {
  const style = styleFor(signal.category);
  const zone = style.zone;
  const h1 = hashFloat(signal.id, "x");
  const h2 = hashFloat(signal.id, "y");
  const rel = relevanceFor(signal);
  const jitterRadius = (1 - rel / 100) * 0.18 + 0.04;
  const angle = h1 * Math.PI * 2;
  const x = (zone.cx + Math.cos(angle) * jitterRadius + (h2 - 0.5) * 0.04) * width;
  const y = (zone.cy + Math.sin(angle) * jitterRadius + (h1 - 0.5) * 0.03) * height;
  return {
    x: Math.max(20, Math.min(width - 20, x)),
    y: Math.max(20, Math.min(height - 20, y)),
  };
}

function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ============================================================================
 * Header rotating status
 * ========================================================================== */
function HeaderStatus({
  signalCount, coverage, gapCount, momentum, writerCount,
}: {
  signalCount: number; coverage: number; gapCount: number; momentum: number; writerCount: number;
}) {
  const messages = useMemo(
    () => [
      `SCANNING · ${signalCount} SIGNALS ACTIVE`,
      `PROCESSING · PIPELINE NOMINAL`,
      `COVERAGE · ${coverage}% · ${gapCount} TAXONOMY GAPS`,
      `MOMENTUM · ${momentum} · ${writerCount} WRITERS`,
    ],
    [signalCount, coverage, gapCount, momentum, writerCount],
  );
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const t = setInterval(() => {
      setPhase("out");
      setTimeout(() => {
        setIdx((i) => (i + 1) % messages.length);
        setPhase("in");
      }, 200);
    }, 6000);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div className="relative h-[14px] overflow-hidden" style={{ width: 360 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "rgba(255,255,255,0.65)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          textTransform: "uppercase",
          textAlign: "center",
          transform: phase === "in" ? "translateY(0)" : "translateY(-100%)",
          opacity: phase === "in" ? 1 : 0,
          transition: "transform 200ms ease, opacity 200ms ease",
        }}
      >
        {messages[idx]}
      </div>
    </div>
  );
}

/* ============================================================================
 * Main component
 * ========================================================================== */
function ATLASCommandSurfaceInner({
  missionId,
  signals,
}: {
  missionId: string;
  signals: Signal[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const HEADER_H = 32;
  const LEDGER_H = 86;
  const TOTAL_H = 540;
  const TERRAIN_H = TOTAL_H - HEADER_H - LEDGER_H; // pure terrain above the ledger

  // ResizeObserver — never render at 0
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* -------------------- mission meta (clock + writers) ------------------ */
  const { data: missionMeta } = useQuery({
    queryKey: ["atlas-mission-meta", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, name, due_date, submission_deadline, created_at, momentum_score")
        .eq("id", missionId)
        .maybeSingle();
      return data as any;
    },
    staleTime: 60_000,
  });

  const { data: writerCount = 0 } = useQuery({
    queryKey: ["atlas-writer-count", missionId],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("mission_members")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  /* -------------------- live clock --------------------------------------- */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const clockTxt = useMemo(() => {
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }, [now]);

  /* -------------------- derived intelligence shape ---------------------- */
  const positionedSignals = useMemo(() => {
    if (width < 100) return [];
    return signals.map((s, i) => ({
      signal: s,
      pos: getSignalPosition(s, width, TERRAIN_H),
      rel: relevanceFor(s),
      urg: urgencyFor(s),
      style: styleFor(s.category),
      idx: i,
    }));
  }, [signals, width, TERRAIN_H]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of signals) m.set(s.category, (m.get(s.category) ?? 0) + 1);
    return m;
  }, [signals]);

  const gapCategories = useMemo(
    () => CATEGORY_KEYS.filter((k) => (categoryCounts.get(k) ?? 0) === 0),
    [categoryCounts],
  );

  const connections = useMemo(() => {
    if (positionedSignals.length < 2) return [] as Array<{
      a: { x: number; y: number }; b: { x: number; y: number };
      shared: number; color: string; key: string;
    }>;
    const pairs: Array<{
      a: { x: number; y: number }; b: { x: number; y: number };
      shared: number; color: string; key: string;
    }> = [];
    for (let i = 0; i < positionedSignals.length; i++) {
      const A = positionedSignals[i];
      const tagsA = new Set(A.signal.topic_tags ?? []);
      if (tagsA.size === 0) continue;
      for (let j = i + 1; j < positionedSignals.length; j++) {
        const B = positionedSignals[j];
        const tagsB = B.signal.topic_tags ?? [];
        let shared = 0;
        for (const t of tagsB) if (tagsA.has(t)) shared++;
        if (shared > 0) {
          pairs.push({
            a: A.pos, b: B.pos, shared,
            color: A.style.color,
            key: `${A.signal.id}-${B.signal.id}`,
          });
        }
      }
    }
    pairs.sort((x, y) => y.shared - x.shared);
    return pairs.slice(0, 60);
  }, [positionedSignals]);

  const topCategories = useMemo(() => {
    return Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [categoryCounts]);

  const maxCatCount = topCategories[0]?.[1] ?? 1;
  const coverage = Math.min(100, Math.round((signals.length / 50) * 100));
  const mostRecent = signals[0];
  const daysRemaining = useMemo(() => {
    if (!missionMeta?.due_date) return null;
    const ms = new Date(missionMeta.due_date).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }, [missionMeta]);
  const daysTotal = useMemo(() => {
    if (!missionMeta?.due_date || !missionMeta?.created_at) return null;
    const ms = new Date(missionMeta.due_date).getTime() - new Date(missionMeta.created_at).getTime();
    return Math.max(1, Math.ceil(ms / 86400000));
  }, [missionMeta]);
  const daysElapsed = daysTotal && daysRemaining != null ? daysTotal - daysRemaining : 0;
  const elapsedPct = daysTotal ? Math.min(100, Math.max(0, (daysElapsed / daysTotal) * 100)) : 0;

  /* -------------------- live pulses ------------------------------------- */
  type Pulse = { id: number; sigId: string; x: number; y: number; color: string; startedAt: number };
  const [pulses, setPulses] = useState<Pulse[]>([]);

  useEffect(() => {
    if (positionedSignals.length === 0) return;
    let alive = true;
    let timers: number[] = [];

    const fire = () => {
      if (!alive) return;
      const pick = positionedSignals[Math.floor(Math.random() * positionedSignals.length)];
      if (pick) {
        const p: Pulse = {
          id: Date.now() + Math.random(),
          sigId: pick.signal.id,
          x: pick.pos.x,
          y: pick.pos.y,
          color: pick.style.color,
          startedAt: Date.now(),
        };
        setPulses((prev) => [...prev.slice(-9), p]);
      }
      timers.push(window.setTimeout(fire, 2000 + Math.random() * 3000));
    };

    timers.push(window.setTimeout(fire, 500));
    timers.push(window.setTimeout(fire, 1800));
    timers.push(window.setTimeout(fire, 3200));

    const cleanup = window.setInterval(() => {
      setPulses((prev) => prev.filter((p) => Date.now() - p.startedAt < 1500));
    }, 2000);

    return () => {
      alive = false;
      timers.forEach((t) => clearTimeout(t));
      clearInterval(cleanup);
    };
  }, [positionedSignals]);

  /* -------------------- hover + selection ------------------------------- */
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const connectedToHover = useMemo(() => {
    if (!hoverId) return new Set<string>();
    const set = new Set<string>();
    for (const c of connections) {
      const [aId, bId] = c.key.split("-");
      if (aId === hoverId) set.add(bId);
      else if (bId === hoverId) set.add(aId);
    }
    return set;
  }, [hoverId, connections]);

  const selectedSignal = useMemo(
    () => signals.find((s) => s.id === selectedId) ?? null,
    [signals, selectedId],
  );

  const hoverSignal = useMemo(
    () => positionedSignals.find((p) => p.signal.id === hoverId) ?? null,
    [positionedSignals, hoverId],
  );

  /* ====================================================================== */
  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden mb-6"
      style={{ height: TOTAL_H, background: "#000308", border: `1px solid rgba(${GOLD},0.18)` }}
    >
      {/* scoped styles */}
      <style>{`
        @keyframes terrain-breathe-aura {
          0%   { stroke-opacity: 0.06; }
          100% { stroke-opacity: 0.22; }
        }
        @keyframes terrain-urgency-pulse {
          0%   { stroke-opacity: 0.65; r: var(--ring-r1, 10); }
          100% { stroke-opacity: 0;    r: var(--ring-r2, 22); }
        }
        @keyframes terrain-appear {
          from { opacity: 0; transform: scale(0.3); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes terrain-broadcast-1 {
          0%   { transform: scale(0.4); opacity: 0.55; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes terrain-broadcast-2 {
          0%   { transform: scale(0.4); opacity: 0.35; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        @keyframes terrain-sweep-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes terrain-detail-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes terrain-live-dot {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
        .terrain-scanlines {
          background-image: repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 3px,
            rgba(255,255,255,0.01) 3px,
            rgba(255,255,255,0.01) 4px
          );
        }
      `}</style>

      {/* scanlines + vignette */}
      <div className="absolute inset-0 pointer-events-none terrain-scanlines" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* corner brackets */}
      {([
        { t: 6, l: 6, rot: 0 },
        { t: 6, r: 6, rot: 90 },
        { b: 6, r: 6, rot: 180 },
        { b: 6, l: 6, rot: 270 },
      ] as any[]).map((c, i) => (
        <svg
          key={i}
          width="28" height="28"
          className="absolute pointer-events-none"
          style={{
            top: c.t, left: c.l, right: c.r, bottom: c.b,
            transform: `rotate(${c.rot}deg)`,
          }}
        >
          <path
            d="M 0 0 L 28 0 M 0 0 L 0 28"
            stroke={`rgba(${GOLD},0.35)`}
            strokeWidth="0.5"
            fill="none"
          />
        </svg>
      ))}

      {/* ============ HEADER ============ */}
      <div
        className="relative flex items-center justify-between px-4"
        style={{
          height: HEADER_H,
          background: "rgba(0,0,0,0.7)",
          borderBottom: `1px solid rgba(${GOLD},0.12)`,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="relative" style={{ width: 14, height: 14 }}>
            <div
              className="absolute inset-0 m-auto rounded-full"
              style={{
                width: 5, height: 5, top: 0, left: 0, right: 0, bottom: 0,
                background: "rgba(74,222,128,1)",
                boxShadow: "0 0 6px rgba(74,222,128,0.7)",
                animation: "terrain-live-dot 2s ease-in-out infinite",
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: 9, height: 9, top: 2.5, left: 2.5,
                background: "rgba(74,222,128,0.25)",
                animation: "terrain-broadcast-1 2s ease-out infinite",
                transformOrigin: "center",
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: 13, height: 13, top: 0.5, left: 0.5,
                background: "rgba(74,222,128,0.12)",
                animation: "terrain-broadcast-2 3s ease-out infinite 0.5s",
                transformOrigin: "center",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 8,
              letterSpacing: "0.18em",
              color: `rgba(${GOLD},0.8)`,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              textTransform: "uppercase",
            }}
          >
            ◈ ORACLE INTELLIGENCE TERRAIN
          </span>
        </div>

        <HeaderStatus
          signalCount={signals.length}
          coverage={coverage}
          gapCount={gapCategories.length}
          momentum={Math.round(missionMeta?.momentum_score ?? 0)}
          writerCount={writerCount}
        />

        <div className="flex items-center gap-3">
          <span
            style={{
              fontSize: 8,
              letterSpacing: "0.12em",
              color: `rgba(${GOLD},0.5)`,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            {clockTxt}
          </span>
          <span
            style={{
              fontSize: 7,
              letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.3)",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            {signals.length} SIGNALS ACTIVE
          </span>
        </div>
      </div>

      {/* ============ TERRAIN ============ */}
      <div className="relative" style={{ height: TERRAIN_H, width: "100%" }}>
        {width < 100 ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              fontSize: 10,
              color: `rgba(${GOLD},0.35)`,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              letterSpacing: "0.18em",
            }}
          >
            INITIALIZING TERRAIN…
          </div>
        ) : (
          <>
            {/* slow sweep line (CSS rotate) */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: width / 2,
                top: TERRAIN_H * 0.45,
                width: 0,
                height: 0,
                animation: "terrain-sweep-rotate 120s linear infinite",
                transformOrigin: "0 0",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: width * 0.6,
                  height: 0.5,
                  background: `rgba(${GOLD},0.15)`,
                  transformOrigin: "0 0",
                }}
              />
            </div>

            <svg
              width={width}
              height={TERRAIN_H}
              style={{ display: "block", position: "absolute", inset: 0 }}
            >
              <defs>
                {CATEGORY_KEYS.map((k) => {
                  const st = styleFor(k);
                  return (
                    <radialGradient
                      key={`heat-${k}`}
                      id={`terrain-heat-${k}`}
                      cx="50%" cy="50%" r="50%"
                    >
                      <stop offset="0%" stopColor={st.color} stopOpacity="0.14" />
                      <stop offset="40%" stopColor={st.color} stopOpacity="0.04" />
                      <stop offset="100%" stopColor={st.color} stopOpacity="0" />
                    </radialGradient>
                  );
                })}
              </defs>

              {/* Layer 2 — heat zones */}
              {CATEGORY_KEYS.map((k) => {
                const count = categoryCounts.get(k) ?? 0;
                if (count === 0) return null;
                const st = styleFor(k);
                const r = 80 + count * 12;
                return (
                  <circle
                    key={`heat-${k}`}
                    cx={st.zone.cx * width}
                    cy={st.zone.cy * TERRAIN_H}
                    r={r}
                    fill={`url(#terrain-heat-${k})`}
                  />
                );
              })}

              {/* Layer 3 — gap cold zones */}
              {gapCategories.map((k) => {
                const st = styleFor(k);
                return (
                  <circle
                    key={`gap-${k}`}
                    cx={st.zone.cx * width}
                    cy={st.zone.cy * TERRAIN_H}
                    r={40}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="0.5"
                    strokeDasharray="3 6"
                  />
                );
              })}

              {/* Layer 7 — strategic relevance threshold */}
              <line
                x1={0}
                y1={TERRAIN_H * 0.5}
                x2={width}
                y2={TERRAIN_H * 0.5}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="0.5"
              />
              <text
                x={width - 10}
                y={TERRAIN_H * 0.5 - 4}
                fill="rgba(255,255,255,0.18)"
                fontSize="6"
                fontFamily="ui-monospace, monospace"
                letterSpacing="0.18em"
                textAnchor="end"
              >
                STRATEGIC RELEVANCE THRESHOLD
              </text>

              {/* Layer 4 — connection web */}
              {connections.map((c) => {
                const [aId, bId] = c.key.split("-");
                const dim =
                  hoverId &&
                  hoverId !== aId &&
                  hoverId !== bId;
                const bright =
                  hoverId && (hoverId === aId || hoverId === bId);
                const baseOp = 0.04 + c.shared * 0.04;
                const op = dim ? 0.03 : bright ? 0.4 : baseOp;
                return (
                  <line
                    key={c.key}
                    x1={c.a.x} y1={c.a.y}
                    x2={c.b.x} y2={c.b.y}
                    stroke={c.color}
                    strokeOpacity={op}
                    strokeWidth={0.3 + c.shared * 0.15}
                    style={{ transition: "stroke-opacity 150ms ease" }}
                  />
                );
              })}

              {/* Layer 6 — category zone labels */}
              {CATEGORY_KEYS.map((k) => {
                const count = categoryCounts.get(k) ?? 0;
                if (count === 0) return null;
                const st = styleFor(k);
                return (
                  <g
                    key={`lbl-${k}`}
                    transform={`translate(${st.zone.cx * width - 30}, ${st.zone.cy * TERRAIN_H + 50})`}
                  >
                    <text
                      x={0} y={0}
                      fill="rgba(255,255,255,0.28)"
                      fontSize="7"
                      fontFamily="ui-monospace, monospace"
                      letterSpacing="0.16em"
                    >
                      {st.label}
                    </text>
                    <text
                      x={0} y={11}
                      fill={st.color}
                      fontSize="9"
                      fontWeight="600"
                      fontFamily="ui-monospace, monospace"
                    >
                      {count} signal{count === 1 ? "" : "s"}
                    </text>
                  </g>
                );
              })}

              {/* Layer 5 — signal nodes */}
              {positionedSignals.map((p) => {
                const baseR = 4 + ((p.rel - 40) / 60) * 9;
                const r = Math.max(3, Math.min(13, baseR));
                const isHover = hoverId === p.signal.id;
                const isSelected = selectedId === p.signal.id;
                const dim =
                  hoverId &&
                  hoverId !== p.signal.id &&
                  !connectedToHover.has(p.signal.id);
                const groupOpacity = dim ? 0.2 : 1;
                return (
                  <g
                    key={p.signal.id}
                    style={{
                      transition: "opacity 150ms ease, transform 150ms ease",
                      opacity: groupOpacity,
                      transform: `translate(${p.pos.x}px, ${p.pos.y}px) scale(${isHover || isSelected ? 1.3 : 1})`,
                      transformOrigin: "center",
                      animation: `terrain-appear 0.35s ease-out both`,
                      animationDelay: `${p.idx * 0.04}s`,
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setHoverId(p.signal.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => setSelectedId(p.signal.id)}
                  >
                    {/* aura */}
                    <circle
                      r={r + 8}
                      fill="none"
                      stroke={p.style.color}
                      strokeOpacity="0.12"
                      style={{
                        animation: `terrain-breathe-aura ${2.5 + hashFloat(p.signal.id, "a") * 2.5}s ease-in-out infinite alternate`,
                      }}
                    />
                    {/* main */}
                    <circle
                      r={r}
                      fill={p.style.color}
                      fillOpacity={0.7 + (p.rel / 100) * 0.3}
                    />
                    {/* urgency ring */}
                    {(p.urg === "immediate" || p.urg === "high") && (
                      <circle
                        r={r + 3}
                        fill="none"
                        stroke={p.style.color}
                        strokeWidth="1"
                        strokeOpacity="0.6"
                        style={
                          {
                            animation: `terrain-urgency-pulse 1.4s ease-out infinite`,
                            ["--ring-r1" as any]: `${r + 3}px`,
                            ["--ring-r2" as any]: `${r + 16}px`,
                          } as any
                        }
                      />
                    )}
                  </g>
                );
              })}

              {/* Layer 8 — live pulses */}
              {pulses.map((p) => (
                <circle
                  key={p.id}
                  cx={p.x} cy={p.y}
                  r={6}
                  fill="none"
                  stroke={p.color}
                  strokeWidth="1"
                  style={
                    {
                      animation: "terrain-urgency-pulse 1.2s ease-out forwards",
                      ["--ring-r1" as any]: "6px",
                      ["--ring-r2" as any]: "46px",
                    } as any
                  }
                />
              ))}
            </svg>

            {/* empty state */}
            {signals.length === 0 && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
              >
                <div style={{ fontSize: 11, letterSpacing: "0.22em", color: `rgba(${GOLD},0.3)` }}>
                  NO SIGNALS DETECTED
                </div>
                <div style={{ fontSize: 8, letterSpacing: "0.22em", color: `rgba(${GOLD},0.15)`, marginTop: 6 }}>
                  ORACLE IS SCANNING
                </div>
              </div>
            )}

            {/* hover tooltip */}
            {hoverSignal && !selectedId && (
              <HoverTooltip
                signal={hoverSignal.signal}
                rel={hoverSignal.rel}
                style={hoverSignal.style}
                x={hoverSignal.pos.x}
                y={hoverSignal.pos.y}
                width={width}
                height={TERRAIN_H}
              />
            )}

            {/* detail card */}
            {selectedSignal && (
              <DetailCard
                signal={selectedSignal}
                onClose={() => setSelectedId(null)}
              />
            )}
          </>
        )}
      </div>

      {/* ============ LEDGER ============ */}
      <div
        className="relative grid w-full"
        style={{
          height: LEDGER_H,
          gridTemplateColumns: "minmax(150px, 1.05fr) minmax(190px, 1.35fr) minmax(150px, 1fr) minmax(180px, 1.25fr) minmax(160px, 1.1fr)",
          background: "rgba(0,0,0,0.8)",
          borderTop: `1px solid rgba(${GOLD},0.12)`,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}
      >
        {/* col 1: mission pulse */}
        <div className="px-4 py-2 flex flex-col justify-center" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", color: `rgba(${GOLD},0.7)`, whiteSpace: "nowrap" }}>
            {(() => {
              const name = missionMeta?.name as string | undefined;
              if (name) {
                const code = name.split(/[\s-]+/)[0]?.trim();
                if (code && code.length <= 12) return `MISSION ${code.toUpperCase()}`;
                return `MISSION ${name.slice(0, 12).toUpperCase()}`;
              }
              return "MISSION";
            })()}
          </div>
          <div style={{ fontSize: 14, fontWeight: 300, color: "white", marginTop: 4 }}>
            {(() => {
              if (daysRemaining != null) return `${daysRemaining} DAYS REMAINING`;
              const sub = (missionMeta as any)?.submission_deadline || (missionMeta as any)?.due_date;
              if (sub) {
                const d = new Date(sub);
                const m = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()];
                return `DUE ${m} ${d.getDate()}, ${d.getFullYear()}`;
              }
              return "NO DUE DATE";
            })()}
          </div>
          <div className="mt-1.5 h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full" style={{ width: `${elapsedPct}%`, background: `rgba(${GOLD},0.55)` }} />
          </div>
        </div>

        {/* col 2: signal density */}
        <div className="px-4 py-2 flex flex-col justify-center" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
            INTELLIGENCE DENSITY
          </div>
          <div className="mt-1.5 flex flex-col gap-[3px]">
            {topCategories.length === 0 && (
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>—</div>
            )}
            {topCategories.map(([k, n]) => {
              const st = styleFor(k);
              const pct = (n / maxCatCount) * 100;
              return (
                <div key={k} className="flex items-center gap-1.5">
                  <div style={{ fontSize: 6.5, color: "rgba(255,255,255,0.55)", width: 32, letterSpacing: "0.08em" }}>
                    {st.abbr}
                  </div>
                  <div className="flex-1 h-[3px] bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${pct}%`, background: st.color, opacity: 0.85 }} />
                  </div>
                  <div style={{ fontSize: 6.5, color: st.color, width: 14, textAlign: "right" }}>{n}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* col 3: coverage */}
        <div className="px-4 py-2 flex flex-col justify-center" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
            ORACLE COVERAGE
          </div>
          <div style={{ fontSize: 22, fontWeight: 200, color: "white", lineHeight: 1, marginTop: 4 }}>
            {coverage}%
          </div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {signals.length} OF ~50 KEY ITEMS
          </div>
        </div>

        {/* col 4: gaps */}
        <div className="px-4 py-2 flex flex-col justify-center" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 7, letterSpacing: "0.18em", color: "rgba(248,113,113,0.7)", whiteSpace: "nowrap" }}>
            KNOWLEDGE GAPS
          </div>
          <div style={{ fontSize: 14, fontWeight: 300, color: "white", marginTop: 4 }}>
            {gapCategories.length} GAPS DETECTED
          </div>
          <div className="mt-1 flex flex-col gap-[2px]">
            {gapCategories.slice(0, 2).map((k) => (
              <div key={k} className="flex items-center gap-1.5">
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(248,113,113,0.7)" }} />
                <div style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em" }}>
                  {styleFor(k).label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* col 5: system status */}
        <div className="px-4 py-2 flex flex-col justify-center">
          <div style={{ fontSize: 7, letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
            SYSTEM STATUS
          </div>
          <div style={{ fontSize: 10, color: "rgba(74,222,128,0.85)", marginTop: 4, fontWeight: 500, letterSpacing: "0.12em" }}>
            PIPELINE ACTIVE
          </div>
          <div style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            LAST SIGNAL: {relativeTime(mostRecent?.created_at ?? mostRecent?.published_at)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * Hover tooltip
 * ========================================================================== */
function HoverTooltip({
  signal, rel, style, x, y, width, height,
}: {
  signal: Signal;
  rel: number;
  style: { color: string; rgb: string; label: string };
  x: number; y: number; width: number; height: number;
}) {
  const TW = 240;
  const TH = 130;
  // place to avoid edges
  let left = x + 16;
  let top = y + 16;
  if (left + TW > width - 8) left = x - TW - 16;
  if (top + TH > height - 8) top = y - TH - 16;
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left, top, width: TW,
        background: "rgba(3,7,18,0.97)",
        border: `1px solid rgba(${style.rgb},0.6)`,
        borderRadius: 4,
        padding: 12,
        zIndex: 100,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          fontSize: 8,
          letterSpacing: "0.18em",
          color: style.color,
          textTransform: "uppercase",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {style.label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "white",
          marginTop: 6,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          lineHeight: 1.3,
        }}
      >
        {signal.title}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${rel}%`, background: style.color }}
          />
        </div>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)", letterSpacing: "0.08em", fontFamily: "ui-monospace, monospace" }}>
          REL {rel}
        </div>
      </div>
      {signal.why_it_matters && (
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.65)",
            marginTop: 8,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.4,
          }}
        >
          {signal.why_it_matters}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", fontFamily: "ui-monospace, monospace" }}>
          {signal.source_name ?? "—"}
        </div>
        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.35)", fontFamily: "ui-monospace, monospace" }}>
          {relativeTime(signal.published_at ?? signal.created_at)}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * Detail card (slides up)
 * ========================================================================== */
function DetailCard({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const st = styleFor(signal.category);
  const rel = relevanceFor(signal);
  return (
    <div
      className="absolute left-0 right-0 bottom-0"
      style={{
        height: "40%",
        background: "rgba(3,7,18,0.97)",
        borderTop: `1px solid rgba(${st.rgb},0.7)`,
        animation: "terrain-detail-up 280ms ease-out",
        zIndex: 50,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-white/50 hover:text-white"
        style={{ fontSize: 16, width: 22, height: 22, lineHeight: "20px" }}
        aria-label="Close"
      >
        ×
      </button>
      <div className="grid grid-cols-[1.3fr_1.6fr_1fr] gap-5 px-5 py-4 h-full overflow-hidden">
        {/* left */}
        <div className="min-w-0">
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "white",
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {signal.title}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span
              className="rounded-full px-2 py-[2px]"
              style={{
                fontSize: 9,
                background: `rgba(${st.rgb},0.14)`,
                color: st.color,
                border: `1px solid rgba(${st.rgb},0.35)`,
                letterSpacing: "0.1em",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {st.label}
            </span>
            {signal.tier && (
              <span
                className="rounded-full px-2 py-[2px]"
                style={{
                  fontSize: 9,
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.65)",
                  letterSpacing: "0.1em",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {String(signal.tier).toUpperCase()}
              </span>
            )}
            {(signal.urgency_level || signal.urgency) && (
              <span
                style={{
                  fontSize: 9,
                  color: "rgba(248,113,113,0.85)",
                  letterSpacing: "0.1em",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                ⚡ {String(signal.urgency_level ?? signal.urgency).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* center */}
        <div className="min-w-0 overflow-hidden">
          {signal.what_happened && (
            <div
              style={{
                fontSize: 12,
                color: "white",
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {signal.what_happened}
            </div>
          )}
          {signal.why_it_matters && (
            <div
              className="mt-2 italic"
              style={{
                fontSize: 11,
                color: st.color,
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {signal.why_it_matters}
            </div>
          )}
          {signal.recommended_action && (
            <div
              className="mt-2"
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              → {signal.recommended_action}
            </div>
          )}
        </div>

        {/* right */}
        <div className="min-w-0">
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", fontFamily: "ui-monospace, monospace" }}>
            {signal.source_name ?? "—"}
          </div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
            {relativeTime(signal.published_at ?? signal.created_at)}
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em", fontFamily: "ui-monospace, monospace" }}>
                RELEVANCE
              </div>
              <div style={{ fontSize: 9, color: st.color, fontFamily: "ui-monospace, monospace" }}>{rel}</div>
            </div>
            <div className="h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full" style={{ width: `${rel}%`, background: st.color }} />
            </div>
          </div>
          {Array.isArray(signal.topic_tags) && signal.topic_tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {signal.topic_tags.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="rounded-full"
                  style={{
                    fontSize: 8,
                    padding: "2px 6px",
                    background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ATLASCommandSurface = memo(ATLASCommandSurfaceInner);
export default ATLASCommandSurface;
