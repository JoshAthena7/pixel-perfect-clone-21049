import { useEffect, useState } from "react";
import { wisdomLine } from "@/lib/wisdom";

/**
 * DailyBell — a subtle once-per-UTC-day chime that fades in after The First
 * Light has finished, lingers briefly with a quiet IRIS line, then fades out.
 * Click dismisses immediately. Persisted per UTC day so refresh / navigation
 * doesn't re-trigger it.
 */

const STORAGE_KEY = "atlas.dailyBell.day";
const APPEAR_AFTER_MS = 3200; // after FirstLight (~2.8s)
const VISIBLE_MS = 6500;

function todayKey(): string {
  // Local calendar date — resets at each user's local midnight (DST-safe;
  // getFullYear/getMonth/getDate operate on wall-clock time).
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function DailyBell() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [line] = useState(() => wisdomLine("ambient"));

  useEffect(() => {
    if (typeof window === "undefined") return;
    let seen: string | null = null;
    try { seen = window.localStorage.getItem(STORAGE_KEY); } catch { /* noop */ }
    if (seen === todayKey()) return;

    // Reserve the slot up front so refresh during the appear delay won't
    // re-trigger the bell.
    try { window.localStorage.setItem(STORAGE_KEY, todayKey()); } catch { /* noop */ }

    const inT = window.setTimeout(() => setVisible(true), APPEAR_AFTER_MS);
    const outT = window.setTimeout(() => setLeaving(true), APPEAR_AFTER_MS + VISIBLE_MS);
    const doneT = window.setTimeout(() => setVisible(false), APPEAR_AFTER_MS + VISIBLE_MS + 900);

    return () => {
      window.clearTimeout(inT);
      window.clearTimeout(outT);
      window.clearTimeout(doneT);
    };
  }, []);

  if (!visible) return null;

  function dismiss() {
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 600);
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      className={`db-root ${leaving ? "db-leaving" : ""}`}
      aria-label="Dismiss daily note"
    >
      <span className="db-bell" aria-hidden>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M6 8a6 6 0 1112 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 18a2 2 0 004 0" strokeLinecap="round" />
        </svg>
        <span className="db-dot" />
      </span>
      <span className="db-text">{line}</span>
      <style>{`
        .db-root {
          position: fixed; top: 18px; right: 18px; z-index: 9996;
          display: inline-flex; align-items: center; gap: 10px;
          padding: 8px 14px 8px 12px;
          border-radius: 999px;
          background: rgba(10, 14, 28, 0.78);
          border: 1px solid rgba(245, 230, 184, 0.18);
          color: rgba(255,255,255,0.78);
          font-size: 12px; letter-spacing: 0.02em;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 10px 30px -12px rgba(0,0,0,0.6);
          cursor: pointer;
          animation: db-in 700ms ease-out both;
          max-width: min(420px, 70vw);
        }
        .db-root:hover { border-color: rgba(245, 230, 184, 0.35); color: rgba(255,255,255,0.92); }
        .db-leaving { animation: db-out 600ms ease-in both; }
        .db-bell { position: relative; display: inline-flex; color: #f5e6b8; }
        .db-dot {
          position: absolute; top: -1px; right: -1px;
          width: 6px; height: 6px; border-radius: 999px;
          background: #f5e6b8; box-shadow: 0 0 8px rgba(245,230,184,0.7);
          animation: db-pulse 2.4s ease-in-out infinite;
        }
        .db-text {
          font-style: italic;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        @keyframes db-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes db-out {
          from { opacity: 1; transform: none; }
          to   { opacity: 0; transform: translateY(-4px); }
        }
        @keyframes db-pulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.25); }
        }
        @media (prefers-reduced-motion: reduce) {
          .db-root, .db-leaving, .db-dot { animation: none !important; }
        }
      `}</style>
    </button>
  );
}
