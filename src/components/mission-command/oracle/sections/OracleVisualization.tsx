import { useEffect, useMemo, useRef, useState, memo } from "react";

type Signal = {
  id: string;
  title: string;
  category: string;
  urgency?: string | null;
  relevance_score?: number | null;
  tier?: string | null;
  topic_tags?: string[] | null;
  why_it_matters?: string | null;
  what_happened?: string | null;
  recommended_action?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  published_at?: string | null;
};

const CATEGORY_STYLES: Record<string, { color: string; glow: string; label: string }> = {
  regulatory_federal:    { color: "#60A5FA", glow: "rgba(96,165,250,0.4)",  label: "Regulatory · Federal" },
  regulatory_state:      { color: "#34D399", glow: "rgba(52,211,153,0.4)",  label: "Regulatory · State" },
  quality_performance:   { color: "#A78BFA", glow: "rgba(167,139,250,0.4)", label: "Quality & Performance" },
  health_outcomes_sdoh:  { color: "#F472B6", glow: "rgba(244,114,182,0.4)", label: "Health Outcomes / SDOH" },
  policy_innovation:     { color: "#38BDF8", glow: "rgba(56,189,248,0.4)",  label: "Policy Innovation" },
  evidence_base:         { color: "#FB923C", glow: "rgba(251,146,60,0.4)",  label: "Evidence Base" },
  field_intelligence:    { color: "#FACC15", glow: "rgba(250,204,21,0.4)",  label: "Field Intelligence" },
  competitive_landscape: { color: "#F87171", glow: "rgba(248,113,113,0.4)", label: "Competitive Landscape" },
  client_content_map:    { color: "#C49A2B", glow: "rgba(196,154,43,0.4)",  label: "Client Content Map" },
};

const DEFAULT_STYLE = { color: "#94A3B8", glow: "rgba(148,163,184,0.4)", label: "Other" };

function styleFor(cat: string) {
  return CATEGORY_STYLES[cat] ?? DEFAULT_STYLE;
}

function getCategoryClusterCenters(w: number, h: number) {
  return {
    regulatory_federal:    { x: w * 0.15, y: h * 0.25 },
    regulatory_state:      { x: w * 0.15, y: h * 0.70 },
    quality_performance:   { x: w * 0.35, y: h * 0.20 },
    health_outcomes_sdoh:  { x: w * 0.35, y: h * 0.75 },
    policy_innovation:     { x: w * 0.55, y: h * 0.30 },
    evidence_base:         { x: w * 0.55, y: h * 0.70 },
    field_intelligence:    { x: w * 0.72, y: h * 0.25 },
    competitive_landscape: { x: w * 0.75, y: h * 0.70 },
    client_content_map:    { x: w * 0.90, y: h * 0.50 },
  } as Record<string, { x: number; y: number }>;
}

type LaidNode = {
  id: string;
  label: string;
  category: string;
  urgency: string;
  relevance: number;
  tier: string;
  topic_tags: string[];
  x: number;
  y: number;
  radius: number;
  signal: Signal;
};

type Edge = { a: string; b: string; color: string; strength: number };

function runSimulation(nodes: LaidNode[], width: number, height: number, opts: { iters: number; clusterForce: number }) {
  const centers = getCategoryClusterCenters(width, height);
  nodes.forEach((n) => {
    n.x = Math.random() * width;
    n.y = Math.random() * height;
    (n as any).vx = 0;
    (n as any).vy = 0;
  });
  for (let iter = 0; iter < opts.iters; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i] as any;
        const b = nodes[j] as any;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 1200 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    nodes.forEach((n: any) => {
      const c = centers[n.category];
      if (c) {
        n.vx += (c.x - n.x) * opts.clusterForce;
        n.vy += (c.y - n.y) * opts.clusterForce;
      }
      n.vx += (width / 2 - n.x) * 0.002;
      n.vy += (height / 2 - n.y) * 0.002;
    });
    nodes.forEach((n: any) => {
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(n.radius + 10, Math.min(width - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min(height - n.radius - 10, n.y));
    });
  }
}

const NodeCircle = memo(function NodeCircle({
  node, style, dimmed, highlighted, selected, urgent, onEnter, onLeave, onClick, animate,
}: {
  node: LaidNode;
  style: { color: string; glow: string };
  dimmed: boolean;
  highlighted: boolean;
  selected: boolean;
  urgent: boolean;
  animate: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const dur = 2.5 + ((node.x + node.y) % 200) / 100;
  const delay = ((node.x * 13) % 200) / 100;
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      style={{
        opacity: dimmed ? 0.3 : highlighted ? 1 : 0.9,
        transition: "opacity 200ms ease",
        cursor: "pointer",
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {urgent && (
        <circle
          r={node.radius + 4}
          fill="none"
          stroke={style.glow}
          strokeWidth={1}
          style={{ animation: "oracle-glow-pulse 2s ease-in-out infinite", transformOrigin: "center" }}
        />
      )}
      {selected && (
        <circle r={node.radius * 1.5} fill="none" stroke="#C49A2B" strokeWidth={2} />
      )}
      <circle
        r={node.radius}
        fill={style.color}
        style={{
          filter: `drop-shadow(0 0 6px ${style.glow})`,
          transformOrigin: "center",
          animation: animate ? `oracle-breathe ${dur}s ease-in-out ${delay}s infinite` : undefined,
          transform: highlighted ? "scale(1.4)" : undefined,
          transition: "transform 150ms ease",
        }}
      />
    </g>
  );
});

const EdgeLine = memo(function EdgeLine({
  x1, y1, x2, y2, color, bright, delay,
}: { x1: number; y1: number; x2: number; y2: number; color: string; bright: boolean; delay: number }) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={color}
      strokeWidth={0.5}
      opacity={bright ? 0.5 : 0.15}
      className="oracle-line"
      style={{ animationDelay: `${delay}s` }}
    />
  );
});

export function OracleVisualization({ signals, onJumpToSetup }: { signals: Signal[]; onJumpToSetup?: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 420 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [clusterMode, setClusterMode] = useState<"normal" | "cluster" | "spread">("normal");
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [simTick, setSimTick] = useState(0);

  // Track container width
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({ w: el.clientWidth || 1200, h: 420 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scoped = useMemo(() => {
    return (signals || [])
      .filter((s) => s && s.id && s.category)
      .slice(0, 60);
  }, [signals]);

  const layout = useMemo(() => {
    if (scoped.length === 0) return { nodes: [] as LaidNode[], edges: [] as Edge[] };
    const nodes: LaidNode[] = scoped.map((s) => {
      const rel = Math.max(0, Math.min(100, Number(s.relevance_score ?? 50)));
      return {
        id: s.id,
        label: (s.title ?? "").slice(0, 28),
        category: s.category,
        urgency: (s.urgency ?? "").toLowerCase(),
        relevance: rel,
        tier: (s.tier ?? "").toLowerCase(),
        topic_tags: Array.isArray(s.topic_tags) ? s.topic_tags : [],
        x: 0, y: 0,
        radius: 6 + (rel / 100) * 10,
        signal: s,
      };
    });
    const clusterForce = clusterMode === "cluster" ? 0.04 : clusterMode === "spread" ? 0.005 : 0.015;
    const iters = nodes.length > 40 ? 100 : 150;
    runSimulation(nodes, size.w, size.h, { iters, clusterForce });

    // edges
    const maxEdges = nodes.length > 40 ? 50 : 80;
    const cand: Edge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (!a.topic_tags.length || !b.topic_tags.length) continue;
        const shared = a.topic_tags.some((t) => b.topic_tags.includes(t));
        if (!shared) continue;
        const higher = a.relevance >= b.relevance ? a : b;
        cand.push({ a: a.id, b: b.id, color: styleFor(higher.category).color, strength: a.relevance + b.relevance });
      }
    }
    cand.sort((x, y) => y.strength - x.strength);
    return { nodes, edges: cand.slice(0, maxEdges) };
  }, [scoped, size.w, size.h, clusterMode, simTick]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, LaidNode>();
    layout.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [layout.nodes]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    layout.edges.forEach((e) => {
      if (!m.has(e.a)) m.set(e.a, new Set());
      if (!m.has(e.b)) m.set(e.b, new Set());
      m.get(e.a)!.add(e.b);
      m.get(e.b)!.add(e.a);
    });
    return m;
  }, [layout.edges]);

  const presentCategories = useMemo(() => {
    const s = new Set<string>();
    layout.nodes.forEach((n) => s.add(n.category));
    return Array.from(s);
  }, [layout.nodes]);

  const selectedSignal = selected ? scoped.find((s) => s.id === selected) ?? null : null;

  // Listen to section nav events to highlight
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { category?: string } | undefined;
      if (detail?.category) {
        setFilterCategory(detail.category);
        setTimeout(() => setFilterCategory(null), 1800);
      }
    };
    window.addEventListener("oracle-section-pulse", handler);
    return () => window.removeEventListener("oracle-section-pulse", handler);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom((z) => Math.max(0.4, Math.min(2.5, z + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-oracle-node]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x) / zoom,
      y: dragStart.current.py + (e.clientY - dragStart.current.y) / zoom,
    });
  };
  const handleMouseUp = () => { setDragging(false); dragStart.current = null; };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); setFilterCategory(null); };

  if (scoped.length === 0) {
    return <EmptyState onJumpToSetup={onJumpToSetup} />;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{`
        @keyframes oracle-breathe {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes oracle-glow-pulse {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.6; }
        }
        @keyframes oracle-flow {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
        .oracle-line {
          stroke-dasharray: 4 6;
          animation: oracle-flow 3s linear infinite;
        }
        .oracle-empty-dot {
          animation: oracle-empty-drift 16s ease-in-out infinite;
        }
        @keyframes oracle-empty-drift {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          width: "100%",
          height: 420,
          background: "#000000",
          borderBottom: "1px solid rgba(196,154,43,0.2)",
          overflow: "hidden",
          position: "relative",
          cursor: dragging ? "grabbing" : "grab",
        }}
      >
        {/* Legend */}
        <div
          style={{
            position: "absolute", top: 12, left: 12, zIndex: 5,
            background: "rgba(0,0,0,0.6)", borderRadius: 4, padding: 8,
            backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", gap: 4,
          }}
        >
          {presentCategories.map((cat) => {
            const st = styleFor(cat);
            const active = filterCategory === cat;
            return (
              <button
                key={cat}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilterCategory(active ? null : cat);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6, background: "transparent",
                  border: "none", padding: 0, cursor: "pointer",
                  opacity: active ? 1 : 0.85,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: st.color, display: "inline-block" }} />
                <span style={{ fontSize: 9, color: active ? "#fff" : "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.05 }}>
                  {st.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, display: "flex", gap: 6 }}>
          {[
            { k: "reset", label: "Reset View", onClick: resetView },
            { k: "cluster", label: "Cluster", onClick: () => { setClusterMode("cluster"); setSimTick((t) => t + 1); } },
            { k: "spread", label: "Spread", onClick: () => { setClusterMode("spread"); setSimTick((t) => t + 1); } },
          ].map((b) => (
            <button
              key={b.k}
              onClick={(e) => { e.stopPropagation(); b.onClick(); }}
              style={{
                fontSize: 10, color: "rgba(255,255,255,0.7)",
                background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 3, padding: "0 8px", height: 24, cursor: "pointer",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        <svg
          width={size.w}
          height={size.h}
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 200ms ease",
          }}
        >
          {layout.edges.map((e, i) => {
            const a = nodeMap.get(e.a);
            const b = nodeMap.get(e.b);
            if (!a || !b) return null;
            const bright = hovered ? (hovered === e.a || hovered === e.b) : false;
            return (
              <EdgeLine
                key={`${e.a}-${e.b}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                color={e.color}
                bright={bright}
                delay={(i % 10) * 0.3}
              />
            );
          })}
          {layout.nodes.map((n) => {
            const st = styleFor(n.category);
            const isHover = hovered === n.id;
            const isSel = selected === n.id;
            const nb = neighbors.get(n.id);
            let dimmed = false;
            let highlighted = false;
            if (hovered) {
              if (isHover || nb?.has(hovered)) highlighted = true;
              else dimmed = true;
            } else if (filterCategory) {
              if (n.category === filterCategory) highlighted = true;
              else dimmed = true;
            }
            const urgent = n.urgency === "immediate" || n.urgency === "high";
            const animate = !(layout.nodes.length > 40 && n.relevance < 50);
            return (
              <g key={n.id} data-oracle-node>
                <NodeCircle
                  node={n}
                  style={st}
                  dimmed={dimmed}
                  highlighted={highlighted || isHover}
                  selected={isSel}
                  urgent={urgent}
                  animate={animate}
                  onEnter={() => {
                    setHovered(n.id);
                    setTooltipPos({ x: n.x, y: n.y });
                  }}
                  onLeave={() => { setHovered(null); setTooltipPos(null); }}
                  onClick={() => {
                    setSelected((prev) => (prev === n.id ? null : n.id));
                    setTimeout(() => {
                      const el = document.getElementById("oracle-viz-detail");
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hovered && tooltipPos && (() => {
          const n = nodeMap.get(hovered);
          if (!n) return null;
          const st = styleFor(n.category);
          const tx = Math.min(size.w - 290, Math.max(8, n.x * zoom + 18));
          const ty = Math.min(size.h - 140, Math.max(8, n.y * zoom + 18));
          const sig = n.signal;
          const tierLabel =
            n.tier === "platform" ? "PLATFORM"
            : n.tier === "state" ? `STATE${sig ? "" : ""}`
            : n.tier === "mission" ? "MISSION" : (n.tier || "").toUpperCase();
          return (
            <div
              style={{
                position: "absolute", left: tx, top: ty, zIndex: 6,
                background: "rgba(5,13,24,0.95)",
                border: `1px solid ${st.color}80`,
                borderRadius: 6, padding: 12, maxWidth: 280, pointerEvents: "none",
              }}
            >
              <div style={{ fontSize: 8, textTransform: "uppercase", color: st.color, letterSpacing: 0.08, marginBottom: 6 }}>
                {st.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 6, lineHeight: 1.3 }}>
                {sig.title}
              </div>
              {sig.why_it_matters && (
                <div style={{
                  fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 6,
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {sig.why_it_matters}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#C49A2B" }}>
                  Relevance: {Math.round(n.relevance)}/100
                </span>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.45)", letterSpacing: 0.08 }}>
                  {tierLabel}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Expanded card */}
      <div id="oracle-viz-detail" style={{
        maxHeight: selectedSignal ? 1200 : 0,
        overflow: "hidden",
        transition: "max-height 300ms ease-out",
      }}>
        {selectedSignal && (() => {
          const st = styleFor(selectedSignal.category);
          return (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${st.color}66`,
              borderRadius: 6,
              padding: 20,
              margin: "16px 16px 16px 16px",
              position: "relative",
            }}>
              <button
                onClick={() => setSelected(null)}
                style={{
                  position: "absolute", top: 8, right: 10, background: "transparent",
                  border: "none", color: "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer",
                }}
                aria-label="Close"
              >×</button>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: st.color, textTransform: "uppercase", letterSpacing: 0.08 }}>
                  {st.label}
                </span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>·</span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
                  {(selectedSignal.tier || "").toUpperCase()}
                </span>
              </div>
              <h3 style={{ fontSize: 18, color: "#fff", margin: "0 0 12px 0", fontWeight: 500 }}>
                {selectedSignal.title}
              </h3>
              {selectedSignal.what_happened && (
                <Field label="What happened" value={selectedSignal.what_happened} />
              )}
              {selectedSignal.why_it_matters && (
                <Field label="Why it matters" value={selectedSignal.why_it_matters} />
              )}
              {selectedSignal.recommended_action && (
                <Field label="Recommended action" value={selectedSignal.recommended_action} />
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {(selectedSignal.topic_tags || []).map((t) => (
                  <span key={t} style={{
                    fontSize: 10, color: "rgba(255,255,255,0.6)",
                    background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 3,
                  }}>{t}</span>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                {selectedSignal.source_url ? (
                  <a href={selectedSignal.source_url} target="_blank" rel="noreferrer" style={{ color: "#C49A2B" }}>
                    {selectedSignal.source_name ?? selectedSignal.source_url}
                  </a>
                ) : (selectedSignal.source_name ?? "")}
                {selectedSignal.published_at && (
                  <span> · {new Date(selectedSignal.published_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.08, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ onJumpToSetup }: { onJumpToSetup?: () => void }) {
  const dots = useMemo(() => {
    const arr: { x: number; y: number; d: number }[] = [];
    for (let i = 0; i < 28; i++) {
      arr.push({
        x: 100 + Math.random() * 1000,
        y: 60 + Math.random() * 300,
        d: 8 + Math.random() * 8,
      });
    }
    return arr;
  }, []);
  return (
    <div style={{
      width: "100%", height: 420, background: "#000",
      borderBottom: "1px solid rgba(196,154,43,0.2)",
      position: "relative", overflow: "hidden", marginBottom: 16,
    }}>
      <style>{`
        @keyframes oracle-empty-drift2 { 0%,100%{opacity:.3}50%{opacity:.9} }
      `}</style>
      <svg width="100%" height="100%" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice">
        {dots.map((d, i) => (
          <g key={i}>
            {dots.slice(i + 1, i + 3).map((d2, j) => (
              <line key={j} x1={d.x} y1={d.y} x2={d2.x} y2={d2.y}
                stroke="rgba(196,154,43,0.15)" strokeWidth={0.5} />
            ))}
            <circle cx={d.x} cy={d.y} r={2} fill="#C49A2B"
              style={{ animation: `oracle-empty-drift2 ${d.d}s ease-in-out ${i * 0.2}s infinite` }} />
          </g>
        ))}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12, pointerEvents: "none",
      }}>
        <div style={{ fontSize: 18, fontWeight: 200, color: "#fff", letterSpacing: "0.2em" }}>
          ORACLE is listening.
        </div>
        <div style={{ fontSize: 11, color: "#C49A2B" }}>
          Process your RFP to populate the intelligence graph.
        </div>
        {onJumpToSetup && (
          <button
            onClick={onJumpToSetup}
            style={{
              fontSize: 11, color: "#C49A2B", background: "transparent",
              border: "none", cursor: "pointer", pointerEvents: "auto",
              letterSpacing: 0.05,
            }}
          >
            Open Setup Wizard →
          </button>
        )}
      </div>
    </div>
  );
}
