import { useEffect, useRef, useState } from "react";
import { wisdomLine } from "@/lib/wisdom";

/**
 * IdleCurtain — after IDLE_MS of no input, fade in a soft ATLAS frame with
 * a rotating wisdom line. Any user input dismisses it. Mirrors the closing
 * frame visually but is non-destructive — it does NOT sign anyone out.
 *
 * Mounted globally inside the authenticated layout.
 */

const IDLE_MS = 5 * 60 * 1000; // 5 minutes
const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;

export function IdleCurtain() {
  const [idle, setIdle] = useState(false);
  const [line, setLine] = useState(() => wisdomLine("ambient"));
  const timer = useRef<number | null>(null);

  useEffect(() => {
    function arm() {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setLine(wisdomLine("ambient"));
        setIdle(true);
      }, IDLE_MS);
    }

    function onActivity() {
      if (idle) setIdle(false);
      arm();
    }

    arm();
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onActivity);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onActivity);
    };
  }, [idle]);

  if (!idle) return null;

  return (
    <div className="ic-root" aria-hidden>
      <div className="ic-center">
        <div className="ic-mark">ATLAS</div>
        <div className="ic-rule" />
        <div className="ic-line">{line}</div>
        <div className="ic-hint">Move to return</div>
      </div>
      <style>{`
        .ic-root {
          position: fixed; inset: 0; z-index: 9998;
          background: rgba(2, 4, 10, 0.86);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          animation: ic-in 1200ms ease-out both;
        }
        .ic-center {
          display: flex; flex-direction: column; align-items: center; gap: 20px;
          padding: 0 24px; text-align: center;
        }
        .ic-mark {
          font-family: ui-serif, Georgia, "Times New Roman", serif;
          font-size: clamp(30px, 5vw, 52px);
          letter-spacing: 0.42em;
          color: #f5e6b8;
          text-shadow: 0 0 40px rgba(245, 230, 184, 0.22);
        }
        .ic-rule {
          width: 64px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(245,230,184,0.5), transparent);
        }
        .ic-line {
          font-style: italic;
          color: rgba(255,255,255,0.55);
          font-size: clamp(13px, 1.5vw, 16px);
          letter-spacing: 0.02em;
          max-width: 540px;
        }
        .ic-hint {
          margin-top: 12px;
          font-size: 10px; letter-spacing: 0.32em; text-transform: uppercase;
          color: rgba(255,255,255,0.28);
        }
        @keyframes ic-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .ic-root { animation: none; }
        }
      `}</style>
    </div>
  );
}
