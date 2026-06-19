/**
 * ATLAS Constellation Load Screen.
 *
 * Full-viewport splash shown once per browser session (gated by
 * sessionStorage 'atlas_splash_shown'). Renders 28 gold dots emanating
 * from center, connecting lines between nearby dots, and the ATLAS
 * wordmark + tagline, then collapses back to a single point and exits.
 *
 * Pure presentation: never blocks auth or data fetching — it sits on top
 * of whatever page is rendering underneath and removes itself when its
 * own 2.5s timeline finishes.
 */
import { useEffect, useMemo, useRef, useState } from "react";

const DOT_COUNT = 28;
const RADIUS = 280;
const LINK_DISTANCE = 120;
const SESSION_KEY = "atlas_splash_shown";

type Pos = { x: number; y: number; delay: number };

function buildPositions(): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    const baseAngle = (i / DOT_COUNT) * Math.PI * 2;
    const angle = baseAngle + (Math.random() - 0.5) * 0.45;
    const r = RADIUS * (0.45 + Math.random() * 0.55);
    out.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      delay: Math.round(Math.random() * 600),
    });
  }
  return out;
}

function buildLinks(positions: Pos[]) {
  const links: { a: number; b: number; delay: number }[] = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dx = positions[i].x - positions[j].x;
      const dy = positions[i].y - positions[j].y;
      const d = Math.hypot(dx, dy);
      if (d <= LINK_DISTANCE) {
        const delay = Math.max(positions[i].delay, positions[j].delay) + 250;
        links.push({ a: i, b: j, delay });
      }
    }
  }
  return links;
}

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const positions = useMemo(buildPositions, []);
  const links = useMemo(() => buildLinks(positions), [positions]);
  // 'in' = expanding outward, 'out' = collapsing back, 'gone' = faded.
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");
  const [labelsIn, setLabelsIn] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Use rAF so the initial translate(0,0) paints before we flip to the
    // outward translate — guarantees the transition runs.
    rafRef.current = requestAnimationFrame(() => {
      // no-op; CSS transitions kick in from initial style → applied style
    });
    const t1 = setTimeout(() => setLabelsIn(true), 1400);
    const t2 = setTimeout(() => setPhase("out"), 2000);
    const t3 = setTimeout(() => setPhase("gone"), 2300);
    const t4 = setTimeout(() => onDone(), 2500);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onDone]);

  const collapsing = phase === "out" || phase === "gone";
  const overlayOpacity = phase === "gone" ? 0 : 1;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000",
        opacity: overlayOpacity,
        transition: "opacity 150ms ease-out",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, display: "block" }}
        viewBox="-500 -500 1000 1000"
        preserveAspectRatio="xMidYMid meet"
      >
        {links.map((l, i) => {
          const a = positions[l.a];
          const b = positions[l.b];
          const length = Math.hypot(a.x - b.x, a.y - b.y);
          return (
            <line
              key={i}
              x1={collapsing ? 0 : a.x}
              y1={collapsing ? 0 : a.y}
              x2={collapsing ? 0 : b.x}
              y2={collapsing ? 0 : b.y}
              stroke="rgba(196,154,43,0.22)"
              strokeWidth={0.8}
              strokeDasharray={length}
              strokeDashoffset={collapsing ? length : 0}
              style={{
                opacity: collapsing ? 0 : 1,
                transition: collapsing
                  ? "opacity 200ms ease-out, stroke-dashoffset 200ms ease-out"
                  : `stroke-dashoffset 400ms ease-out ${l.delay}ms, opacity 200ms ease-out ${l.delay}ms`,
              }}
            />
          );
        })}
        {positions.map((p, i) => (
          <circle
            key={i}
            cx={collapsing ? 0 : p.x}
            cy={collapsing ? 0 : p.y}
            r={1.5}
            fill="rgba(196,154,43,0.85)"
            style={{
              opacity: collapsing ? 0 : 1,
              transition: collapsing
                ? "cx 300ms ease-in, cy 300ms ease-in, opacity 300ms ease-in"
                : `cx 900ms cubic-bezier(0.22,0.61,0.36,1) ${p.delay}ms, cy 900ms cubic-bezier(0.22,0.61,0.36,1) ${p.delay}ms, opacity 600ms ease-out ${p.delay}ms`,
            }}
          />
        ))}
        {/* Final lingering core dot */}
        <circle
          cx={0}
          cy={0}
          r={2}
          fill="rgba(196,154,43,0.95)"
          style={{
            opacity: phase === "out" ? 1 : phase === "gone" ? 0 : 0,
            transition: "opacity 200ms ease-out",
          }}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
            fontSize: 32,
            fontWeight: 200,
            letterSpacing: "0.35em",
            color: "rgba(255,255,255,0.95)",
            opacity: collapsing ? 0 : labelsIn ? 1 : 0,
            transition: collapsing
              ? "opacity 200ms ease-out"
              : "opacity 400ms ease-out",
          }}
        >
          ATLAS
        </div>
        <div
          style={{
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.15em",
            color: "rgba(196,154,43,0.75)",
            opacity: collapsing ? 0 : labelsIn ? 1 : 0,
            transition: collapsing
              ? "opacity 200ms ease-out"
              : "opacity 400ms ease-out 100ms",
          }}
        >
          Carrying the mission.
        </div>
      </div>
    </div>
  );
}

export function SplashGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "true");
      setShow(true);
    } catch {
      // sessionStorage unavailable — silently skip splash.
    }
  }, []);

  if (!show) return null;
  return <SplashScreen onDone={() => setShow(false)} />;
}
