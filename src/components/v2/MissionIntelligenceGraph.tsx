import { useEffect, useMemo, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────────────── */
/* Data model                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

type NodeKind =
  | "mission"
  | "stakeholder"
  | "agency"
  | "incumbent"
  | "policy"
  | "service"
  | "constituent"
  | "risk"
  | "winTheme"
  | "deadline";

type GraphNode = {
  id: string;
  label: string;
  kind: NodeKind;
  /** 0–1 — drives node size and orbital radius (high importance = closer to center). */
  importance: number;
  /** 0–1 — drives glow strength. Win themes spike this. */
  signal: number;
  summary: string;
  /** Fixed angle on the orbit, in radians. */
  angle: number;
  /** Orbit ring (0 = center, 1 = inner, 2 = mid, 3 = outer). */
  ring: number;
};

type Edge = { a: string; b: string; weight: number };

const NODES: GraphNode[] = [
  {
    id: "mission",
    label: "NJ CSOC 2026",
    kind: "mission",
    importance: 1,
    signal: 0.95,
    summary:
      "The mission. Statewide Children's System of Care contract — re-procurement underway.",
    angle: 0,
    ring: 0,
  },
  // Inner ring — direct stakeholders & decision authority
  {
    id: "governor",
    label: "Gov. Murphy",
    kind: "stakeholder",
    importance: 0.92,
    signal: 0.7,
    summary:
      "Sets the policy mandate. Family-driven care is a stated administration priority.",
    angle: 0,
    ring: 1,
  },
  {
    id: "dcf",
    label: "NJ DCF",
    kind: "agency",
    importance: 0.95,
    signal: 0.75,
    summary:
      "NJ Department of Children & Families — the contracting authority issuing the RFP.",
    angle: Math.PI * 0.5,
    ring: 1,
  },
  {
    id: "csoc",
    label: "CSOC",
    kind: "agency",
    importance: 0.9,
    signal: 0.72,
    summary:
      "Children's System of Care — the operating division evaluating the response.",
    angle: Math.PI,
    ring: 1,
  },
  {
    id: "performcare",
    label: "PerformCare",
    kind: "incumbent",
    importance: 0.88,
    signal: 0.65,
    summary:
      "Incumbent contracted system administrator (AmeriHealth Caritas). The target to displace.",
    angle: Math.PI * 1.5,
    ring: 1,
  },
  // Mid ring — policy & service architecture
  {
    id: "waiver",
    label: "1115 Waiver",
    kind: "policy",
    importance: 0.78,
    signal: 0.6,
    summary:
      "Federal Medicaid 1115 waiver shaping eligible services and funding flows.",
    angle: Math.PI * 0.25,
    ring: 2,
  },
  {
    id: "wraparound",
    label: "Wraparound Services",
    kind: "service",
    importance: 0.72,
    signal: 0.55,
    summary:
      "Core service model — coordinated, family-centered behavioral health support.",
    angle: Math.PI * 0.75,
    ring: 2,
  },
  {
    id: "fso",
    label: "Family Support Orgs",
    kind: "constituent",
    importance: 0.65,
    signal: 0.5,
    summary:
      "Family Support Organizations — peer-led partners CSOC funds in every county.",
    angle: Math.PI * 1.25,
    ring: 2,
  },
  {
    id: "workforce",
    label: "Provider Workforce Crisis",
    kind: "risk",
    importance: 0.7,
    signal: 0.85, // hot signal
    summary:
      "Statewide behavioral-health workforce shortage — the dominant operational risk.",
    angle: Math.PI * 1.75,
    ring: 2,
  },
  // Outer ring — win themes + deadline
  {
    id: "wt-family",
    label: "Win Theme · Family-Driven Care",
    kind: "winTheme",
    importance: 0.62,
    signal: 0.92, // strong theme — glows brightest
    summary:
      "Win theme: every decision begins with the family voice. Strongest alignment to administration intent.",
    angle: Math.PI * 0.15,
    ring: 3,
  },
  {
    id: "wt-operator",
    label: "Win Theme · Mission-Matched Operator",
    kind: "winTheme",
    importance: 0.6,
    signal: 0.88,
    summary:
      "Win theme: a mission-matched operator, not a generic MCO. Differentiator vs. incumbent.",
    angle: Math.PI * 0.85,
    ring: 3,
  },
  {
    id: "wt-evolution",
    label: "Win Theme · Operational Evolution",
    kind: "winTheme",
    importance: 0.58,
    signal: 0.84,
    summary:
      "Win theme: continuity plus measurable evolution. Reduces transition risk in evaluators' minds.",
    angle: Math.PI * 1.15,
    ring: 3,
  },
  {
    id: "deadline",
    label: "RFP Submission",
    kind: "deadline",
    importance: 0.68,
    signal: 0.78,
    summary:
      "The hard date. Every node on this graph collapses into a single bound submission.",
    angle: Math.PI * 1.85,
    ring: 3,
  },
];

const EDGES: Edge[] = [
  // Mission hub
  { a: "mission", b: "dcf", weight: 1 },
  { a: "mission", b: "csoc", weight: 1 },
  { a: "mission", b: "governor", weight: 0.9 },
  { a: "mission", b: "performcare", weight: 0.85 },
  { a: "mission", b: "deadline", weight: 1 },
  // Policy lattice
  { a: "governor", b: "dcf", weight: 0.8 },
  { a: "dcf", b: "csoc", weight: 0.95 },
  { a: "csoc", b: "performcare", weight: 0.8 },
  { a: "csoc", b: "waiver", weight: 0.7 },
  { a: "waiver", b: "wraparound", weight: 0.7 },
  { a: "csoc", b: "wraparound", weight: 0.8 },
  { a: "csoc", b: "fso", weight: 0.75 },
  { a: "wraparound", b: "fso", weight: 0.6 },
  { a: "wraparound", b: "workforce", weight: 0.7 },
  { a: "performcare", b: "workforce", weight: 0.65 },
  // Win themes connect to their evidence
  { a: "wt-family", b: "governor", weight: 0.7 },
  { a: "wt-family", b: "fso", weight: 0.75 },
  { a: "wt-family", b: "wraparound", weight: 0.7 },
  { a: "wt-operator", b: "performcare", weight: 0.6 },
  { a: "wt-operator", b: "csoc", weight: 0.75 },
  { a: "wt-evolution", b: "workforce", weight: 0.7 },
  { a: "wt-evolution", b: "waiver", weight: 0.55 },
  { a: "wt-evolution", b: "csoc", weight: 0.65 },
  // Themes feed the submission
  { a: "wt-family", b: "deadline", weight: 0.5 },
  { a: "wt-operator", b: "deadline", weight: 0.5 },
  { a: "wt-evolution", b: "deadline", weight: 0.5 },
];

/* ────────────────────────────────────────────────────────────────────────── */
/* Geometry                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

const VIEW_W = 1400;
const VIEW_H = 560;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;
const RING_RADII = [0, 130, 240, 350];

function nodeXY(n: GraphNode, rotation: number) {
  const r = RING_RADII[n.ring];
  // squash vertically a touch so it reads as a planar field, not a perfect disk
  const a = n.angle + (n.ring === 0 ? 0 : rotation);
  return {
    x: CENTER_X + Math.cos(a) * r,
    y: CENTER_Y + Math.sin(a) * r * 0.62,
  };
}

function nodeRadius(n: GraphNode) {
  return 4 + n.importance * 12;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Component                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

export function MissionIntelligenceGraph() {
  const [rotation, setRotation] = useState(0);
  const [pulse, setPulse] = useState(0); // 0–1 traveling along edges
  const [hoverId, setHoverId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let mounted = true;
    const start = performance.now();
    const tick = (now: number) => {
      if (!mounted) return;
      const t = (now - start) / 1000;
      // ~ one full rotation every ~120s — "never stops moving" but barely perceptible
      setRotation((t * (Math.PI * 2)) / 120);
      // pulse traverses every 3.6s
      setPulse((t / 3.6) % 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const positioned = useMemo(
    () => NODES.map((n) => ({ node: n, ...nodeXY(n, rotation) })),
    [rotation],
  );
  const byId = useMemo(() => {
    const m = new Map<string, (typeof positioned)[number]>();
    positioned.forEach((p) => m.set(p.node.id, p));
    return m;
  }, [positioned]);

  const neighborSet = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    EDGES.forEach((e) => {
      if (e.a === hoverId) set.add(e.b);
      if (e.b === hoverId) set.add(e.a);
    });
    return set;
  }, [hoverId]);

  const hovered = hoverId ? byId.get(hoverId) ?? null : null;

  return (
    <section
      aria-label="Mission Intelligence Graph"
      className="relative w-full overflow-hidden border-y border-[color:var(--athena-gold,#C49A22)]/15 bg-[#06080f]"
      style={{
        background:
          "radial-gradient(ellipse at center, #0c1220 0%, #060810 55%, #04060d 100%)",
      }}
    >
      {/* Faint star field */}
      <StarField />

      {/* Header strip */}
      <div className="relative z-10 flex items-center justify-between gap-4 px-6 pt-4 pb-1 sm:px-10">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--athena-gold,#C49A22)]/80">
            Mission Intelligence Graph
          </div>
          <h2
            className="mt-1 text-lg font-medium text-white/90"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            NJ CSOC 2026 · Powered by IRIS
          </h2>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-white/40">
          <LegendDot color="#FFFFFF" /> Entity
          <LegendDot color="#C49A22" /> Win theme
          <LegendDot color="#7AB8FF" /> Live signal
        </div>
      </div>

      {/* Graph */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-[420px] w-full sm:h-[480px] md:h-[520px]"
          role="img"
          aria-label="Interactive network of mission entities, stakeholders, win themes, and the RFP deadline."
        >
          <defs>
            <radialGradient id="mig-node-white" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="mig-node-gold" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFE6A0" stopOpacity="1" />
              <stop offset="55%" stopColor="#C49A22" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#C49A22" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="mig-node-signal" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#BFE0FF" stopOpacity="1" />
              <stop offset="55%" stopColor="#7AB8FF" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#7AB8FF" stopOpacity="0" />
            </radialGradient>
            <filter id="mig-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges */}
          <g>
            {EDGES.map((e, i) => {
              const A = byId.get(e.a);
              const B = byId.get(e.b);
              if (!A || !B) return null;
              const dim =
                neighborSet && !(neighborSet.has(e.a) && neighborSet.has(e.b));
              const baseOp = 0.08 + e.weight * 0.18;
              return (
                <g key={i} opacity={dim ? 0.08 : 1}>
                  <line
                    x1={A.x}
                    y1={A.y}
                    x2={B.x}
                    y2={B.y}
                    stroke="#C49A22"
                    strokeOpacity={baseOp}
                    strokeWidth={0.6 + e.weight * 0.6}
                  />
                  {/* travelling pulse — a short bright segment */}
                  <PulseSegment
                    x1={A.x}
                    y1={A.y}
                    x2={B.x}
                    y2={B.y}
                    phase={(pulse + i * 0.07) % 1}
                  />
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {positioned.map(({ node, x, y }) => {
              const r = nodeRadius(node);
              const isHovered = hoverId === node.id;
              const dim = neighborSet ? !neighborSet.has(node.id) : false;
              const isGold = node.kind === "winTheme" || node.kind === "mission";
              const isSignal = node.kind === "risk" || node.kind === "deadline";
              const fillId = isGold
                ? "url(#mig-node-gold)"
                : isSignal
                  ? "url(#mig-node-signal)"
                  : "url(#mig-node-white)";
              const glowR = r * (2.6 + node.signal * 1.4);
              return (
                <g
                  key={node.id}
                  opacity={dim ? 0.25 : 1}
                  style={{ transition: "opacity 220ms ease" }}
                  onMouseEnter={() => setHoverId(node.id)}
                  onMouseLeave={() => setHoverId((cur) => (cur === node.id ? null : cur))}
                  onFocus={() => setHoverId(node.id)}
                  onBlur={() => setHoverId((cur) => (cur === node.id ? null : cur))}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.label}. ${node.summary}`}
                >
                  {/* outer halo */}
                  <circle cx={x} cy={y} r={glowR} fill={fillId} opacity={0.55} />
                  {/* core */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? r * 1.45 : r}
                    fill={isGold ? "#FFE6A0" : isSignal ? "#BFE0FF" : "#ffffff"}
                    filter="url(#mig-glow)"
                    style={{ transition: "r 220ms ease" }}
                  />
                  {/* always-on micro label for big nodes */}
                  {node.importance >= 0.85 && !isHovered && (
                    <text
                      x={x}
                      y={y + r + 14}
                      textAnchor="middle"
                      fill="#ffffff"
                      fillOpacity={0.55}
                      fontSize="10"
                      style={{
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        pointerEvents: "none",
                      }}
                    >
                      {node.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover card overlay */}
        {hovered && <HoverCard node={hovered.node} x={hovered.x} y={hovered.y} />}
      </div>

      {/* Footer caption */}
      <div className="relative z-10 flex items-center justify-between gap-4 px-6 pb-4 pt-1 sm:px-10">
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">
          {NODES.length} entities · {EDGES.length} links · live
        </div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/30">
          Hover any node
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

function LegendDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

function PulseSegment({
  x1,
  y1,
  x2,
  y2,
  phase,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  phase: number;
}) {
  // Render a short bright dash partway along the line.
  const head = Math.min(1, phase + 0.05);
  const tail = Math.max(0, phase - 0.05);
  const hx = x1 + (x2 - x1) * head;
  const hy = y1 + (y2 - y1) * head;
  const tx = x1 + (x2 - x1) * tail;
  const ty = y1 + (y2 - y1) * tail;
  const fade = Math.sin(phase * Math.PI); // brightest in the middle
  return (
    <line
      x1={tx}
      y1={ty}
      x2={hx}
      y2={hy}
      stroke="#FFE6A0"
      strokeOpacity={0.55 * fade}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  );
}

function HoverCard({
  node,
  x,
  y,
}: {
  node: GraphNode;
  x: number;
  y: number;
}) {
  // Position card relative to SVG viewbox — translate into % of container
  const leftPct = (x / VIEW_W) * 100;
  const topPct = (y / VIEW_H) * 100;
  const flipRight = leftPct > 65;
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[280px] -translate-y-1/2 rounded-md border border-[color:var(--athena-gold,#C49A22)]/40 bg-[#0a0f1c]/95 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.6)] backdrop-blur-sm"
      style={{
        left: `${flipRight ? leftPct - 2 : leftPct + 2}%`,
        top: `${topPct}%`,
        transform: flipRight
          ? "translate(-100%, -50%)"
          : "translate(0, -50%)",
      }}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[color:var(--athena-gold,#C49A22)]/80">
        {kindLabel(node.kind)}
      </div>
      <div className="mt-0.5 text-sm font-medium text-white/95">{node.label}</div>
      <div className="mt-1 text-xs leading-snug text-white/65">{node.summary}</div>
    </div>
  );
}

function kindLabel(k: NodeKind): string {
  switch (k) {
    case "mission":
      return "Mission";
    case "stakeholder":
      return "Stakeholder";
    case "agency":
      return "Agency";
    case "incumbent":
      return "Incumbent";
    case "policy":
      return "Policy";
    case "service":
      return "Service model";
    case "constituent":
      return "Constituent partner";
    case "risk":
      return "Risk signal";
    case "winTheme":
      return "Win theme";
    case "deadline":
      return "Deadline";
  }
}

/* Sparse deterministic star field — independent of Constellation. */
function StarField() {
  const stars = useMemo(() => {
    const out: { x: number; y: number; r: number; o: number }[] = [];
    let seed = 17;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 90; i++) {
      out.push({
        x: rand() * 100,
        y: rand() * 100,
        r: 0.4 + rand() * 1.1,
        o: 0.15 + rand() * 0.35,
      });
    }
    return out;
  }, []);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r * 0.18}
          fill="#ffffff"
          opacity={s.o}
        />
      ))}
    </svg>
  );
}
