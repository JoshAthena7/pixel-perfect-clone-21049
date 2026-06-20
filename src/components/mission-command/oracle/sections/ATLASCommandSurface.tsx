import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Signal = {
  id: string;
  title: string;
  category: string;
  status?: string;
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

type AtlasNode = { id: string; label: string; cat: "input" | "processing" | "data" | "core" | "output" | "terminal"; stat: string };

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
        .select("name, submission_deadline, state_code")
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
          "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 3px), #000000",
        borderBottom: "1px solid rgba(196,154,43,0.3)",
        overflow: "hidden",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <style>{KEYFRAMES}</style>

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
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: `rgba(${GREEN},1)`,
              animation: "atlas-blink 0.8s steps(2) infinite",
              display: "inline-block",
            }}
          />
          <span style={{ color: `rgba(${GOLD},1)`, fontSize: 9, letterSpacing: "0.2em" }}>
            ◈ ATLAS INTELLIGENCE COMMAND
          </span>
        </div>
        <div style={{ color: `rgba(${GOLD},0.5)`, fontSize: 7, letterSpacing: "0.15em" }}>
          CLASSIFICATION: RESTRICTED · MISSION {missionId.slice(0, 8).toUpperCase()} · {stateLabel} MEDICAID
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

        {/* Inter-panel data flow indicators */}
        {panelW > 0 && (
          <>
            <DividerFlow left={panelW} h={BODY_H} colorRgb={GOLD} delay={0} />
            <DividerFlow left={panelW * 2} h={BODY_H} colorRgb={PURPLE} delay={2} />
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
          ORACLE · {signalCount} SIGNALS · {Math.min(100, signalCount * 4)}% COVERAGE · PIPELINE ACTIVE
        </div>
        <div style={{ flex: 1, textAlign: "right", color: `rgba(${PURPLE},0.6)` }}>
          IRIS · {counts?.briefs ?? 0} BRIEFS · MOMENTUM {Math.min(100, (counts?.briefs ?? 0) * 3 + signalCount)} · {counts?.writers ?? 0} WRITERS
        </div>
      </div>
    </div>
  );
}

export const ATLASCommandSurface = memo(ATLASCommandSurfaceInner);

// ─────────────────────────────────────────────────────────────
// ATLAS panel
function AtlasPanel({
  w, h, docs, questions, signals, briefs, writers, stateLabel,
}: {
  w: number; h: number; docs: number; questions: number; signals: number; briefs: number; writers: number; stateLabel: string;
}) {
  const HEADER = 32;
  const FOOTER = 22;
  const innerH = h - HEADER - FOOTER;
  const nodes: AtlasNode[] = [
    { id: "rfp", label: "RFP DOCUMENTS", cat: "input", stat: `${docs} DOCS` },
    { id: "pipe", label: "ORACLE PIPELINE", cat: "processing", stat: "ACTIVE" },
    { id: "sig", label: "SIGNAL EXTRACTION", cat: "processing", stat: `${signals} SIG` },
    { id: "state", label: "STATE INTELLIGENCE", cat: "data", stat: stateLabel.toUpperCase() },
    { id: "core", label: "MISSION ORACLE", cat: "core", stat: `${signals}` },
    { id: "iris", label: "IRIS BRIEFING LAYER", cat: "output", stat: `${briefs} BRIEFS` },
    { id: "cock", label: "WRITER COCKPIT", cat: "terminal", stat: `${writers} WRITERS` },
  ];

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
      {/* Header */}
      <PanelHeader title="ATLAS" subtitle="MISSION ARCHITECTURE" subtitleColorRgb={GOLD}
        right={<span style={{ fontSize: 7, color: `rgba(${GREEN},0.8)`, border: `1px solid rgba(${GREEN},0.4)`, padding: "2px 6px", borderRadius: 2 }}>HEALTHY</span>} />

      {/* Pipeline */}
      <svg width={w} height={innerH} style={{ position: "absolute", top: HEADER, left: 0 }}>
        {/* connectors */}
        {nodes.slice(0, -1).map((_, i) => {
          const y1 = slotH * i + slotH / 2 + NODE_H / 2;
          const y2 = slotH * (i + 1) + slotH / 2 - NODE_H / 2;
          const isCritical = nodes[i].id === "core";
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
              style={{ animation: `atlas-flow ${isCritical ? 1.0 : 1.2}s linear infinite` }}
            />
          );
        })}
      </svg>

      {/* nodes (HTML overlay for crisp text) */}
      <div style={{ position: "absolute", top: HEADER, left: 0, width: w, height: innerH }}>
        {nodes.map((n, i) => {
          const p = palette[n.cat];
          const top = slotH * i + slotH / 2 - NODE_H / 2;
          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                top,
                left: xPad,
                width: nodeW,
                height: NODE_H,
                border: `1px solid ${p.border}`,
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
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 12px rgba(${GOLD},0.4)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <span>{n.label}</span>
              <span style={{ opacity: 0.7 }}>{n.stat}</span>
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
  const HEADER = 32;
  const FEED_H = 70;
  const innerH = h - HEADER - FEED_H;
  const cx = w / 2;
  const cy = HEADER + innerH / 2;
  const R_CORE = 80;
  const R_ORBIT = 110;
  const R_ARM = 145;
  const R_DOTS = 158;

  const cats = CATEGORY_KEYS;
  const slotAngle = (2 * Math.PI) / cats.length;

  // signal dots (counter-rotating)
  const signalDots = approved.slice(0, 20).map((s, i) => {
    const catIdx = cats.indexOf(s.category);
    const baseA = catIdx >= 0 ? catIdx * slotAngle : (i / 20) * 2 * Math.PI;
    const jitter = ((i * 137) % 60 - 30) * (Math.PI / 180) * 0.1;
    const a = baseA + jitter;
    const r = R_DOTS + ((i * 7) % 14) - 5;
    return {
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      color: CATEGORY_STYLES[s.category]?.color ?? "#94A3B8",
      id: s.id,
    };
  });

  // scrolling feed
  const [feedIdx, setFeedIdx] = useState(0);
  useEffect(() => {
    if (approved.length === 0) return;
    const t = setInterval(() => setFeedIdx((i) => i + 1), 2000);
    return () => clearInterval(t);
  }, [approved.length]);

  const feedItems = approved.length > 0
    ? Array.from({ length: 5 }, (_, k) => approved[(feedIdx + k) % approved.length])
    : [];

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <PanelHeader
        title="ORACLE"
        subtitle="INTELLIGENCE NETWORK"
        subtitleColorRgb={GOLD}
        right={<span style={{ fontSize: 7, color: `rgba(${GOLD},0.7)`, letterSpacing: "0.15em" }}>
          {signalCount > 0 ? `${signalCount} SIGNALS ACTIVE` : "AWAITING INTELLIGENCE"}
        </span>}
      />

      <svg width={w} height={innerH + HEADER} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* sweeping arc */}
        <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: "atlas-sweep 6s linear infinite" }}>
          <path
            d={describeArc(cx, cy, R_ORBIT, -7.5, 7.5)}
            stroke={`rgba(${GOLD},0.8)`}
            strokeWidth={1.2}
            fill="none"
          />
        </g>

        {/* core */}
        <circle cx={cx} cy={cy} r={R_CORE} fill="none" stroke={`rgba(${GOLD},0.8)`} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={4} fill={`rgba(${GOLD},1)`} style={{ animation: "atlas-pulse 1.8s ease-in-out infinite" }} />

        {/* orbital nodes group (clockwise) */}
        <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: "atlas-orbit-cw 20s linear infinite" }}>
          {cats.map((k, i) => {
            const a = i * slotAngle;
            const x = cx + Math.cos(a) * R_ORBIT;
            const y = cy + Math.sin(a) * R_ORBIT;
            const style = CATEGORY_STYLES[k];
            const count = sigByCat.get(k)?.length ?? 0;
            const active = count > 0;
            const ax = cx + Math.cos(a) * R_ARM;
            const ay = cy + Math.sin(a) * R_ARM;
            return (
              <g key={k}>
                <line x1={cx} y1={cy} x2={x} y2={y} stroke={`rgba(${style.rgb},${active ? 0.25 : 0.1})`} strokeWidth={0.5} />
                <circle
                  cx={x} cy={y} r={8}
                  fill={`rgba(${style.rgb},${active ? 0.9 : 0.3})`}
                  style={active ? { animation: `atlas-node-pulse 2.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` } : undefined}
                />
                <line x1={x} y1={y} x2={ax} y2={ay} stroke={`rgba(${style.rgb},0.3)`} strokeWidth={0.5} />
                <text
                  x={ax + Math.cos(a) * 6}
                  y={ay + Math.sin(a) * 6 + 2}
                  fontSize={7}
                  fill={`rgba(${style.rgb},${active ? 0.9 : 0.4})`}
                  textAnchor={Math.cos(a) < -0.2 ? "end" : Math.cos(a) > 0.2 ? "start" : "middle"}
                  style={{ letterSpacing: "0.1em" }}
                >
                  {style.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* signal dots (counter-clockwise, slower) */}
        <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: "atlas-orbit-ccw 35s linear infinite" }}>
          {signalDots.map((d, i) => (
            <circle
              key={d.id + i}
              cx={cx + d.x}
              cy={cy + d.y}
              r={3}
              fill={d.color}
              opacity={0.85}
            />
          ))}
        </g>

        {/* core text */}
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize={8} fill={`rgba(${GOLD},0.6)`} style={{ letterSpacing: "0.2em" }}>
          ORACLE
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={20} fontWeight={700} fill="#ffffff">
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
          padding: "8px 14px",
          borderTop: "1px solid rgba(196,154,43,0.1)",
          overflow: "hidden",
        }}
      >
        {feedItems.length > 0 ? (
          feedItems.map((s, i) => (
            <div
              key={`${s.id}-${feedIdx}-${i}`}
              style={{
                fontSize: 7,
                color: `rgba(${GOLD},${0.5 - i * 0.08})`,
                letterSpacing: "0.1em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                animation: i === 0 ? "atlas-fade-up 600ms ease-out" : undefined,
                lineHeight: "11px",
              }}
            >
              [{(s.category ?? "").toUpperCase().slice(0, 12)}] {(s.title ?? "").slice(0, 35)}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 7, color: `rgba(${GOLD},0.4)`, letterSpacing: "0.15em" }}>
            SYSTEM READY — AWAITING INPUT
          </div>
        )}
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
    const arr: { x: number; y: number; type: "in" | "syn" | "out"; idx: number }[] = [];
    for (let i = 0; i < 18; i++) {
      const angle = i * phi * Math.PI * 2;
      const radius = Math.sqrt(i / 18) * (innerH * 0.35);
      const x = w / 2 + Math.cos(angle) * radius * 1.4;
      const y = innerH * 0.45 + Math.sin(angle) * radius;
      const type = i < 5 ? "in" : i < 13 ? "syn" : "out";
      arr.push({ x, y, type, idx: i });
    }
    return arr;
  }, [w, innerH]);

  const inputs = NODES.filter((n) => n.type === "in");
  const synth = NODES.filter((n) => n.type === "syn");
  const outputs = NODES.filter((n) => n.type === "out");

  const connections = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
    for (const a of inputs) for (const b of synth) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, key: `${a.idx}-${b.idx}` });
    for (const a of synth) for (const b of outputs) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, key: `${a.idx}-${b.idx}` });
    return out;
  }, [inputs, synth, outputs]);

  // Traveling signals: pick a fresh path every 3s
  const [paths, setPaths] = useState<{ id: number; pts: { x: number; y: number }[]; outIdx: number }[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    if (inputs.length === 0) return;
    const t = setInterval(() => {
      const i = inputs[Math.floor(Math.random() * inputs.length)];
      const s = synth[Math.floor(Math.random() * synth.length)];
      const o = outputs[Math.floor(Math.random() * outputs.length)];
      const id = ++idRef.current;
      setPaths((cur) => [...cur, { id, pts: [i, s, o].map((n) => ({ x: n.x, y: n.y })), outIdx: o.idx }]);
      setTimeout(() => setPaths((cur) => cur.filter((p) => p.id !== id)), 2600);
    }, 1500);
    return () => clearInterval(t);
  }, [inputs, synth, outputs]);

  // Status cycle
  const [statusIdx, setStatusIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStatusIdx((i) => (i + 1) % IRIS_STATUS.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <PanelHeader
        title="IRIS"
        subtitle="INTELLIGENCE SYNTHESIS"
        subtitleColorRgb={PURPLE}
        right={<span style={{ fontSize: 7, color: `rgba(${PURPLE},0.7)`, letterSpacing: "0.15em" }}>{briefs} BRIEFS GENERATED</span>}
      />

      <svg width={w} height={innerH} style={{ position: "absolute", top: HEADER, left: 0 }}>
        {connections.map((c) => (
          <line key={c.key} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={`rgba(${PURPLE},0.15)`} strokeWidth={0.5} />
        ))}

        {paths.map((p) => {
          // total length approx
          const seg1 = Math.hypot(p.pts[1].x - p.pts[0].x, p.pts[1].y - p.pts[0].y);
          const seg2 = Math.hypot(p.pts[2].x - p.pts[1].x, p.pts[2].y - p.pts[1].y);
          const total = seg1 + seg2;
          const polyline = `${p.pts[0].x},${p.pts[0].y} ${p.pts[1].x},${p.pts[1].y} ${p.pts[2].x},${p.pts[2].y}`;
          return (
            <g key={p.id}>
              <polyline
                points={polyline}
                fill="none"
                stroke={`rgba(${PURPLE},0.55)`}
                strokeWidth={1}
                strokeDasharray={`8 ${Math.max(total, 1)}`}
                strokeDashoffset={total + 8}
                style={{ animation: `atlas-trace 2.5s linear forwards` }}
              />
            </g>
          );
        })}

        {NODES.map((n) => {
          const r = n.type === "in" ? 7 : n.type === "out" ? 6 : 5;
          const color = n.type === "in" ? `rgba(${GOLD},0.85)` : n.type === "out" ? `rgba(${GREEN},0.85)` : `rgba(${PURPLE},0.8)`;
          const flaring = paths.some((p) => p.outIdx === n.idx);
          return (
            <circle
              key={n.idx}
              cx={n.x} cy={n.y} r={r}
              fill={color}
              style={flaring ? { animation: "atlas-flare 600ms ease-out" } : undefined}
            />
          );
        })}
      </svg>

      {/* Status text */}
      <div
        style={{
          position: "absolute",
          bottom: 22,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 8,
          color: `rgba(${PURPLE},0.7)`,
          letterSpacing: "0.18em",
          animation: "atlas-fade-soft 600ms ease-out",
        }}
        key={statusIdx}
      >
        {IRIS_STATUS[statusIdx]}
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
            // CSS var consumed by keyframes
            ["--atlas-drift-x" as any]: `${w + 20}px`,
            ["--atlas-drift-y" as any]: `${Math.tan((p.angle * Math.PI) / 180) * w}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function DividerFlow({ left, h, colorRgb, delay }: { left: number; h: number; colorRgb: string; delay: number }) {
  return (
    <div style={{ position: "absolute", top: 0, left, width: 0, height: h, zIndex: 6, pointerEvents: "none" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: "30%",
            left: -2,
            width: 4, height: 4,
            borderRadius: 999,
            background: `rgba(${colorRgb},0.7)`,
            boxShadow: `0 0 6px rgba(${colorRgb},0.6)`,
            animation: `atlas-cross 4s linear ${delay + i * 0.25}s infinite`,
            ["--atlas-cross-y" as any]: `${h * 0.4}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// SVG arc helper
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArcFlag = endDeg - startDeg <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
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
@keyframes atlas-cross {
  from { transform: translate(-20px, 0); opacity: 0 }
  10% { opacity: 1 }
  90% { opacity: 1 }
  to { transform: translate(40px, var(--atlas-cross-y, 0)); opacity: 0 }
}
`;
