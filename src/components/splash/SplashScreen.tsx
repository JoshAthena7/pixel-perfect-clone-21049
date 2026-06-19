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

const DOT_COUNT = 90;
const FIELD_W = 1800; // viewBox width — fills the sky
const FIELD_H = 1100;
const LINK_DISTANCE = 180;
const SESSION_KEY = "atlas_splash_shown";

// Timeline (ms)
const EXPAND_MS = 2200;   // stars drift outward and fill the sky
const LABEL_IN_AT = 2400; // ATLAS begins fading in after the sky has filled
const LABEL_FADE_MS = 1600;
const HOLD_AT = 4400;     // beat where everything sits, fully visible
const COLLAPSE_AT = 5200;
const GONE_AT = 5900;
const DONE_AT = 6200;

type Pos = { x: number; y: number; delay: number; r: number };

function buildPositions(): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    // Spread across the full field with a soft bias away from dead-center
    // (so the wordmark has breathing room) but still allow some near-center
    // stars to anchor the constellation.
    const angle = Math.random() * Math.PI * 2;
    const r = 120 + Math.pow(Math.random(), 0.6) * (FIELD_W / 2 - 120);
    out.push({
      x: Math.cos(angle) * r * (0.95 + Math.random() * 0.1),
      y: Math.sin(angle) * r * 0.62 * (0.95 + Math.random() * 0.1), // squash vertically toward sky aspect
      // Long staggered delays — stars appear gradually, not in a burst.
      delay: Math.round(Math.random() * (EXPAND_MS - 600)),
      r: 1.2 + Math.random() * 1.6,
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
        const delay = Math.max(positions[i].delay, positions[j].delay) + 400;
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
    rafRef.current = requestAnimationFrame(() => {
      // initial paint at (0,0); CSS transitions carry to final positions
    });
    const t1 = setTimeout(() => setLabelsIn(true), LABEL_IN_AT);
    const t2 = setTimeout(() => setPhase("out"), COLLAPSE_AT);
    const t3 = setTimeout(() => setPhase("gone"), GONE_AT);
    const t4 = setTimeout(() => onDone(), DONE_AT);
    // touch HOLD_AT so lints don't complain about unused constant
    void HOLD_AT;
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
        viewBox={`-${FIELD_W / 2} -${FIELD_H / 2} ${FIELD_W} ${FIELD_H}`}
        preserveAspectRatio="xMidYMid slice"
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
              stroke="rgba(196,154,43,0.18)"
              strokeWidth={0.6}
              strokeDasharray={length}
              strokeDashoffset={collapsing ? length : 0}
              style={{
                opacity: collapsing ? 0 : 1,
                transition: collapsing
                  ? "opacity 500ms ease-out, stroke-dashoffset 500ms ease-out"
                  : `stroke-dashoffset 1100ms ease-out ${l.delay}ms, opacity 600ms ease-out ${l.delay}ms`,
              }}
            />
          );
        })}
        {positions.map((p, i) => (
          <circle
            key={i}
            cx={collapsing ? 0 : p.x}
            cy={collapsing ? 0 : p.y}
            r={p.r}
            fill="rgba(196,154,43,0.9)"
            style={{
              opacity: collapsing ? 0 : 1,
              transition: collapsing
                ? "cx 600ms ease-in, cy 600ms ease-in, opacity 600ms ease-in"
                : `cx 1800ms cubic-bezier(0.16,0.84,0.3,1) ${p.delay}ms, cy 1800ms cubic-bezier(0.16,0.84,0.3,1) ${p.delay}ms, opacity 1200ms ease-out ${p.delay}ms`,
              filter: "drop-shadow(0 0 2px rgba(196,154,43,0.5))",
            }}
          />
        ))}
        {/* Final lingering core dot */}
        <circle
          cx={0}
          cy={0}
          r={2.5}
          fill="rgba(196,154,43,0.95)"
          style={{
            opacity: phase === "out" ? 1 : 0,
            transition: "opacity 300ms ease-out",
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
            fontSize: 36,
            fontWeight: 200,
            letterSpacing: "0.4em",
            color: "rgba(255,255,255,0.95)",
            opacity: collapsing ? 0 : labelsIn ? 1 : 0,
            transform: labelsIn && !collapsing ? "translateY(0)" : "translateY(6px)",
            textShadow: "0 0 24px rgba(196,154,43,0.25)",
            transition: collapsing
              ? "opacity 500ms ease-out"
              : `opacity ${LABEL_FADE_MS}ms ease-out, transform ${LABEL_FADE_MS}ms ease-out`,
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
      const force = new URLSearchParams(window.location.search).get("splash") === "1";
      if (!force && sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "true");
      setShow(true);
    } catch {
      // sessionStorage unavailable — silently skip splash.
    }
  }, []);

  if (!show) return null;
  return <SplashScreen onDone={() => setShow(false)} />;
}
