import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Rotating wisdom lines — IRIS speaking quietly as the room dims.
const WISDOM = [
  "The Collective is still here.",
  "The room stays lit.",
  "Your work continues, even in your absence.",
  "Return when you're ready. We'll be here.",
  "The signal holds.",
];

/**
 * ClosingFrame — atmospheric sign-out moment.
 * Listens for the global `atlas:closing-frame` event. When fired, it overlays
 * a full-screen scene (ATLAS wordmark + a single wisdom line) for ~2.6s,
 * then performs the actual sign-out.
 */
export function ClosingFrame() {
  const [active, setActive] = useState(false);
  const [line, setLine] = useState(WISDOM[0]);

  useEffect(() => {
    function onClose() {
      setLine(WISDOM[Math.floor(Math.random() * WISDOM.length)]);
      setActive(true);
      // Let the frame breathe, then sign out. Auth redirect takes over.
      window.setTimeout(() => {
        supabase.auth.signOut();
      }, 2400);
    }
    window.addEventListener("atlas:closing-frame", onClose);
    return () => window.removeEventListener("atlas:closing-frame", onClose);
  }, []);

  if (!active) return null;

  return (
    <div className="cf-root" role="status" aria-live="polite">
      <div className="cf-center">
        <div className="cf-mark">ATLAS</div>
        <div className="cf-rule" />
        <div className="cf-line">{line}</div>
      </div>
      <style>{`
        .cf-root {
          position: fixed; inset: 0; z-index: 9999;
          background: #000;
          display: flex; align-items: center; justify-content: center;
          animation: cf-in 600ms ease-out both;
        }
        .cf-center {
          display: flex; flex-direction: column; align-items: center; gap: 22px;
          padding: 0 24px; text-align: center;
        }
        .cf-mark {
          font-family: ui-serif, Georgia, "Times New Roman", serif;
          font-size: clamp(36px, 6vw, 64px);
          letter-spacing: 0.42em;
          color: #f5e6b8;
          text-shadow: 0 0 40px rgba(245, 230, 184, 0.25);
          animation: cf-mark 1400ms ease-out both;
        }
        .cf-rule {
          width: 80px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(245,230,184,0.55), transparent);
          animation: cf-rule 1600ms ease-out 200ms both;
        }
        .cf-line {
          font-style: italic;
          color: rgba(255,255,255,0.62);
          font-size: clamp(14px, 1.6vw, 17px);
          letter-spacing: 0.02em;
          animation: cf-line 1400ms ease-out 500ms both;
        }
        @keyframes cf-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cf-mark {
          from { opacity: 0; letter-spacing: 0.6em; }
          to   { opacity: 1; letter-spacing: 0.42em; }
        }
        @keyframes cf-rule { from { width: 0; opacity: 0; } to { width: 80px; opacity: 1; } }
        @keyframes cf-line { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .cf-root, .cf-mark, .cf-rule, .cf-line { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

/** Fire the closing frame; ClosingFrame handles the sign-out itself. */
export function triggerClosingFrame() {
  window.dispatchEvent(new CustomEvent("atlas:closing-frame"));
}
