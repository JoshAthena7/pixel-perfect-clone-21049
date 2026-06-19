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
import atlasWordmark from "@/assets/atlas-wordmark-optical.png";

const DOT_COUNT = 110;
const FIELD_W = 1800; // viewBox width — fills the sky
const FIELD_H = 1100;
const LINK_DISTANCE = 200;
const SESSION_KEY = "atlas_splash_shown";

// Timeline (ms)
const EXPAND_MS = 2800;   // stars drift outward and twinkle into place
const LINE_WINDOW_MS = 2400; // window over which lines progressively connect
const LINE_START_AT = 1800;  // lines begin drawing once enough stars exist
const LABEL_IN_AT = 4200; // ATLAS begins fading in after the sky fills + lines connect
const LABEL_FADE_MS = 1800;
const HOLD_AT = 6200;     // beat where everything sits, fully visible
const COLLAPSE_AT = 7000;
const GONE_AT = 9200;     // long, dramatic dim
const DONE_AT = 10000;

type Pos = { x: number; y: number; delay: number; r: number; twinkleDur: number; twinkleDelay: number };

function buildPositions(): Pos[] {
  const out: Pos[] = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 120 + Math.pow(Math.random(), 0.6) * (FIELD_W / 2 - 120);
    out.push({
      x: Math.cos(angle) * r * (0.95 + Math.random() * 0.1),
      y: Math.sin(angle) * r * 0.62 * (0.95 + Math.random() * 0.1),
      delay: Math.round(Math.random() * (EXPAND_MS - 600)),
      // Crisper, slightly varied star sizes. A few brighter "lead" stars.
      r: Math.random() < 0.15 ? 1.8 + Math.random() * 1.2 : 0.7 + Math.random() * 1.0,
      twinkleDur: 2200 + Math.random() * 2600,
      twinkleDelay: Math.round(Math.random() * 2000),
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
        links.push({ a: i, b: j, delay: 0 });
      }
    }
  }
  // Spread the line draws evenly across LINE_WINDOW_MS so the network
  // grows slowly and visibly rather than all at once.
  links.sort(() => Math.random() - 0.5);
  links.forEach((l, idx) => {
    l.delay = LINE_START_AT + Math.round((idx / Math.max(1, links.length - 1)) * LINE_WINDOW_MS);
  });
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
        transition: "opacity 800ms ease-out",
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
        <defs>
          <radialGradient id="atlas-star" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,236,180,1)" />
            <stop offset="35%" stopColor="rgba(229,189,90,0.95)" />
            <stop offset="100%" stopColor="rgba(196,154,43,0)" />
          </radialGradient>
        </defs>

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
              stroke="rgba(218,180,90,0.22)"
              strokeWidth={0.5}
              strokeLinecap="round"
              strokeDasharray={length}
              strokeDashoffset={collapsing ? length : 0}
              style={{
                opacity: collapsing ? 0 : 1,
                transition: collapsing
                  ? "opacity 1600ms ease-out, stroke-dashoffset 1800ms ease-out"
                  : `stroke-dashoffset 1600ms cubic-bezier(0.4,0,0.2,1) ${l.delay}ms, opacity 800ms ease-out ${l.delay}ms`,
              }}
            />
          );
        })}
        {positions.map((p, i) => (
          <g
            key={i}
            style={{
              transformOrigin: "0 0",
              opacity: collapsing ? 0 : 1,
              transition: collapsing
                ? "opacity 1800ms ease-in"
                : `opacity 1400ms ease-out ${p.delay}ms`,
            }}
          >
            {/* Soft glow halo */}
            <circle
              cx={collapsing ? 0 : p.x}
              cy={collapsing ? 0 : p.y}
              r={p.r * 4}
              fill="url(#atlas-star)"
              style={{
                opacity: 0.55,
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: collapsing
                  ? "none"
                  : `atlasTwinkle ${p.twinkleDur}ms ease-in-out ${p.twinkleDelay}ms infinite`,
                transition: collapsing
                  ? "cx 1800ms ease-in, cy 1800ms ease-in"
                  : `cx 2000ms cubic-bezier(0.16,0.84,0.3,1) ${p.delay}ms, cy 2000ms cubic-bezier(0.16,0.84,0.3,1) ${p.delay}ms`,
              }}
            />
            {/* Crisp star core */}
            <circle
              cx={collapsing ? 0 : p.x}
              cy={collapsing ? 0 : p.y}
              r={p.r}
              fill="rgba(255,243,210,0.98)"
              style={{
                transition: collapsing
                  ? "cx 1800ms ease-in, cy 1800ms ease-in"
                  : `cx 2000ms cubic-bezier(0.16,0.84,0.3,1) ${p.delay}ms, cy 2000ms cubic-bezier(0.16,0.84,0.3,1) ${p.delay}ms`,
              }}
            />
          </g>
        ))}
        {/* Final lingering core dot */}
        <circle
          cx={0}
          cy={0}
          r={2.5}
          fill="rgba(196,154,43,0.95)"
          style={{
            opacity: phase === "out" ? 1 : 0,
            transition: "opacity 1200ms ease-out",
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
        <img
          src={atlasWordmark}
          alt="ATLAS"
          draggable={false}
          style={{
            height: 56,
            width: "auto",
            objectFit: "contain",
            userSelect: "none",
            filter: "brightness(1.1) drop-shadow(0 0 28px rgba(196,154,43,0.35))",
            opacity: collapsing ? 0 : labelsIn ? 1 : 0,
            transform: labelsIn && !collapsing ? "translateY(0) scale(1)" : "translateY(8px) scale(0.985)",
            transition: collapsing
              ? "opacity 1600ms ease-out, transform 1600ms ease-out"
              : `opacity ${LABEL_FADE_MS}ms ease-out, transform ${LABEL_FADE_MS}ms ease-out`,
          }}
        />


        <div
          style={{
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.15em",
            color: "rgba(196,154,43,0.75)",
            opacity: collapsing ? 0 : labelsIn ? 1 : 0,
            transition: collapsing
              ? "opacity 1600ms ease-out"
              : `opacity ${LABEL_FADE_MS}ms ease-out 600ms`,
          }}
        >
          Carrying the mission.
        </div>
      </div>

      <style>{`
        @keyframes atlasTwinkle {
          0%, 100% { opacity: 0.25; transform: scale(0.85); }
          50%      { opacity: 0.85; transform: scale(1.15); }
        }
      `}</style>
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
