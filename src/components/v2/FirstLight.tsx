import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dailyWisdomLine } from "@/lib/wisdom";

/**
 * FirstLight — the once-per-day arrival moment. The first time the user
 * lands inside the authenticated shell on any given UTC day, a soft ATLAS
 * frame fades in with a personal greeting and the day's wisdom line, then
 * dissolves after ~2.8s. Subsequent visits the same day are silent.
 *
 * Mirrors the closing frame visually so sign-out / sign-in feel like one
 * continuous room.
 */

const STORAGE_KEY = "atlas.firstLight.day";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(raw: string): string {
  const t = raw.trim();
  if (!t) return "friend";
  const head = t.split(/[\s.@]+/)[0];
  return head.charAt(0).toUpperCase() + head.slice(1);
}

function todayKey(): string {
  // Local calendar date — resets at each user's local midnight (DST-safe;
  // getFullYear/getMonth/getDate operate on wall-clock time).
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function FirstLight() {
  const [active, setActive] = useState(false);
  const [name, setName] = useState("friend");
  const [line] = useState(() => dailyWisdomLine("ambient"));

  useEffect(() => {
    let alive = true;
    try {
      if (typeof window === "undefined") return;
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (seen === todayKey()) return;

      // Reserve the slot up front so a fast refresh/navigation during the
      // 2.8s window can't cause a second play.
      try { window.localStorage.setItem(STORAGE_KEY, todayKey()); } catch { /* noop */ }

      supabase.auth.getUser().then(({ data }) => {
        if (!alive || !data.user) return;
        const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
        const src = meta.full_name || meta.name || data.user.email || "";
        setName(firstName(src));
        setActive(true);
        window.setTimeout(() => { if (alive) setActive(false); }, 2800);
      });
    } catch { /* noop */ }
    return () => { alive = false; };
  }, []);

  if (!active) return null;

  return (
    <div className="fl-root" role="status" aria-live="polite">
      <div className="fl-center">
        <div className="fl-mark">ATLAS</div>
        <div className="fl-rule" />
        <div className="fl-greet">{timeGreeting()}, {name}.</div>
        <div className="fl-line">{line}</div>
      </div>
      <style>{`
        .fl-root {
          position: fixed; inset: 0; z-index: 9997;
          background: #000;
          display: flex; align-items: center; justify-content: center;
          animation: fl-in 500ms ease-out both, fl-out 700ms ease-in 2100ms both;
        }
        .fl-center {
          display: flex; flex-direction: column; align-items: center; gap: 18px;
          padding: 0 24px; text-align: center;
        }
        .fl-mark {
          font-family: ui-serif, Georgia, "Times New Roman", serif;
          font-size: clamp(34px, 5.5vw, 58px);
          letter-spacing: 0.42em;
          color: #f5e6b8;
          text-shadow: 0 0 40px rgba(245, 230, 184, 0.25);
          animation: fl-mark 1400ms ease-out both;
        }
        .fl-rule {
          width: 72px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(245,230,184,0.55), transparent);
          animation: fl-rule 1400ms ease-out 200ms both;
        }
        .fl-greet {
          color: rgba(255,255,255,0.85);
          font-size: clamp(15px, 1.7vw, 18px);
          letter-spacing: 0.04em;
          animation: fl-line 1000ms ease-out 400ms both;
        }
        .fl-line {
          font-style: italic;
          color: rgba(255,255,255,0.55);
          font-size: clamp(13px, 1.5vw, 16px);
          letter-spacing: 0.02em;
          max-width: 540px;
          animation: fl-line 1000ms ease-out 700ms both;
        }
        @keyframes fl-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fl-out { to { opacity: 0; } }
        @keyframes fl-mark {
          from { opacity: 0; letter-spacing: 0.6em; }
          to   { opacity: 1; letter-spacing: 0.42em; }
        }
        @keyframes fl-rule { from { width: 0; opacity: 0; } to { width: 72px; opacity: 1; } }
        @keyframes fl-line { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .fl-root, .fl-mark, .fl-rule, .fl-greet, .fl-line { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
