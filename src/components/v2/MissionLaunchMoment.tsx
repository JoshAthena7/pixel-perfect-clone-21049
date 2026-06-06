import { useEffect, useState } from "react";

const LAUNCH_LINES = [
  "Before there were platforms, there were rooms.",
  "Athena is watching. Atlas is holding. The work begins.",
  "Every mission is carried by the Collective. This one is yours.",
  "The owl sees in the dark. So does IRIS.",
];

type Phase = "rise" | "line" | "live" | "fade";

/**
 * MissionLaunchMoment — full-screen, atmospheric.
 * ATLAS wordmark → Collective line → live message → fade to mission room.
 * Not a confirmation. A launch.
 */
export function MissionLaunchMoment({
  missionName,
  onComplete,
}: {
  missionName: string;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("rise");
  const [line] = useState(
    () => LAUNCH_LINES[Math.floor(Math.random() * LAUNCH_LINES.length)],
  );

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("line"), 1100);
    const t2 = setTimeout(() => setPhase("live"), 3200);
    const t3 = setTimeout(() => setPhase("fade"), 5400);
    const t4 = setTimeout(() => onComplete(), 6300);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
    };
  }, [onComplete]);

  return (
    <div
      className={`mlm-root ${phase === "fade" ? "mlm-out" : ""}`}
      role="dialog"
      aria-label="Mission launch"
    >
      <div className="mlm-glow" aria-hidden />
      <div className="mlm-center">
        <div className="mlm-wordmark">ATLAS</div>
        <div className="mlm-rule" aria-hidden />

        <div className={`mlm-line ${phase === "rise" ? "mlm-hidden" : ""}`}>
          {line}
        </div>

        <div
          className={`mlm-live ${phase === "live" || phase === "fade" ? "" : "mlm-hidden"}`}
        >
          <div className="mlm-mission">{missionName}</div>
          <div className="mlm-status">
            The mission is live. IRIS is ready. Your team has been notified.
          </div>
        </div>
      </div>

      <style>{`
        .mlm-root {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at center, #0a1525 0%, #04070d 70%, #000 100%);
          animation: mlm-in 700ms ease-out both;
        }
        .mlm-out { animation: mlm-out 900ms ease-in both; }
        @keyframes mlm-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mlm-out { from { opacity: 1; } to { opacity: 0; } }

        .mlm-glow {
          position: absolute;
          width: 60vmin;
          height: 60vmin;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(196,154,34,0.18) 0%,
            rgba(196,154,34,0.06) 35%,
            transparent 70%
          );
          filter: blur(20px);
          animation: mlm-glow-pulse 4.5s ease-in-out infinite;
        }
        @keyframes mlm-glow-pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50%      { transform: scale(1.08); opacity: 1; }
        }

        .mlm-center {
          position: relative;
          z-index: 1;
          text-align: center;
          padding: 0 24px;
          max-width: 720px;
        }

        .mlm-wordmark {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: clamp(56px, 11vmin, 128px);
          font-weight: 500;
          letter-spacing: 0.4em;
          color: #f3e9c8;
          text-shadow: 0 0 40px rgba(196,154,34,0.5);
          animation: mlm-wordmark 1400ms cubic-bezier(0.16, 1, 0.3, 1) both;
          padding-left: 0.4em; /* center optical balance for tracking */
        }
        @keyframes mlm-wordmark {
          from { opacity: 0; transform: translateY(20px) scale(0.96); letter-spacing: 0.6em; }
          to   { opacity: 1; transform: translateY(0) scale(1);       letter-spacing: 0.4em; }
        }

        .mlm-rule {
          width: 80px;
          height: 1px;
          margin: 28px auto;
          background: linear-gradient(90deg, transparent, rgba(196,154,34,0.6), transparent);
          animation: mlm-rule 1200ms ease-out 400ms both;
        }
        @keyframes mlm-rule {
          from { width: 0; opacity: 0; }
          to   { width: 80px; opacity: 1; }
        }

        .mlm-line {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-style: italic;
          font-size: clamp(18px, 2.4vmin, 26px);
          color: rgba(243,233,200,0.85);
          line-height: 1.5;
          transition: opacity 1100ms ease-out, transform 1100ms ease-out;
        }
        .mlm-line.mlm-hidden { opacity: 0; transform: translateY(8px); }
        .mlm-line:not(.mlm-hidden) { opacity: 1; transform: translateY(0); }

        .mlm-live {
          margin-top: 56px;
          transition: opacity 1200ms ease-out, transform 1200ms ease-out;
        }
        .mlm-live.mlm-hidden { opacity: 0; transform: translateY(12px); }
        .mlm-live:not(.mlm-hidden) { opacity: 1; transform: translateY(0); }

        .mlm-mission {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: #C49A22;
          margin-bottom: 10px;
        }
        .mlm-status {
          font-size: clamp(13px, 1.8vmin, 16px);
          color: rgba(255,255,255,0.78);
          letter-spacing: 0.02em;
        }

        @media (prefers-reduced-motion: reduce) {
          .mlm-root, .mlm-out, .mlm-glow, .mlm-wordmark, .mlm-rule,
          .mlm-line, .mlm-live { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}

export default MissionLaunchMoment;
