import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Signal = {
  id: string;
  title: string;
  category: string;
  status?: string;
  relevance_score?: number | null;
  urgency_level?: string | null;
};

const CATEGORY_STYLES: Record<string, { color: string; rgb: string; label: string }> = {
  regulatory_federal:    { color: "#60A5FA", rgb: "96,165,250",  label: "REG · FEDERAL" },
  regulatory_state:      { color: "#34D399", rgb: "52,211,153",  label: "REG · STATE" },
  quality_performance:   { color: "#A78BFA", rgb: "167,139,250", label: "QUALITY" },
  health_outcomes_sdoh:  { color: "#F472B6", rgb: "244,114,182", label: "SDOH" },
  policy_innovation:     { color: "#38BDF8", rgb: "56,189,248",  label: "POLICY INNOV." },
  evidence_base:         { color: "#FB923C", rgb: "251,146,60",  label: "EVIDENCE" },
  field_intelligence:    { color: "#FACC15", rgb: "250,204,21",  label: "FIELD INTEL" },
  competitive_landscape: { color: "#F87171", rgb: "248,113,113", label: "COMPETITIVE" },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_STYLES);
const GOLD = "196,154,43";
const PURPLE = "167,139,250";
const GREEN = "74,222,128";
const BLUE = "96,165,250";

type AtlasNode = { id: string; label: string; cat: "input" | "processing" | "data" | "core" | "output" | "terminal"; stat: string; hasActivity: boolean };

function liveClock(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const IRIS_STATUS = [
  "ANALYZING QUESTION CONTEXT...",
  "QUERYING ORACLE SIGNALS...",
  "SYNTHESIZING WIN ANGLE...",
  "ASSEMBLING EVALUATOR BRIEF...",
  "DELIVERING INTELLIGENCE...",
  "MONITORING NARRATIVE COHERENCE...",
  "DETECTING SIGNAL CONFLICTS...",
  "UPDATING MISSION MOMENTUM...",
];

// Deterministic pseudo-random based on string for missing fields
function hashFloat(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function relevanceFor(s: Signal): number {
  if (typeof s.relevance_score === "number") return Math.max(0, Math.min(100, s.relevance_score));
  return 45 + Math.floor(hashFloat(s.id, 1) * 50); // 45..95
}
function urgencyFor(s: Signal): "immediate" | "high" | "normal" | "low" {
  const u = (s.urgency_level ?? "").toLowerCase();
  if (u === "immediate" || u === "high" || u === "normal" || u === "low") return u as "immediate" | "high" | "normal" | "low";
  const r = relevanceFor(s);
  if (r >= 85) return "high";
  if (r >= 70) return "normal";
  return "low";
}

function ATLASCommandSurfaceInner({ missionId, signals }: { missionId: string; signals: Signal[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [clock, setClock] = useState(liveClock());
  useEffect(() => {
    const t = setInterval(() => setClock(liveClock()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auxiliary mission data
  const { data: mission } = useQuery({
    queryKey: ["atlas-surface-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name, submission_deadline, state_code, created_at")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });
  const { data: counts } = useQuery({
    queryKey: ["atlas-surface-counts", missionId],
    queryFn: async () => {
      const [docs, qs, writers, briefs] = await Promise.all([
        supabase.from("mission_documents").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_team_members").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("mission_assist_events").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
      ]);
      return {
        docs: docs.count ?? 0,
        questions: qs.count ?? 0,
        writers: writers.count ?? 0,
        briefs: briefs.count ?? 0,
      };
    },
    staleTime: 60_000,
  });

  const approved = useMemo(() => signals.filter((s) => ["approved", "pushed"].includes(s.status ?? "")), [signals]);
  const signalCount = approved.length;
  const sigByCat = useMemo(() => {
    const m = new Map<string, Signal[]>();
    for (const k of CATEGORY_KEYS) m.set(k, []);
    for (const s of approved) {
      const arr = m.get(s.category);
      if (arr) arr.push(s);
    }
    return m;
  }, [approved]);

  const daysRemaining = useMemo(() => {
    if (!mission?.submission_deadline) return null;
    const ms = new Date(mission.submission_deadline).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }, [mission?.submission_deadline]);

  const missionLabel = (mission?.name ?? "MISSION").slice(0, 20).toUpperCase();
  const stateLabel = mission?.state_code ?? "—";

  const coverage = Math.min(100, signalCount * 4);
  const momentumScore = Math.min(100, (counts?.briefs ?? 0) * 3 + signalCount);
  const briefCount = counts?.briefs ?? 0;

  // Approximate signals/hr throughput
  const throughput = useMemo(() => {
    const created = (mission as { created_at?: string } | null | undefined)?.created_at;
    if (!created) return Math.max(0, Math.round(signalCount * 0.4));
    const days = Math.max(1, (Date.now() - new Date(created).getTime()) / 86400000);
    return Math.max(0, Math.round((signalCount / days) * 24));
  }, [mission, signalCount]);

  // Header status flasher
  const statusFlashes = useMemo(
    () => [
      "ORACLE PIPELINE: PROCESSING",
      `IRIS: ${briefCount} BRIEFS ACTIVE`,
      `SIGNAL COVERAGE: ${coverage}%`,
      "WRITER COCKPIT: STANDBY",
      "STATE INTELLIGENCE: SYNCHRONIZED",
      `MOMENTUM SCORE: ${momentumScore}`,
    ],
    [briefCount, coverage, momentumScore]
  );
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const cycle = () => {
      const delay = 8000 + Math.random() * 4000;
      timeout = setTimeout(() => {
        if (cancelled) return;
        const idx = Math.floor(Math.random() * statusFlashes.length);
        setFlashIdx(idx);
        timeout = setTimeout(() => {
          if (cancelled) return;
          setFlashIdx(null);
          cycle();
        }, 2100);
      }, delay);
    };
    cycle();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [statusFlashes.length]);

  // Layout
  const HEADER_H = 36;
  const FOOTER_H = 28;
  const TOTAL_H = 560;
  const BODY_H = TOTAL_H - HEADER_H - FOOTER_H; // 496
  const panelW = width > 0 ? Math.floor(width / 3) : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full mb-6"
      style={{
        height: TOTAL_H,
        background:
          "repeating-linear-gradient(0deg, transparent 0px, transparent 39px, rgba(255,255,255,0.015) 39px, rgba(255,255,255,0.015) 40px)," +
          "repeating-linear-gradient(90deg, transparent 0px, transparent 39px, rgba(255,255,255,0.015) 39px, rgba(255,255,255,0.015) 40px)," +
          "#000000",
        borderBottom: "1px solid rgba(196,154,43,0.3)",
        overflow: "hidden",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Edge vignette */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Corner brackets */}
      <CornerBrackets />

      {/* Particle layer */}
      <ParticleLayer w={width} h={TOTAL_H} />

      {/* Header */}
      <div
        style={{
          position: "relative",
          height: HEADER_H,
          background: "rgba(0,0,0,0.8)",
          borderBottom: "1px solid rgba(196,154,43,0.2)",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Broadcast signal: solid inner + expanding ring */}
          <span style={{ position: "relative", width: 14, height: 14, display: "inline-block" }}>
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 8,
                height: 8,
                marginTop: -4,
                marginLeft: -4,
                borderRadius: 999,
                background: `rgba(${GREEN},0.3)`,
                animation: "atlas-broadcast 1.5s ease-out infinite",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 5,
                height: 5,
                marginTop: -2.5,
                marginLeft: -2.5,
                borderRadius: 999,
                background: `rgba(${GREEN},1)`,
              }}
            />
          </span>
          <span style={{ color: `rgba(${GOLD},1)`, fontSize: 9, letterSpacing: "0.2em" }}>
            ◈ ATLAS INTELLIGENCE COMMAND
          </span>
        </div>
        <div style={{ position: "relative", color: `rgba(${GOLD},0.5)`, fontSize: 7, letterSpacing: "0.15em", minHeight: 10 }}>
          <span style={{ opacity: flashIdx === null ? 1 : 0, transition: "opacity 300ms" }}>
            CLASSIFICATION: RESTRICTED · MISSION {missionId.slice(0, 8).toUpperCase()} · {stateLabel} MEDICAID
          </span>
          {flashIdx !== null && (
            <span
              style={{
                position: "absolute",
                inset: 0,
                textAlign: "center",
                color: `rgba(${GOLD},0.95)`,
                animation: "atlas-flash-in 100ms ease-out",
                letterSpacing: "0.2em",
              }}
            >
              ⟢ {statusFlashes[flashIdx]} ⟣
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: `rgba(${GOLD},0.6)`, fontSize: 9 }}>{clock}</span>
          <span style={{ color: `rgba(${GREEN},0.6)`, fontSize: 7, letterSpacing: "0.15em" }}>SESSION ACTIVE</span>
        </div>
      </div>

      {/* Body — three panels */}
      <div style={{ position: "relative", display: "flex", height: BODY_H, zIndex: 4 }}>
        <div style={{ flex: 1, position: "relative", borderRight: "1px solid rgba(196,154,43,0.15)" }}>
          {panelW > 0 && (
            <AtlasPanel
              w={panelW}
              h={BODY_H}
              docs={counts?.docs ?? 0}
              questions={counts?.questions ?? 0}
              signals={signalCount}
              briefs={counts?.briefs ?? 0}
              writers={counts?.writers ?? 0}
              stateLabel={stateLabel}
              throughput={throughput}
            />
          )}
        </div>
        <div style={{ flex: 1, position: "relative", borderRight: "1px solid rgba(196,154,43,0.15)" }}>
          {panelW > 0 && (
            <OraclePanel w={panelW} h={BODY_H} sigByCat={sigByCat} approved={approved} signalCount={signalCount} />
          )}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          {panelW > 0 && <IrisPanel w={panelW} h={BODY_H} briefs={counts?.briefs ?? 0} />}
        </div>

        {/* Inter-panel data flow indicators — burst-style */}
        {panelW > 0 && (
          <>
            <DividerBurst left={panelW} h={BODY_H} colorRgb={BLUE} dotSize={2} interval={[3500, 5000]} />
            <DividerBurst left={panelW * 2} h={BODY_H} colorRgb={GOLD} dotSize={3} interval={[3200, 4800]} />
          </>
        )}
      </div>

      {/* Bottom status bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: FOOTER_H,
          background: "rgba(0,0,0,0.9)",
          borderTop: "1px solid rgba(196,154,43,0.15)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          fontSize: 7,
          letterSpacing: "0.12em",
          zIndex: 5,
        }}
      >
        <div style={{ flex: 1, color: `rgba(${GREEN},0.6)` }}>
          ATLAS · {missionLabel} · {daysRemaining ?? "—"} DAYS REMAINING
        </div>
        <div style={{ flex: 1, textAlign: "center", color: `rgba(${GOLD},0.6)` }}>
          ORACLE · {signalCount} SIGNALS · {coverage}% COVERAGE · PIPELINE ACTIVE
        </div>
        <div style={{ flex: 1, textAlign: "right", color: `rgba(${PURPLE},0.6)` }}>
          IRIS · {counts?.briefs ?? 0} BRIEFS · MOMENTUM {momentumScore} · {counts?.writers ?? 0} WRITERS
        </div>
      </div>
    </div>
  );
}

export const ATLASCommandSurface = memo(ATLASCommandSurfaceInner);

// ─────────────────────────────────────────────────────────────
// ATLAS panel
function AtlasPanel({
  w, h, docs, questions, signals, briefs, writers, stateLabel, throughput,
}: {
  w: number; h: number; docs: number; questions: number; signals: number; briefs: number; writers: number; stateLabel: string; throughput: number;
}) {
  void questions;
  const HEADER = 32;
  const FOOTER = 22;
  const innerH = h - HEADER - FOOTER;
  const nodes: AtlasNode[] = [
    { id: "rfp", label: "RFP DOCUMENTS",      cat: "input",      stat: `${docs} DOCS`,        hasActivity: docs > 0 },
    { id: "pipe", label: "ORACLE PIPELINE",   cat: "processing", stat: "ACTIVE",              hasActivity: true },
    { id: "sig", label: "SIGNAL EXTRACTION",  cat: "processing", stat: `${signals} SIG`,      hasActivity: signals > 0 },
    { id: "state", label: "STATE INTELLIGENCE", cat: "data",     stat: stateLabel.toUpperCase(), hasActivity: stateLabel !== "—" },
    { id: "core", label: "MISSION ORACLE",    cat: "core",       stat: `${signals}`,          hasActivity: signals > 0 },
    { id: "iris", label: "IRIS BRIEFING LAYER", cat: "output",   stat: `${briefs} BRIEFS`,    hasActivity: briefs > 0 },
    { id: "cock", label: "WRITER COCKPIT",    cat: "terminal",   stat: `${writers} WRITERS`,  hasActivity: writers > 0 },
  ];

  // Per-stage connector speeds (seconds per cycle)
  const CONNECTOR_SPEEDS = [1.2, 0.9, 2.1, 1.8, 0.7, 1.5];

  const NODE_H = 28;
  const slotH = innerH / nodes.length;
  const nodeW = Math.floor(w * 0.7);
  const xPad = Math.floor((w - nodeW) / 2);

  const palette: Record<AtlasNode["cat"], { border: string; bg: string; label: string; weight: number }> = {
    input:      { border: "rgba(96,165,250,0.4)",  bg: "rgba(96,165,250,0.06)",  label: "rgba(96,165,250,0.9)",  weight: 400 },
    processing: { border: "rgba(196,154,43,0.4)",  bg: "rgba(196,154,43,0.06)",  label: "rgba(196,154,43,0.9)",  weight: 400 },
    data:       { border: "rgba(52,211,153,0.4)",  bg: "rgba(52,211,153,0.06)",  label: "rgba(52,211,153,0.9)",  weight: 400 },
    core:       { border: "rgba(196,154,43,0.9)",  bg: "rgba(196,154,43,0.12)",  label: "#ffffff",               weight: 600 },
    output:     { border: "rgba(167,139,250,0.4)", bg: "rgba(167,139,250,0.06)", label: "rgba(167,139,250,0.9)", weight: 400 },
    terminal:   { border: "rgba(74,222,128,0.4)",  bg: "rgba(74,222,128,0.06)",  label: "rgba(74,222,128,0.9)",  weight: 400 },
  };

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <PanelHeader
        title="ATLAS"
        subtitle="MISSION ARCHITECTURE"
        subtitleColorRgb={GOLD}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 7, color: `rgba(${GOLD},0.8)`, letterSpacing: "0.15em" }}>↑ {throughput} SIG/HR</span>
            <span style={{ fontSize: 7, color: `rgba(${GREEN},0.8)`, border: `1px solid rgba(${GREEN},0.4)`, padding: "2px 6px", borderRadius: 2 }}>HEALTHY</span>
          </div>
        }
      />

      {/* Pipeline connectors */}
      <svg width={w} height={innerH} style={{ position: "absolute", top: HEADER, left: 0 }}>
        {nodes.slice(0, -1).map((_, i) => {
          const y1 = slotH * i + slotH / 2 + NODE_H / 2;
          const y2 = slotH * (i + 1) + slotH / 2 - NODE_H / 2;
          // Critical path is the MISSION ORACLE → IRIS BRIEFING LAYER connector (i === 4)
          const isCritical = i === 4;
          const speed = CONNECTOR_SPEEDS[i] ?? 1.5;
          return (
            <line
              key={i}
              x1={w / 2}
              y1={y1}
              x2={w / 2}
              y2={y2}
              stroke={isCritical ? `rgba(${GOLD},1)` : `rgba(${GOLD},0.6)`}
              strokeWidth={isCritical ? 2.5 : 2}
              strokeDasharray={isCritical ? "12 28" : "8 32"}
              style={{ animation: `atlas-flow ${speed}s linear infinite` }}
            />
          );
        })}
      </svg>

      {/* Nodes (HTML overlay) */}
      <div style={{ position: "absolute", top: HEADER, left: 0, width: w, height: innerH }}>
        {nodes.map((n, i) => {
          const p = palette[n.cat];
          const top = slotH * i + slotH / 2 - NODE_H / 2;
          const isOracle = n.id === "core";
          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                top,
                left: xPad,
                width: nodeW,
                height: NODE_H,
                background: p.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 10px",
                fontSize: 8,
                letterSpacing: "0.12em",
                color: p.label,
                fontWeight: p.weight,
                transition: "box-shadow 200ms, transform 200ms",
                border: `1px solid ${p.border}`,
                // Pulsing 3px left border when node has activity
                borderLeft: `3px solid ${p.border}`,
                animation: n.hasActivity && !isOracle ? "atlas-border-pulse 3s ease-in-out infinite" : undefined,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 12px rgba(${GOLD},0.4)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            >
              {isOracle && (
                <svg
                  width={nodeW} height={NODE_H}
                  style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }}
                >
                  <rect
                    x={0.5} y={0.5}
                    width={nodeW - 1} height={NODE_H - 1}
                    fill="none"
                    stroke={`rgba(${GOLD},1)`}
                    strokeWidth={1.5}
                    strokeDasharray={`30 ${(nodeW + NODE_H) * 2 - 30}`}
                    style={{ animation: "atlas-orbit-border 4s linear infinite" }}
                  />
                </svg>
              )}
              <span style={{ position: "relative", zIndex: 1 }}>{n.label}</span>
              <span style={{ position: "relative", zIndex: 1, opacity: 0.7 }}>{n.stat}</span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 0,
          right: 0,
          textAlign: "center",
          color: `rgba(${GOLD},0.4)`,
          fontSize: 8,
          letterSpacing: "0.18em",
        }}
      >
        ATLAS IS CARRYING THE MISSION.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ORACLE panel
function OraclePanel({
  w, h, sigByCat, approved, signalCount,
}: {
  w: number; h: number; sigByCat: Map<string, Signal[]>; approved: Signal[]; signalCount: number;
}) {
  void sigByCat;
  const HEADER = 32;
  const FEED_H = 78;
  const innerH = h - HEADER - FEED_H;
  const cx = w / 2;
  const cy = HEADER + innerH / 2;
  const R_CORE = 80;
  const R_ORBIT = 110;
  const R_LABEL = 152;
  const R_DOTS = 132;

  const cats = CATEGORY_KEYS;
  const slotAngle = (2 * Math.PI) / cats.length;

  // Animation clock for breathing + sweep position
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Sweep angle in degrees (0 at top, increasing clockwise). 6s per revolution.
  const sweepDeg = ((now / 6000) * 360) % 360;
  const sweepRad = ((sweepDeg - 90) * Math.PI) / 180;

  // Inner ring (1px) at slightly different rotation speed
  const innerRingDeg = ((now / 9000) * 360) % 360;

  // Build signal dot data with size/phase/period
  const signalDots = useMemo(() => {
    return approved.slice(0, 24).map((s, i) => {
      const catIdx = cats.indexOf(s.category);
      const baseA = catIdx >= 0 ? catIdx * slotAngle : (i / 24) * 2 * Math.PI;
      const jitter = (hashFloat(s.id, 7) - 0.5) * 0.4;
      const a = baseA + jitter;
      const r = R_DOTS + (hashFloat(s.id, 9) - 0.5) * 22;
      const rel = relevanceFor(s);
      const radius = 3 + ((Math.max(40, Math.min(100, rel)) - 40) / 60) * 9; // 3..12px
      const phase = hashFloat(s.id, 11) * Math.PI * 2;
      const period = 1.8 + hashFloat(s.id, 13) * 4.3; // 1.8..6.1s
      const urgency = urgencyFor(s);
      return {
        id: s.id,
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        a,
        radius,
        phase,
        period,
        urgency,
        color: CATEGORY_STYLES[s.category]?.color ?? "#94A3B8",
        rgb: CATEGORY_STYLES[s.category]?.rgb ?? "148,163,184",
      };
    });
  }, [approved, cats, slotAngle]);

  // Track recently-pinged dots (sonar) — when sweep passes within ~7° of a dot's angle
  const pingRef = useRef<Map<string, number>>(new Map());
  for (const d of signalDots) {
    // dot angle in degrees, 0 at right (cos/sin). Convert to "0 at top" coord matching sweepDeg.
    const dotDeg = ((d.a * 180) / Math.PI + 90 + 360) % 360;
    const diff = Math.min(Math.abs(dotDeg - sweepDeg), 360 - Math.abs(dotDeg - sweepDeg));
    if (diff < 4 && (pingRef.current.get(d.id) ?? -Infinity) < now - 700) {
      pingRef.current.set(d.id, now);
    }
  }

  // Track recently-hit category labels (within sweep cone)
  const labelHitRef = useRef<Map<string, number>>(new Map());
  cats.forEach((k, i) => {
    const a = i * slotAngle;
    const labelDeg = ((a * 180) / Math.PI + 90 + 360) % 360;
    const diff = Math.min(Math.abs(labelDeg - sweepDeg), 360 - Math.abs(labelDeg - sweepDeg));
    if (diff < 6 && (labelHitRef.current.get(k) ?? -Infinity) < now - 700) {
      labelHitRef.current.set(k, now);
    }
  });

  // Arc flicker every 90° of rotation
  const sweepQuadrant = Math.floor(sweepDeg / 90);
  const inFlickerWindow = (sweepDeg - sweepQuadrant * 90) < 2; // ~50ms
  const sweepOpacity = inFlickerWindow ? 0.8 : 0.65;

  // ─── Feed: variable scroll speed + enter flicker ───
  const [feedIdx, setFeedIdx] = useState(0);
  const feedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (approved.length === 0) return;
    const advance = () => {
      const top = approved[feedIdx % approved.length];
      const u = urgencyFor(top);
      const delay = u === "immediate" ? 2500 : u === "high" ? 2000 : u === "low" ? 1000 : 1500;
      feedTimer.current = setTimeout(() => {
        setFeedIdx((i) => i + 1);
      }, delay);
    };
    advance();
    return () => {
      if (feedTimer.current) clearTimeout(feedTimer.current);
    };
  }, [feedIdx, approved]);

  const feedItems = approved.length > 0
    ? Array.from({ length: 5 }, (_, k) => approved[(feedIdx + k) % approved.length])
    : [];

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <PanelHeader
        title="ORACLE"
        subtitle="INTELLIGENCE NETWORK"
        subtitleColorRgb={GOLD}
        right={
          <span style={{ fontSize: 7, color: `rgba(${GOLD},0.7)`, letterSpacing: "0.15em" }}>
            {signalCount > 0 ? `${signalCount} SIGNALS ACTIVE` : "AWAITING INTELLIGENCE"}
          </span>
        }
      />

      {/* Hot spot glow behind core */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: cx - 50,
          top: cy - 30,
          width: 100,
          height: 60,
          background: `radial-gradient(ellipse at center, rgba(${GOLD},0.04), transparent 70%)`,
          filter: "blur(8px)",
          pointerEvents: "none",
        }}
      />

      <svg width={w} height={innerH + HEADER} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="sweepGrad" gradientUnits="userSpaceOnUse" x1={cx} y1={cy - R_ORBIT} x2={cx} y2={cy}>
            <stop offset="0%" stopColor={`rgba(${GOLD},${sweepOpacity})`} />
            <stop offset="100%" stopColor={`rgba(${GOLD},0)`} />
          </linearGradient>
        </defs>

        {/* Sweeping wedge */}
        <g style={{ transform: `rotate(${sweepDeg}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          {/* Trailing 30° gradient wedge */}
          <path
            d={`M ${cx} ${cy} L ${cx} ${cy - R_ORBIT} A ${R_ORBIT} ${R_ORBIT} 0 0 0 ${cx + Math.sin(-30 * Math.PI / 180) * R_ORBIT} ${cy - Math.cos(-30 * Math.PI / 180) * R_ORBIT} Z`}
            fill={`rgba(${GOLD},${sweepOpacity * 0.18})`}
          />
          {/* Bright leading edge (first 5°) */}
          <line
            x1={cx} y1={cy}
            x2={cx} y2={cy - R_ORBIT}
            stroke={`rgba(${GOLD},${Math.min(1, sweepOpacity + 0.2)})`}
            strokeWidth={1.6}
          />
        </g>

        {/* Core circle */}
        <circle cx={cx} cy={cy} r={R_CORE} fill="none" stroke={`rgba(${GOLD},0.8)`} strokeWidth={1.5} />
        {/* Inner thin ring rotating at different speed (visualized via a dashed circle that rotates) */}
        <g style={{ transform: `rotate(${innerRingDeg}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          <circle
            cx={cx} cy={cy} r={R_CORE - 6}
            fill="none"
            stroke={`rgba(${GOLD},0.4)`}
            strokeWidth={1}
            strokeDasharray="6 10"
          />
        </g>
        <circle cx={cx} cy={cy} r={4} fill={`rgba(${GOLD},1)`} style={{ animation: "atlas-pulse 1.8s ease-in-out infinite" }} />

        {/* Static category label arms */}
        {cats.map((k, i) => {
          const a = i * slotAngle;
          const lx = cx + Math.cos(a) * R_LABEL;
          const ly = cy + Math.sin(a) * R_LABEL;
          const tx = cx + Math.cos(a) * R_ORBIT;
          const ty = cy + Math.sin(a) * R_ORBIT;
          const style = CATEGORY_STYLES[k];
          const hit = labelHitRef.current.get(k);
          const sinceHit = hit ? now - hit : Infinity;
          const hot = sinceHit < 600;
          const labelOpacity = hot ? 1.0 : 0.2;
          const lineOpacity = hot ? 0.6 : 0.15;
          return (
            <g key={k}>
              <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={`rgba(${style.rgb},${lineOpacity * 0.5})`} strokeWidth={0.5} />
              <text
                x={lx + Math.cos(a) * 6}
                y={ly + Math.sin(a) * 6 + 2}
                fontSize={7}
                fill={hot ? `rgba(${GOLD},1)` : `rgba(${style.rgb},${labelOpacity})`}
                textAnchor={Math.cos(a) < -0.2 ? "end" : Math.cos(a) > 0.2 ? "start" : "middle"}
                style={{ letterSpacing: "0.1em", transition: "fill 250ms" }}
              >
                {style.label}
              </text>
            </g>
          );
        })}

        {/* Signal dots — sized by relevance, asynchronous breathing */}
        {signalDots.map((d) => {
          const t = now / 1000;
          const breath = 0.5 + 0.5 * Math.sin((t * (2 * Math.PI)) / d.period + d.phase);
          const ping = pingRef.current.get(d.id);
          const sincePing = ping ? now - ping : Infinity;
          const pingActive = sincePing < 600;
          const pingT = pingActive ? sincePing / 600 : 0; // 0..1
          const isUrgent = d.urgency === "immediate" || d.urgency === "high";
          const pingMaxExtra = isUrgent ? 26 : 20;
          const pingR = d.radius + pingT * pingMaxExtra;
          const pingOpacity = pingActive ? (1 - pingT) * (isUrgent ? 0.95 : 0.8) : 0;
          return (
            <g key={d.id}>
              {pingActive && (
                <circle
                  cx={cx + d.x}
                  cy={cy + d.y}
                  r={pingR}
                  fill="none"
                  stroke={`rgba(${d.rgb},${pingOpacity})`}
                  strokeWidth={isUrgent ? 1.4 : 1}
                />
              )}
              <circle
                cx={cx + d.x}
                cy={cy + d.y}
                r={d.radius}
                fill={d.color}
                opacity={0.4 + breath * 0.55}
              />
            </g>
          );
        })}

        {/* Core text */}
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize={8} fill={`rgba(${GOLD},0.6)`} style={{ letterSpacing: "0.2em" }}>
          ORACLE
        </text>
        <text
          key={signalCount}
          x={cx} y={cy + 8}
          textAnchor="middle"
          fontSize={20}
          fontWeight={700}
          fill="#ffffff"
          style={{ animation: "atlas-count-pulse 500ms ease-out" }}
        >
          {signalCount}
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize={7} fill={`rgba(${GOLD},0.4)`} style={{ letterSpacing: "0.2em" }}>
          SIGNALS
        </text>
      </svg>

      {/* Scrolling feed */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: FEED_H,
          padding: "8px 14px 12px",
          borderTop: "1px solid rgba(196,154,43,0.1)",
          overflow: "hidden",
        }}
      >
        {feedItems.length > 0 ? (
          feedItems.map((s, i) => {
            const style = CATEGORY_STYLES[s.category];
            const catLabel = (style?.label ?? (s.category ?? "").toUpperCase()).replace(/[· ]+/g, "_").slice(0, 12);
            const catColor = style ? `rgba(${style.rgb},${0.9 - i * 0.12})` : `rgba(${GOLD},${0.6 - i * 0.1})`;
            const titleColor = `rgba(255,255,255,${0.85 - i * 0.15})`;
            return (
              <div
                key={`${s.id}-${feedIdx}-${i}`}
                style={{
                  fontSize: 7,
                  letterSpacing: "0.1em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  animation: i === 0 ? "atlas-feed-flicker 400ms ease-out" : undefined,
                  lineHeight: "11px",
                }}
              >
                <span style={{ color: catColor }}>[{catLabel}]</span>
                <span style={{ color: titleColor }}> {(s.title ?? "").slice(0, 38)}</span>
              </div>
            );
          })
        ) : (
          <div style={{ fontSize: 7, color: `rgba(${GOLD},0.4)`, letterSpacing: "0.15em" }}>
            SYSTEM READY — AWAITING INPUT
          </div>
        )}
        {/* Intake cursor line */}
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 6,
            height: 1,
            background: `rgba(${GOLD},0.4)`,
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IRIS panel
function IrisPanel({ w, h, briefs }: { w: number; h: number; briefs: number }) {
  const HEADER = 32;
  const STATUS_H = 56;
  const innerH = h - HEADER - STATUS_H;

  const NODES = useMemo(() => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const arr: { x: number; y: number; type: "in" | "syn" | "out"; idx: number; relevance: number }[] = [];
    for (let i = 0; i < 18; i++) {
      const angle = i * phi * Math.PI * 2;
      const radius = Math.sqrt(i / 18) * (innerH * 0.35);
      const x = w / 2 + Math.cos(angle) * radius * 1.4;
      const y = innerH * 0.45 + Math.sin(angle) * radius;
      const type = i < 5 ? "in" : i < 13 ? "syn" : "out";
      const relevance = 40 + Math.floor(hashFloat(`iris-${i}`, 3) * 60); // 40..100
      arr.push({ x, y, type, idx: i, relevance });
    }
    return arr;
  }, [w, innerH]);

  const inputs = NODES.filter((n) => n.type === "in");
  const synth = NODES.filter((n) => n.type === "syn");
  const outputs = NODES.filter((n) => n.type === "out");

  const connections = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; key: string; srcRel: number; fromIdx: number; toIdx: number; phase: "in-syn" | "syn-out" }[] = [];
    for (const a of inputs) for (const b of synth) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, key: `${a.idx}-${b.idx}`, srcRel: a.relevance, fromIdx: a.idx, toIdx: b.idx, phase: "in-syn" });
    for (const a of synth) for (const b of outputs) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, key: `${a.idx}-${b.idx}`, srcRel: a.relevance, fromIdx: a.idx, toIdx: b.idx, phase: "syn-out" });
    return out;
  }, [inputs, synth, outputs]);

  // Animation clock
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => { setNow(performance.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Traveling signals — 2-3 in flight at once
  type Path = { id: number; pts: { x: number; y: number; idx: number }[]; outIdx: number; synIdx: number; started: number; duration: number };
  const [paths, setPaths] = useState<Path[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    if (inputs.length === 0 || synth.length === 0 || outputs.length === 0) return;
    const spawn = () => {
      const i = inputs[Math.floor(Math.random() * inputs.length)];
      const s = synth[Math.floor(Math.random() * synth.length)];
      const o = outputs[Math.floor(Math.random() * outputs.length)];
      const id = ++idRef.current;
      const duration = 2400;
      const newPath: Path = { id, pts: [{ x: i.x, y: i.y, idx: i.idx }, { x: s.x, y: s.y, idx: s.idx }, { x: o.x, y: o.y, idx: o.idx }], outIdx: o.idx, synIdx: s.idx, started: performance.now(), duration };
      setPaths((cur) => [...cur, newPath]);
      setTimeout(() => setPaths((cur) => cur.filter((p) => p.id !== id)), duration + 800);
    };
    spawn();
    const t = setInterval(spawn, 900);
    return () => clearInterval(t);
  }, [inputs, synth, outputs]);

  // For each active path, compute head position + 6-frame trail
  const sampleAt = (p: Path, tProgress: number) => {
    const tt = Math.max(0, Math.min(1, tProgress));
    if (tt <= 0.5) {
      const u = tt / 0.5;
      return { x: p.pts[0].x + (p.pts[1].x - p.pts[0].x) * u, y: p.pts[0].y + (p.pts[1].y - p.pts[0].y) * u };
    }
    const u = (tt - 0.5) / 0.5;
    return { x: p.pts[1].x + (p.pts[2].x - p.pts[1].x) * u, y: p.pts[1].y + (p.pts[2].y - p.pts[1].y) * u };
  };

  // Track which synth nodes have a signal approaching (pre-activate downstream lines)
  const preActivateSyn = new Set<number>();
  const deliveredOuts = new Map<number, number>(); // outIdx -> timestamp when delivered
  for (const p of paths) {
    const prog = (now - p.started) / p.duration;
    if (prog >= 0.35 && prog < 0.55) preActivateSyn.add(p.synIdx);
    if (prog >= 0.98 && !deliveredOuts.has(p.outIdx)) deliveredOuts.set(p.outIdx, now);
  }

  // Persistent delivery labels for 1200ms
  const deliveryRef = useRef<Map<number, number>>(new Map());
  for (const [idx, ts] of deliveredOuts) deliveryRef.current.set(idx, ts);
  for (const [idx, ts] of deliveryRef.current) {
    if (now - ts > 1200) deliveryRef.current.delete(idx);
  }

  // ─── Typewriter status text ───
  const [statusIdx, setStatusIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"type" | "hold" | "delete">("type");
  useEffect(() => {
    const target = IRIS_STATUS[statusIdx];
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "type") {
      if (typed.length < target.length) {
        timer = setTimeout(() => setTyped(target.slice(0, typed.length + 1)), 35);
      } else {
        timer = setTimeout(() => setPhase("hold"), 50);
      }
    } else if (phase === "hold") {
      timer = setTimeout(() => setPhase("delete"), 1500);
    } else {
      if (typed.length > 0) {
        timer = setTimeout(() => setTyped(target.slice(0, typed.length - 1)), 15);
      } else {
        setPhase("type");
        setStatusIdx((i) => (i + 1) % IRIS_STATUS.length);
      }
    }
    return () => clearTimeout(timer);
  }, [typed, phase, statusIdx]);

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <PanelHeader
        title="IRIS"
        subtitle="INTELLIGENCE SYNTHESIS"
        subtitleColorRgb={PURPLE}
        right={<span style={{ fontSize: 7, color: `rgba(${PURPLE},0.7)`, letterSpacing: "0.15em" }}>{briefs} BRIEFS GENERATED</span>}
      />

      <svg width={w} height={innerH} style={{ position: "absolute", top: HEADER, left: 0, overflow: "visible" }}>
        {/* Connection lines — opacity by source relevance, with pre-activation boost on syn→out */}
        {connections.map((c) => {
          let opacity = 0.05 + (c.srcRel / 100) * 0.20;
          if (c.phase === "syn-out" && preActivateSyn.has(c.fromIdx)) opacity = Math.min(0.55, opacity + 0.1);
          return (
            <line
              key={c.key}
              x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
              stroke={`rgba(${PURPLE},${opacity})`}
              strokeWidth={c.srcRel >= 80 ? 0.8 : 0.5}
              style={{ transition: "stroke 200ms" }}
            />
          );
        })}

        {/* Traveling comets */}
        {paths.map((p) => {
          const prog = (now - p.started) / p.duration;
          if (prog < 0 || prog > 1) return null;
          const head = sampleAt(p, prog);
          // 6-frame trail at ~24ms spacing
          const trailOpacities = [0.8, 0.6, 0.4, 0.3, 0.2, 0.1];
          const trailDelta = 0.018;
          return (
            <g key={p.id}>
              {trailOpacities.map((op, i) => {
                const tp = sampleAt(p, prog - trailDelta * (i + 1));
                return (
                  <circle key={i} cx={tp.x} cy={tp.y} r={2.4 - i * 0.2} fill={`rgba(${GOLD},${op})`} />
                );
              })}
              <circle cx={head.x} cy={head.y} r={3} fill={`rgba(${GOLD},1)`} style={{ filter: `drop-shadow(0 0 4px rgba(${GOLD},0.8))` }} />
            </g>
          );
        })}

        {/* Nodes with glow */}
        {NODES.map((n) => {
          const r = n.type === "in" ? 8 : n.type === "out" ? 6 : 5;
          const rgb = n.type === "in" ? GOLD : n.type === "out" ? GREEN : PURPLE;
          const flaring = paths.some((p) => p.outIdx === n.idx && (now - p.started) / p.duration > 0.95);
          return (
            <g key={n.idx}>
              <circle cx={n.x} cy={n.y} r={r + 4} fill={`rgba(${rgb},0.1)`} />
              <circle
                cx={n.x} cy={n.y} r={r}
                fill={`rgba(${rgb},0.9)`}
                style={flaring ? { animation: "atlas-flare 600ms ease-out" } : undefined}
              />
              {n.type === "out" && deliveryRef.current.has(n.idx) && (
                <text
                  x={n.x} y={n.y - r - 6}
                  textAnchor="middle"
                  fontSize={7}
                  fill={`rgba(${GREEN},0.8)`}
                  style={{ letterSpacing: "0.1em" }}
                >
                  BRIEF DELIVERED
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Typewriter status text */}
      <div
        style={{
          position: "absolute",
          bottom: 22,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 8,
          color: `rgba(${PURPLE},0.85)`,
          letterSpacing: "0.18em",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {typed}
        <span style={{ color: `rgba(${GOLD},1)`, animation: "atlas-cursor 1.2s steps(2) infinite" }}>|</span>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 7,
          fontStyle: "italic",
          color: `rgba(${PURPLE},0.3)`,
          letterSpacing: "0.12em",
        }}
      >
        Every question. Every writer. Every brief. Grounded in ORACLE.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared bits
function PanelHeader({ title, subtitle, subtitleColorRgb, right }: { title: string; subtitle: string; subtitleColorRgb: string; right?: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 32,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 14px",
        borderBottom: "1px solid rgba(196,154,43,0.08)",
        zIndex: 2,
      }}
    >
      <div>
        <div style={{ color: "#ffffff", fontSize: 15, fontWeight: 100, letterSpacing: "0.4em" }}>{title}</div>
        <div style={{ color: `rgba(${subtitleColorRgb},0.5)`, fontSize: 7, letterSpacing: "0.2em", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div>{right}</div>
    </div>
  );
}

function CornerBrackets() {
  const c = `rgba(${GOLD},0.4)`;
  const corner = (style: React.CSSProperties) => (
    <svg width={24} height={24} style={{ position: "absolute", ...style, zIndex: 10 }}>
      <line x1={0} y1={0} x2={24} y2={0} stroke={c} strokeWidth={1} />
      <line x1={0} y1={0} x2={0} y2={24} stroke={c} strokeWidth={1} />
    </svg>
  );
  return (
    <>
      {corner({ top: 0, left: 0 })}
      <svg width={24} height={24} style={{ position: "absolute", top: 0, right: 0, zIndex: 10 }}>
        <line x1={24} y1={0} x2={0} y2={0} stroke={c} strokeWidth={1} />
        <line x1={24} y1={0} x2={24} y2={24} stroke={c} strokeWidth={1} />
      </svg>
      <svg width={24} height={24} style={{ position: "absolute", bottom: 0, left: 0, zIndex: 10 }}>
        <line x1={0} y1={24} x2={24} y2={24} stroke={c} strokeWidth={1} />
        <line x1={0} y1={24} x2={0} y2={0} stroke={c} strokeWidth={1} />
      </svg>
      <svg width={24} height={24} style={{ position: "absolute", bottom: 0, right: 0, zIndex: 10 }}>
        <line x1={24} y1={24} x2={0} y2={24} stroke={c} strokeWidth={1} />
        <line x1={24} y1={24} x2={24} y2={0} stroke={c} strokeWidth={1} />
      </svg>
    </>
  );
}

function ParticleLayer({ w, h }: { w: number; h: number }) {
  void h;
  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        top: (i * 53) % 100,
        delay: (i * 0.7) % 25,
        dur: 25 + ((i * 3) % 15),
        angle: ((i * 17) % 31) - 15,
      })),
    []
  );
  if (w === 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 }}>
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: `${p.top}%`,
            left: -10,
            width: 1, height: 1,
            background: `rgba(${GOLD},0.15)`,
            animation: `atlas-drift ${p.dur}s linear ${p.delay}s infinite`,
            ["--atlas-drift-x" as string]: `${w + 20}px`,
            ["--atlas-drift-y" as string]: `${Math.tan((p.angle * Math.PI) / 180) * w}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// Sporadic burst-based divider flow with impact flash on the far side
function DividerBurst({ left, h, colorRgb, dotSize, interval }: { left: number; h: number; colorRgb: string; dotSize: number; interval: [number, number] }) {
  type Dot = { id: number; key: string; top: number };
  const [dots, setDots] = useState<Dot[]>([]);
  const [flash, setFlash] = useState<{ id: number; top: number } | null>(null);
  const idRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const burst = () => {
      const count = 3 + Math.floor(Math.random() * 3); // 3..5
      const top = 25 + Math.random() * 50; // % within panel
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (cancelled) return;
          const id = ++idRef.current;
          setDots((cur) => [...cur, { id, key: `${id}`, top }]);
          // remove after animation
          setTimeout(() => setDots((cur) => cur.filter((d) => d.id !== id)), 1300);
          // schedule impact flash to land ~1100ms later
          setTimeout(() => {
            if (cancelled) return;
            const fid = id;
            setFlash({ id: fid, top });
            setTimeout(() => setFlash((cur) => (cur && cur.id === fid ? null : cur)), 120);
          }, 1050);
        }, i * 50);
      }
      const delay = interval[0] + Math.random() * (interval[1] - interval[0]);
      timeout = setTimeout(burst, delay);
    };
    timeout = setTimeout(burst, 800 + Math.random() * 1200);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [interval]);

  return (
    <div style={{ position: "absolute", top: 0, left, width: 0, height: h, zIndex: 6, pointerEvents: "none" }}>
      {dots.map((d) => (
        <span
          key={d.key}
          style={{
            position: "absolute",
            top: `${d.top}%`,
            left: -dotSize,
            width: dotSize * 2,
            height: dotSize * 2,
            borderRadius: 999,
            background: `rgba(${colorRgb},0.8)`,
            boxShadow: `0 0 6px rgba(${colorRgb},0.7)`,
            animation: "atlas-cross-burst 1.1s ease-out forwards",
          }}
        />
      ))}
      {flash && (
        <span
          style={{
            position: "absolute",
            top: `${flash.top}%`,
            left: 60,
            width: 10,
            height: 10,
            marginTop: -5,
            marginLeft: -5,
            borderRadius: 999,
            background: `rgba(${colorRgb},0.4)`,
            boxShadow: `0 0 10px rgba(${colorRgb},0.5)`,
          }}
        />
      )}
    </div>
  );
}

const KEYFRAMES = `
@keyframes atlas-blink { 0%,49%{opacity:1} 50%,100%{opacity:0.1} }
@keyframes atlas-flow { to { stroke-dashoffset: -40 } }
@keyframes atlas-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.6);opacity:0.6} }
@keyframes atlas-orbit-cw { to { transform: rotate(360deg) } }
@keyframes atlas-orbit-ccw { to { transform: rotate(-360deg) } }
@keyframes atlas-sweep { to { transform: rotate(360deg) } }
@keyframes atlas-node-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.35)} }
@keyframes atlas-fade-up { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
@keyframes atlas-trace { from { stroke-dashoffset: 999 } to { stroke-dashoffset: 0 } }
@keyframes atlas-flare { 0%{transform:scale(1);filter:brightness(1)} 50%{transform:scale(1.8);filter:brightness(2)} 100%{transform:scale(1);filter:brightness(1)} }
@keyframes atlas-fade-soft { from { opacity: 0 } to { opacity: 1 } }
@keyframes atlas-drift {
  from { transform: translate(0, 0); opacity: 0 }
  10% { opacity: 1 }
  90% { opacity: 1 }
  to { transform: translate(var(--atlas-drift-x), var(--atlas-drift-y)); opacity: 0 }
}
@keyframes atlas-cross-burst {
  from { transform: translateX(0); opacity: 0 }
  20% { opacity: 1 }
  80% { opacity: 1 }
  to { transform: translateX(60px); opacity: 0 }
}
@keyframes atlas-border-pulse {
  0%, 100% { border-left-color: rgba(255,255,255,0.3) }
  50% { border-left-color: rgba(255,255,255,0.8) }
}
@keyframes atlas-orbit-border {
  from { stroke-dashoffset: 0 }
  to { stroke-dashoffset: -${1000} }
}
@keyframes atlas-broadcast {
  0% { transform: scale(1); opacity: 0.6 }
  100% { transform: scale(2); opacity: 0 }
}
@keyframes atlas-flash-in {
  from { opacity: 0 }
  to { opacity: 1 }
}
@keyframes atlas-count-pulse {
  0% { transform: scale(1); filter: brightness(1) }
  40% { transform: scale(1.15); filter: brightness(1.4) }
  100% { transform: scale(1); filter: brightness(1) }
}
@keyframes atlas-feed-flicker {
  0% { opacity: 1; filter: brightness(1.4) }
  100% { opacity: 1; filter: brightness(1) }
}
@keyframes atlas-cursor {
  0%, 49% { opacity: 1 }
  50%, 100% { opacity: 0 }
}
`;
