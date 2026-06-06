import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

/* ────────────────────────────────────────────────────────────────────────── */
/* prefers-reduced-motion helper                                              */
/* ────────────────────────────────────────────────────────────────────────── */

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 1. AnimatedNumber — counts up from 0 over 800ms, ease-out                  */
/* ────────────────────────────────────────────────────────────────────────── */

export function AnimatedNumber({
  value,
  duration = 800,
  format,
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0));
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    fromRef.current = 0;
    startRef.current = null;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const formatted = format
    ? format(display)
    : Number.isInteger(value)
      ? Math.round(display).toLocaleString()
      : display.toFixed(1);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatted}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 2. IrisType — composes IRIS text character by character (default 18ms)    */
/* ────────────────────────────────────────────────────────────────────────── */

export function IrisType({
  text,
  speed = 18,
  className,
  as: As = "span",
  showCaret = false,
}: {
  text: string;
  speed?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  showCaret?: boolean;
}) {
  const [out, setOut] = useState(() => (prefersReducedMotion() ? text : ""));
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    if (text === lastRef.current) return;
    lastRef.current = text;

    if (prefersReducedMotion()) {
      setOut(text);
      return;
    }

    setOut("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed]);

  const done = out.length >= text.length;
  return (
    <As className={className}>
      {out}
      {showCaret && !done && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: "0.55ch",
            marginLeft: "1px",
            background: "currentColor",
            opacity: 0.7,
            animation: "iris-type-caret 1s steps(2) infinite",
          }}
        >
          &nbsp;
        </span>
      )}
      <style>{`
        @keyframes iris-type-caret {
          0%, 50% { opacity: 0.7; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </As>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 3. Constellation — ambient background dots + faint lines, 6% opacity      */
/* ────────────────────────────────────────────────────────────────────────── */

type Star = { x: number; y: number; r: number };

function generateStars(seed = 7, count = 70): Star[] {
  // Deterministic pseudo-random so SSR + client match
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, () => ({
    x: rand() * 1000,
    y: rand() * 600,
    r: 0.6 + rand() * 1.6,
  }));
}

function nearestPairs(stars: Star[], maxDist = 110): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const dx = stars[i].x - stars[j].x;
      const dy = stars[i].y - stars[j].y;
      if (Math.hypot(dx, dy) < maxDist) pairs.push([i, j]);
    }
  }
  return pairs.slice(0, 28);
}

export function Constellation({
  opacity = 0.06,
  className,
}: {
  opacity?: number;
  className?: string;
}) {
  const stars = useRef(generateStars()).current;
  const pairs = useRef(nearestPairs(stars)).current;

  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <svg
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
      >
        <g stroke="var(--athena-gold, #C49A22)" strokeWidth={0.4} fill="none">
          {pairs.map(([a, b], i) => (
            <line
              key={i}
              x1={stars[a].x}
              y1={stars[a].y}
              x2={stars[b].x}
              y2={stars[b].y}
            />
          ))}
        </g>
        <g fill="var(--athena-gold, #C49A22)">
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 4. GoldEntryLine — sweeps a thin gold line across the top on route change */
/* ────────────────────────────────────────────────────────────────────────── */

export function GoldEntryLine() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sweepKey, setSweepKey] = useState(0);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
    }
    setSweepKey((k) => k + 1);
  }, [pathname]);

  if (prefersReducedMotion()) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        pointerEvents: "none",
        zIndex: 100,
        overflow: "hidden",
      }}
    >
      <div
        key={sweepKey}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: "35%",
          background:
            "linear-gradient(90deg, transparent 0%, var(--athena-gold, #C49A22) 50%, transparent 100%)",
          boxShadow: "0 0 8px var(--athena-gold-glow, rgba(196,154,34,0.45))",
          animation: "gold-entry-sweep 300ms ease-out forwards",
        }}
      />
      <style>{`
        @keyframes gold-entry-sweep {
          0%   { transform: translateX(-40%); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateX(285%); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* helper: wrap children to expose ReactNode typing                           */
/* ────────────────────────────────────────────────────────────────────────── */

export function PolishLayer({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
